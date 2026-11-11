import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceInspector } from '../components/EvidenceInspector';
import { ReconstructView, VerifyView } from '../components/WorkspaceStageViews';
import type { Claim } from '../lib/domain/types';

const claim = (id: string, category: Claim['category'], status: Claim['status'] = 'VERIFIED'): Claim => ({
  id, topic: `${category}-${id}`, category,
  statement: `Finding ${id}: the source record contains a detailed handover note.`,
  status, citations: [{
    sourceId: `source-${id}`, sourceTitle: `Source ${id}`, sourceKind: 'document',
    occurredAt: '2026-11-11T00:00:00.000Z', author: 'Project lead',
    excerpt: `The exact supporting passage for finding ${id}.`, clearance: 1,
  }], clearance: 1, alternatives: [],
});

test('reconstruction findings remain in a named keyboard-scrollable list', () => {
  const html = renderToStaticMarkup(createElement(ReconstructView, {
    claims: Array.from({ length: 18 }, (_, index) => claim(`d${index}`, 'decision')),
    sources: [], onContinue() {}, onExtract() {}, onOpenFinding() {},
    extracting: false, extractionMode: 'deterministic',
  }));

  assert.match(html, /class="reconstruction-list record-scroll timeline"/);
  assert.match(html, /tabindex="0" aria-label="Decisions findings"/);
});

test('conflicts and gaps each scroll independently under their headings', () => {
  const html = renderToStaticMarkup(createElement(VerifyView, {
    projectId: '20000000-0000-4000-8000-000000000011',
    conflicts: [claim('c1', 'risk', 'CONFLICT')], gaps: [claim('g1', 'blocker', 'MISSING EVIDENCE')],
    onOpenReview() {}, onOpenClaim() {},
  }));

  assert.match(html, /class="verify-list record-scroll"[^>]*tabindex="0"[^>]*aria-label="Conflicting records"/);
  assert.match(html, /class="verify-list record-scroll"[^>]*tabindex="0"[^>]*aria-label="Missing evidence"/);
});

test('source citations are grouped in a named keyboard-scrollable region', () => {
  const detail = claim('evidence', 'decision');
  detail.citations = Array.from({ length: 16 }, (_, index) => ({
    ...detail.citations[0], sourceId: `source-${index}`, sourceTitle: `Long source record ${index}`,
  }));
  const html = renderToStaticMarkup(createElement(EvidenceInspector, { claim: detail }));

  assert.match(html, /class="citation-list record-scroll"[^>]*role="region"[^>]*tabindex="0"[^>]*aria-label="Source citations"/);
});
