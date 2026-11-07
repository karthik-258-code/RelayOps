import type { HandoverState } from "./types";

const storageKey = "relayops.workspace.v1";

export function browserStorageAvailable(): boolean {
  try {
    const storage = window.localStorage;
    const probeKey = `${storageKey}.probe`;
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

export function readSavedWorkspace(): HandoverState | null {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || (parsed as { schemaVersion?: unknown }).schemaVersion !== 1) return null;
    const candidate = parsed as HandoverState;
    if (!Array.isArray(candidate.sources) || !Array.isArray(candidate.claims) || !candidate.reviews) return null;
    return candidate;
  } catch {
    return null;
  }
}

export function saveWorkspace(project: HandoverState): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedWorkspace(): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Reset still works in memory when browser storage is unavailable.
  }
}
