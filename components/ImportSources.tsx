"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";
import type { SourceRecord } from "@/lib/domain/types";
import { parseWorkspaceFiles } from "@/lib/ingestion/parse-workspace";

export function ImportSources({ onImport }: { onImport: (sources: SourceRecord[], names: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const selected = Array.from(files);
      const sources = await parseWorkspaceFiles(selected);
      onImport(sources, selected.map((file) => file.name));
      setMessage(`${sources.length} source${sources.length === 1 ? "" : "s"} added.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read these files.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <div className="import-control">
    <input ref={inputRef} className="visually-hidden" type="file" accept=".md,.json,text/markdown,application/json" multiple onChange={(event) => void handleFiles(event.target.files)} aria-label="Choose Markdown or JSON source files" />
    <button className="button button-secondary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}><Icon name="upload" />{busy ? "Reading files…" : "Add sources"}</button>
    {message && <span className="sr-status" role="status">{message}</span>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
