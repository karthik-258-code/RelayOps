export type GitHubImportReceipt = {
  repository: string;
  imported: number;
  findings: number;
  message: string;
  notices?: string[];
};

export async function submitGitHubImport(
  projectId: string,
  url: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<GitHubImportReceipt> {
  const response = await fetcher(`/api/v1/projects/${projectId}/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...(token ? { token } : {}) }),
  });

  let payload: GitHubImportReceipt | { error?: { message?: string } };
  try {
    payload = await response.json();
  } catch {
    throw new Error('The server returned a blocked or invalid response. Retry the import; if it continues, share the request status with your project lead.');
  }

  if (!response.ok) {
    throw new Error('error' in payload ? payload.error?.message ?? 'GitHub import failed.' : 'GitHub import failed.');
  }

  if (!('repository' in payload) || !('message' in payload)) {
    throw new Error('GitHub returned an incomplete import receipt. No completion was confirmed.');
  }
  return payload;
}
