import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { extractorHealthMessage, ExtractorHealthView, ReconstructView } from '../components/WorkspaceStageViews';
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

test('renders extraction progress as a viewport dock while work is active', () => {
  const html = renderProgress({
    type: 'progress', stage: 'extracting_batch',
    message: 'Sending extraction batch 1 of 5 to Nebius.',
    batchIndex: 1, batchTotal: 5, completedBatches: 0,
  });

  assert.match(html, /class="stage-page reconstruct-page extracting"/);
  assert.match(html, /class="extraction-progress-panel extraction-progress-dock"/);
});

test('keeps health guidance present through checking, ready, offline, and missing-key states', () => {
  assert.equal(extractorHealthMessage('checking'), 'Checking extractor connection…');
  assert.equal(extractorHealthMessage('ready'), 'Connected and ready for Nebius extraction.');
  assert.equal(extractorHealthMessage('unreachable'), 'Extractor is sleeping or unreachable. Open its health check to wake it, then recheck here.');
  assert.equal(extractorHealthMessage('missing_key'), 'Extractor is online, but its Nebius key is not configured.');

  const html = renderProgress({ type: 'progress', stage: 'preparing', message: 'Preparing.' });
  assert.match(html, /class="extractor-health-help"/);
  assert.match(html, /Checking extractor connection/);

  const offline = renderToStaticMarkup(createElement(ExtractorHealthView, {
    healthState: 'unreachable', onRecheck() {},
  }));
  assert.match(offline, /Extractor not reachable/);
  assert.match(offline, /Open health check/);
  assert.match(offline, /sleeping or unreachable/);
  assert.match(offline, /Recheck/);
  assert.match(offline, /extractor-health-help--error/);
});
