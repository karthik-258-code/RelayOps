export type GitHubRepository = {
  owner: string;
  repo: string;
};

export type RepositoryUrlResult =
  | { ok: true; value: GitHubRepository }
  | { ok: false; reason: string };

const componentPattern = /^[A-Za-z0-9_.-]+$/;

export function parseGitHubRepositoryUrl(input: string): RepositoryUrlResult {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "Enter a valid GitHub repository URL." };
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return { ok: false, reason: "Use an HTTPS URL from github.com." };
  }

  let segments: string[];
  try {
    segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return { ok: false, reason: "The repository URL contains invalid path encoding." };
  }

  if (segments.length !== 2) {
    return { ok: false, reason: "Use a repository URL in the form github.com/owner/repository." };
  }

  const [owner, rawRepo] = segments;
  const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;

  if (!componentPattern.test(owner) || !componentPattern.test(repo)) {
    return { ok: false, reason: "The repository URL contains an invalid owner or repository name." };
  }

  return { ok: true, value: { owner, repo } };
}
