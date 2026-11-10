import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReconstructView } from '../components/WorkspaceStageViews';
import type { ExtractionProgressEvent } from '../lib/extraction/progress';

function renderProgress(progress: ExtractionProgressEvent) {
  return renderToStaticMarkup(createElement(ReconstructView, {
    claims: [],
    sources: [],
    onContinue() {},
    onExtract() {},
    onOpenFinding() {},
    extracting: true,
    extractionMode: 'deterministic',
    extractionProgress: progress,
  }));
}

test('renders accessible completed-batch progress and elapsed provider activity', () => {
  const html = renderProgress({
    type: 'progress', stage: 'extracting_batch',
    message: 'Sending extraction batch 2 of 4 to Nebius. Still processing.',
    batchIndex: 2, batchTotal: 4, completedBatches: 1, elapsedSeconds: 24, heartbeat: true,
  });

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Batch 2 of 4/);
  assert.match(html, /1 of 4 batches complete/);
  assert.match(html, /<progress[^>]*value="1"[^>]*max="4"/);
  assert.match(html, /00:24/);
  assert.match(html, /Still processing/);
});

test('shows indeterminate activity for pre-batch stages without inventing a progress value', () => {
  const html = renderProgress({
    type: 'progress', stage: 'loading_evidence', message: 'Loading saved source passages for this project.',
  });

  assert.match(html, /Loading saved source passages for this project/);
  assert.match(html, /extraction-progress-indeterminate/);
  assert.doesNotMatch(html, /<progress/);
});
