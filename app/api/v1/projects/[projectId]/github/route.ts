import { createHash } from 'node:crypto';
import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { parseMarkdownSource } from '@/lib/ingestion/parse-workspace';
import { parseGitHubRepositoryUrl } from '@/lib/github/repository';
import { detectOrphanedOwnership } from '@/lib/reconstruction/orphaned-ownership';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { persistSourceBatch } from '@/lib/server/persist-source-batch';
import type { SourceRecord } from '@/lib/domain/types';

const bodySchema = z.object({ url: z.string().url().max(500), token: z.string().max(500).optional() }).strict();
const maxBodyLength = 20_000;
const maxSources = 50;
const pageSize = 5;

function toSource(id: string, title: string, kind: SourceRecord['kind'], author: string, date: string, url: string, body: string): SourceRecord {
  const markdown = `# ${title}\n\n${body || title}`.slice(0, maxBodyLength);
  const parsed = parseMarkdownSource(`${id}.md`, markdown);
  const observations = parsed.observations.slice(0, 250).map((observation) => ({
    ...observation,
    topic: observation.topic.slice(0, 120),
    statement: observation.statement.slice(0, 1000),
    value: observation.value.slice(0, 300),
    ...(observation.excerpt ? { excerpt: observation.excerpt.slice(0, 4000) } : {}),
  }));
  return { ...parsed, id, title, url, kind, author, occurredAt: date, clearance: 1, content: markdown, observations };
}

async function readPages<T>(fetchPage: (page: number) => Promise<{ data: T[] }>, limit: number) {
  const items: T[] = [];
  for (let page = 1; items.length < limit; page += 1) {
    const { data } = await fetchPage(page);
    items.push(...data.slice(0, limit - items.length));
    if (data.length < pageSize) break;
  }
  return items;
}

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before connecting a GitHub repository.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  if (!['lead', 'reviewer'].includes(access.role)) return jsonError(403, 'SOURCE_MANAGER_REQUIRED', 'A project lead or reviewer must connect repositories.');

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError(400, 'INVALID_JSON', 'GitHub connection request must be valid JSON.'); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError(422, 'INVALID_GITHUB_REQUEST', 'Enter a valid HTTPS GitHub repository URL.');
  const repository = parseGitHubRepositoryUrl(parsed.data.url);
  if (!repository.ok) return jsonError(422, 'INVALID_GITHUB_URL', repository.reason);
  const token = parsed.data.token?.trim() || process.env.GITHUB_TOKEN;
  const octokit = new Octokit({ ...(token ? { auth: token } : {}), userAgent: 'RelayOps-Handover/1.0', request: { timeout: 15_000 } });
  const { owner, repo } = repository.value;

  try {
    const { data: repositoryInfo } = await octokit.rest.repos.get({ owner, repo });
    const sources: SourceRecord[] = [];
    const notices: string[] = [];
    const addSource = (source: SourceRecord) => {
      if (sources.length >= maxSources) return false;
      sources.push(source);
      return true;
    };
    const partial = (label: string) => notices.push(`${label} were unavailable; other readable repository records were kept.`);

    try {
      const { data: readme } = await octokit.rest.repos.getReadme({ owner, repo });
      if (readme.type === 'file' && 'content' in readme) {
        const content = Buffer.from(readme.content, 'base64').toString('utf8');
        addSource(toSource(`github:${owner}/${repo}:readme`, `${repositoryInfo.name} README`, 'repository', readme.name, repositoryInfo.updated_at ?? new Date().toISOString(), readme.html_url ?? repositoryInfo.html_url, content));
      }
    } catch { partial('Repository README'); }

    const [issueResult, pullResult, commitResult, rootResult, docsResult] = await Promise.allSettled([
      readPages((page) => octokit.rest.issues.listForRepo({ owner, repo, state: 'all', sort: 'updated', direction: 'desc', per_page: pageSize, page }), 8),
      readPages((page) => octokit.rest.pulls.list({ owner, repo, state: 'all', sort: 'updated', direction: 'desc', per_page: pageSize, page }), 8),
      readPages((page) => octokit.rest.repos.listCommits({ owner, repo, per_page: pageSize, page }), 40),
      octokit.rest.repos.getContent({ owner, repo, path: '' }),
      octokit.rest.repos.getContent({ owner, repo, path: 'docs' }),
    ]);
    if (issueResult.status === 'rejected') partial('GitHub issues');
    if (pullResult.status === 'rejected') partial('GitHub pull requests');
    if (commitResult.status === 'rejected') partial('Git history');
    if (rootResult.status === 'rejected') partial('Root documentation');
    if (docsResult.status === 'rejected') partial('Docs folder');

    const issues = issueResult.status === 'fulfilled' ? issueResult.value.filter((item) => !('pull_request' in item)).slice(0, 6) : [];
    const pulls = pullResult.status === 'fulfilled' ? pullResult.value.slice(0, 6) : [];
    const commits = commitResult.status === 'fulfilled' ? commitResult.value.slice(0, 20) : [];
    const rootFiles = rootResult.status === 'fulfilled' && Array.isArray(rootResult.value.data) ? rootResult.value.data : [];
    const docsFiles = docsResult.status === 'fulfilled' && Array.isArray(docsResult.value.data) ? docsResult.value.data : [];
    const docs = [...rootFiles, ...docsFiles]
      .filter((file) => file.type === 'file' && /\.(md|mdx)$/i.test(file.name) && file.name.toLowerCase() !== 'readme.md')
      .slice(0, 6);

    for (const [commitIndex, commit] of commits.entries()) {
      const sha = commit.sha;
      const title = commit.commit.message.split('\n', 1)[0].slice(0, 200) || 'Repository commit';
      addSource(toSource(`github:${owner}/${repo}:commit:${sha}`, `Commit ${sha.slice(0, 7)}: ${title}`, 'repository', commit.author?.login ?? commit.commit.author?.name ?? 'Unknown', commit.commit.author?.date ?? new Date().toISOString(), `${repositoryInfo.html_url}/commit/${sha}`, commit.commit.message));
      if (commitIndex < 4) {
        try {
          const { data: detail } = await octokit.rest.repos.getCommit({ owner, repo, ref: sha });
          const diff = (detail.files ?? []).slice(0, 8).map((file) => `### ${file.filename} (${file.status})\n${file.patch ?? '[Diff unavailable for this file]'}`).join('\n\n').slice(0, maxBodyLength);
          if (diff) addSource(toSource(`github:${owner}/${repo}:commit:${sha}:diff`, `Commit ${sha.slice(0, 7)} changed-file diff`, 'repository', detail.author?.login ?? detail.commit.author?.name ?? 'Unknown', detail.commit.author?.date ?? new Date().toISOString(), `${repositoryInfo.html_url}/commit/${sha}`, diff));
        } catch { partial(`Commit ${sha.slice(0, 7)} diff`); }
      }
    }

    for (const issue of issues) {
      const issueId = `github:${owner}/${repo}#${issue.number}`;
      addSource(toSource(issueId, `Issue #${issue.number}: ${issue.title}`, 'task', issue.user?.login ?? 'Unknown', issue.updated_at, issue.html_url, issue.body ?? ''));
    }
    for (const pull of pulls) {
      const pullId = `github:${owner}/${repo}!${pull.number}`;
      addSource(toSource(pullId, `Pull request #${pull.number}: ${pull.title}`, 'repository', pull.user?.login ?? 'Unknown', pull.updated_at, pull.html_url, pull.body ?? ''));
    }

    for (const file of docs) {
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path: file.path, ref: repositoryInfo.default_branch });
        if (!Array.isArray(data) && data.type === 'file' && 'content' in data && data.encoding === 'base64') {
          const pathId = createHash('sha256').update(file.path).digest('hex').slice(0, 32);
          addSource(toSource(`github:${owner}/${repo}:file:${pathId}`, `Documentation: ${file.path}`.slice(0, 240), 'document', owner, repositoryInfo.updated_at ?? new Date().toISOString(), data.html_url ?? `${repositoryInfo.html_url}/blob/${repositoryInfo.default_branch}/${file.path}`, Buffer.from(data.content, 'base64').toString('utf8')));
        }
      } catch { partial(`Documentation file ${file.path}`); }
    }

    // Import a small, bounded discussion/review sample with parent IDs in every title and link.
    for (const issue of issues.slice(0, 3)) {
      try {
        const comments = await readPages((page) => octokit.rest.issues.listComments({ owner, repo, issue_number: issue.number, per_page: pageSize, page }), 2);
        for (const comment of comments) addSource(toSource(`github:${owner}/${repo}#${issue.number}:comment:${comment.id}`, `Issue #${issue.number} comment`, 'discussion', comment.user?.login ?? 'Unknown', comment.updated_at ?? comment.created_at, comment.html_url ?? issue.html_url, comment.body ?? ''));
      } catch { partial(`Issue #${issue.number} discussion`); }
    }
    for (const pull of pulls.slice(0, 3)) {
      try {
        const [reviews, conversation, reviewComments, files] = await Promise.allSettled([
          readPages((page) => octokit.rest.pulls.listReviews({ owner, repo, pull_number: pull.number, per_page: pageSize, page }), 2),
          readPages((page) => octokit.rest.issues.listComments({ owner, repo, issue_number: pull.number, per_page: pageSize, page }), 2),
          readPages((page) => octokit.rest.pulls.listReviewComments({ owner, repo, pull_number: pull.number, per_page: pageSize, page }), 2),
          readPages((page) => octokit.rest.pulls.listFiles({ owner, repo, pull_number: pull.number, per_page: pageSize, page }), 8),
        ]);
        if (files.status === 'fulfilled' && files.value.length) {
          const diff = files.value.map((file) => `### ${file.filename} (${file.status})\n${file.patch ?? '[Diff unavailable for this file]'}`).join('\n\n').slice(0, maxBodyLength);
          addSource(toSource(`github:${owner}/${repo}!${pull.number}:diff`, `Pull request #${pull.number} changed-file diff`, 'repository', pull.user?.login ?? 'Unknown', pull.updated_at, `${pull.html_url}/files`, diff));
        } else if (files.status === 'rejected') partial(`Pull request #${pull.number} file diff`);
        if (reviews.status === 'fulfilled') for (const review of reviews.value) addSource(toSource(`github:${owner}/${repo}!${pull.number}:review:${review.id}`, `Pull request #${pull.number} review · ${review.state}`, 'discussion', review.user?.login ?? 'Unknown', review.submitted_at ?? pull.updated_at, review.html_url ?? pull.html_url, review.body ?? `Review state: ${review.state}`));
        else partial(`Pull request #${pull.number} reviews`);
        if (conversation.status === 'fulfilled') for (const comment of conversation.value) addSource(toSource(`github:${owner}/${repo}!${pull.number}:comment:${comment.id}`, `Pull request #${pull.number} discussion`, 'discussion', comment.user?.login ?? 'Unknown', comment.updated_at ?? comment.created_at, comment.html_url ?? pull.html_url, comment.body ?? ''));
        else partial(`Pull request #${pull.number} discussion`);
        if (reviewComments.status === 'fulfilled') for (const comment of reviewComments.value) addSource(toSource(`github:${owner}/${repo}!${pull.number}:review-comment:${comment.id}`, `Pull request #${pull.number} code review comment · ${comment.path}`, 'discussion', comment.user?.login ?? 'Unknown', comment.updated_at ?? comment.created_at, comment.html_url ?? pull.html_url, [comment.body, comment.diff_hunk].filter(Boolean).join('\n\n')));
        else partial(`Pull request #${pull.number} code review comments`);
      } catch { partial(`Pull request #${pull.number} review context`); }
    }

    if (!sources.length) return jsonError(422, 'NO_IMPORTABLE_CONTENT', 'This repository has no readable README, documentation, commits, issues, or pull requests.');
    if (sources.length >= maxSources) notices.push(`Import capped at ${maxSources} records to keep the handover reviewable. Re-run after narrowing the repository scope if needed.`);
    for (const signal of detectOrphanedOwnership(sources)) {
      const topic = `orphaned-owner-${signal.author.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`;
      const statement = `${signal.author} authored ${signal.commitCount} of ${signal.totalCommits} imported commits (${Math.round(signal.share * 100)}%) in the last 14 days, but no linked documentation, task, or discussion names them. Confirm whether critical knowledge is undocumented.`;
      for (const source of sources) {
        if (!signal.sourceIds.includes(source.id)) continue;
        const excerpt = source.content.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'))?.trim() ?? source.title;
        source.observations.push({ topic, category: 'ownership', statement, value: `${signal.author.toLocaleLowerCase()}:${signal.commitCount}/${signal.totalCommits}`, excerpt, evidenceGap: true });
      }
    }
    const repository = `${owner}/${repo}`;
    const savedResponse = await persistSourceBatch(projectId, access.clearance, {
      sources,
      names: [`${repository} (GitHub)`, ...notices.map((notice) => `Partial import: ${notice}`)],
    });
    if (!savedResponse.ok) return savedResponse;
    const saved = await savedResponse.json();
    return Response.json({ repository, imported: saved.imported, findings: saved.findings, message: saved.message, notices }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (caught) {
    const status = typeof caught === 'object' && caught && 'status' in caught ? Number(caught.status) : 0;
    if (status === 401 || status === 403) return jsonError(status, status === 403 ? 'GITHUB_RATE_LIMITED' : 'GITHUB_AUTH_FAILED', status === 403 ? 'GitHub rate limit or token permissions blocked this import. Try a fine-grained read-only token.' : 'GitHub rejected the provided token. Check its repository access and read-only permissions.');
    if (status === 404) return jsonError(404, 'GITHUB_REPOSITORY_NOT_FOUND', 'Repository was not found or is private. Add a fine-grained read-only token with access to this repository.');
    return jsonError(502, 'GITHUB_UNAVAILABLE', 'GitHub could not be reached. Check the URL and network, then retry.');
  }
}
