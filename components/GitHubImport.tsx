'use client';

import { FormEvent, useState } from 'react';
import type { SourceRecord } from '@/lib/domain/types';

export function GitHubImport({ projectId, onImport }: { projectId: string; onImport: (sources: SourceRecord[], names: string[]) => Promise<void> }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...(token ? { token } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'GitHub import failed.');
      await onImport(result.sources as SourceRecord[], [`${result.repository} (GitHub)`, ...(result.notices ?? []).map((notice: string) => `Partial import: ${notice}`)]);
      setToken('');
      setUrl('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GitHub could not be connected.');
    } finally { setBusy(false); }
  }

  return <form className="github-import-card" onSubmit={(event) => void connect(event)}>
    <div className="github-import-heading"><span className="github-import-icon" aria-hidden="true">⌘</span><div><strong>Connect a GitHub repository</strong><p>Bring in docs, commit and PR diffs, issues, reviews, and discussion context.</p></div></div>
    <label className="visually-hidden" htmlFor="github-repository-url">GitHub repository URL</label>
    <input id="github-repository-url" type="url" required placeholder="https://github.com/owner/repository" value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="url" />
    <details className="github-private-access"><summary>Need private repository access?</summary><label htmlFor="github-read-token">Fine-grained read-only token</label><input id="github-read-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste for this import only" /><small>Read access to repository Metadata, Contents, Issues, and Pull requests. Cleared after import; never saved.</small></details>
    {error && <p className="github-import-error" role="alert">{error}</p>}
    <button className="button button-secondary" type="submit" disabled={busy}>{busy ? 'Reading repository…' : 'Import repository'} <span aria-hidden="true">↗</span></button>
  </form>;
}
