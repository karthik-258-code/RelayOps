export type ExtractionProgressStage =
  | 'preparing'
  | 'checking_extractor'
  | 'loading_evidence'
  | 'extracting_batch'
  | 'validating_citations'
  | 'saving_findings'
  | 'saving_embeddings'
  | 'completed'
  | 'failed';

export type ExtractionProgressEvent = {
  type: 'progress';
  stage: ExtractionProgressStage;
  message: string;
  batchIndex?: number;
  batchTotal?: number;
  completedBatches?: number;
  elapsedSeconds?: number;
  heartbeat?: boolean;
};

export type ExtractionCompletionSummary = {
  message: string;
  notices: string[];
  findings: number;
  rejectedFacts: number;
  embeddingCount: number;
  model: string;
};

export type ExtractionTerminalEvent =
  | { type: 'completed'; result: ExtractionCompletionSummary }
  | { type: 'failed'; error: { code: string; message: string } };

export type ExtractionStreamEvent = ExtractionProgressEvent | ExtractionTerminalEvent;

const progressStages = new Set<ExtractionProgressStage>([
  'preparing', 'checking_extractor', 'loading_evidence', 'extracting_batch',
  'validating_citations', 'saving_findings', 'saving_embeddings', 'completed', 'failed',
]);

const encoder = new TextEncoder();

export function encodeExtractionEvent(event: ExtractionStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function createBatchProgressReporter(
  initialTotal: number,
  report: (event: ExtractionProgressEvent) => void,
) {
  if (!Number.isInteger(initialTotal) || initialTotal < 0) throw new RangeError('Initial batch total must be a nonnegative integer.');
  let completed = 0;
  let total = initialTotal;

  function emit(message: string, batchIndex: number, completedBatches: number) {
    report({ type: 'progress', stage: 'extracting_batch', message, batchIndex, batchTotal: total, completedBatches });
  }

  return {
    start(message: string) {
      if (completed >= total) throw new RangeError('No extraction batch remains to start.');
      emit(message, completed + 1, completed);
    },
    split(replacementCount: number, message: string) {
      if (!Number.isInteger(replacementCount) || replacementCount < 2 || completed >= total) {
        throw new RangeError('A pending batch can only be replaced by two or more smaller batches.');
      }
      total += replacementCount - 1;
      emit(message, completed + 1, completed);
    },
    complete(message: string) {
      if (completed >= total) throw new RangeError('No pending extraction batch can be completed.');
      completed += 1;
      emit(message, completed, completed);
    },
    snapshot() {
      return { completed, total };
    },
  };
}

function isProgressEvent(event: unknown): event is ExtractionProgressEvent {
  if (!event || typeof event !== 'object') return false;
  const candidate = event as Record<string, unknown>;
  return candidate.type === 'progress'
    && typeof candidate.stage === 'string'
    && progressStages.has(candidate.stage as ExtractionProgressStage)
    && typeof candidate.message === 'string'
    && candidate.message.length <= 500
    && (candidate.batchIndex === undefined || (Number.isInteger(candidate.batchIndex) && Number(candidate.batchIndex) > 0))
    && (candidate.batchTotal === undefined || (Number.isInteger(candidate.batchTotal) && Number(candidate.batchTotal) > 0))
    && (candidate.completedBatches === undefined || (Number.isInteger(candidate.completedBatches) && Number(candidate.completedBatches) >= 0
      && (candidate.batchTotal === undefined || Number(candidate.completedBatches) <= Number(candidate.batchTotal))))
    && (candidate.elapsedSeconds === undefined || (Number.isFinite(candidate.elapsedSeconds) && Number(candidate.elapsedSeconds) >= 0))
    && (candidate.heartbeat === undefined || typeof candidate.heartbeat === 'boolean');
}

function isTerminalEvent(event: unknown): event is ExtractionTerminalEvent {
  if (!event || typeof event !== 'object') return false;
  const candidate = event as Record<string, unknown>;
  if (candidate.type === 'failed') {
    const error = candidate.error;
    if (!error || typeof error !== 'object') return false;
    const details = error as Record<string, unknown>;
    return typeof details.code === 'string' && details.code.length > 0 && details.code.length <= 80
      && typeof details.message === 'string' && details.message.length > 0 && details.message.length <= 500;
  }
  if (candidate.type !== 'completed' || !candidate.result || typeof candidate.result !== 'object') return false;
  const result = candidate.result as Record<string, unknown>;
  return typeof result.message === 'string'
    && Array.isArray(result.notices) && result.notices.every((notice) => typeof notice === 'string')
    && Number.isInteger(result.findings) && Number(result.findings) >= 0
    && Number.isInteger(result.rejectedFacts) && Number(result.rejectedFacts) >= 0
    && Number.isInteger(result.embeddingCount) && Number(result.embeddingCount) >= 0
    && typeof result.model === 'string';
}

export async function consumeExtractionEventStream(
  response: Response,
  onProgress: (event: ExtractionProgressEvent) => void,
): Promise<ExtractionTerminalEvent> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') || !response.body) {
    throw new Error('The extraction progress stream was unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal: ExtractionTerminalEvent | undefined;

  function handleFrame(frame: string) {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (terminal) throw new Error('The extraction service sent progress after its terminal event.');
    let event: unknown;
    try { event = JSON.parse(data); }
    catch { throw new Error('The extraction service sent an invalid progress event.'); }
    if (isProgressEvent(event)) {
      onProgress(event);
      return;
    }
    if (isTerminalEvent(event) && !terminal) {
      terminal = event;
      return;
    }
    throw new Error('The extraction service sent an unsupported progress event.');
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) handleFrame(frame);
      if (done) break;
    }
    if (buffer.trim()) handleFrame(buffer);
    if (!terminal) throw new Error('The extraction stream ended before extraction completed.');
    return terminal;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function consumeExtractionResponse(
  response: Response,
  onProgress: (event: ExtractionProgressEvent) => void,
): Promise<ExtractionCompletionSummary> {
  if (response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
    const terminal = await consumeExtractionEventStream(response, onProgress);
    if (terminal.type === 'failed') throw new Error(terminal.error.message);
    return terminal.result;
  }

  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const error = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).error : null;
    const message = error && typeof error === 'object' ? (error as Record<string, unknown>).message : null;
    throw new Error(typeof message === 'string' ? message : 'Nebius extraction could not run.');
  }
  if (!payload || typeof payload !== 'object') throw new Error('The extraction service returned an unexpected response.');
  const result = payload as Record<string, unknown>;
  if (typeof result.message !== 'string'
    || !Array.isArray(result.notices) || !result.notices.every((notice) => typeof notice === 'string')
    || !Number.isInteger(result.findings) || Number(result.findings) < 0
    || !Number.isInteger(result.rejectedFacts) || Number(result.rejectedFacts) < 0
    || !Number.isInteger(result.embeddingCount) || Number(result.embeddingCount) < 0
    || typeof result.model !== 'string') {
    throw new Error('The extraction service returned an unexpected response.');
  }
  return {
    message: result.message,
    notices: result.notices as string[],
    findings: Number(result.findings),
    rejectedFacts: Number(result.rejectedFacts),
    embeddingCount: Number(result.embeddingCount),
    model: result.model,
  };
}
