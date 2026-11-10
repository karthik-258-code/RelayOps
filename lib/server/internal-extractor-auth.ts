import { timingSafeEqual } from 'node:crypto';

export function hasValidExtractorKey(provided: string | null, configured: string | undefined): boolean {
  if (!provided || !configured) return false;
  const providedBytes = Buffer.from(provided);
  const configuredBytes = Buffer.from(configured);
  return providedBytes.length === configuredBytes.length && timingSafeEqual(providedBytes, configuredBytes);
}
