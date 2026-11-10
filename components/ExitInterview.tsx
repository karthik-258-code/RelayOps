"use client";

import { useState, type FormEvent } from "react";
import type { Claim } from "@/lib/domain/types";
import { interviewPromptFor } from "@/lib/domain/interview-prompts";
import { Icon } from "./icons";

export function ExitInterview({ claim, busy, onSubmit }: {
  claim: Claim;
  busy: boolean;
  onSubmit: (claimId: string, response: string) => Promise<void>;
}) {
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = response.trim();
    if (!answer) return;
    setError("");
    try {
      await onSubmit(claim.id, answer);
      setResponse("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The response could not be saved.");
    }
  }

  return <form className="exit-interview" onSubmit={submit} aria-labelledby="exit-interview-title">
    <div className="exit-interview-heading"><span className="exit-interview-mark"><Icon name="message" /></span><div><p className="panel-kicker">ASK THE DEPARTING CONTRIBUTOR</p><h4 id="exit-interview-title">Fill this evidence gap</h4></div></div>
    <p className="exit-interview-prompt">{interviewPromptFor(claim.category)}</p>
    <label className="field-label" htmlFor={`interview-response-${claim.id}`}>Contributor’s answer</label>
    <textarea id={`interview-response-${claim.id}`} value={response} onChange={(event) => setResponse(event.target.value)} rows={4} maxLength={4000} disabled={busy} placeholder="Capture the contributor’s answer in their own words…" />
    <div className="exit-interview-footer"><span>Saved as source evidence. Reviewer decision still required.</span><button type="submit" className="button button-secondary" disabled={busy || !response.trim()}>{busy ? "Saving…" : "Save answer"} <Icon name="arrow" /></button></div>
    {error && <p className="exit-interview-error" role="alert">{error}</p>}
  </form>;
}
