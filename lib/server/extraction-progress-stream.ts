import {
  encodeExtractionEvent,
  type ExtractionProgressEvent,
  type ExtractionTerminalEvent,
} from '@/lib/extraction/progress';

type ProgressReporter = (event: ExtractionProgressEvent) => void;
type ExtractionRun = (report: ProgressReporter) => Promise<ExtractionTerminalEvent>;

export function createExtractionProgressStream(
  run: ExtractionRun,
  options: { heartbeatMs?: number } = {},
): Response {
  const heartbeatMs = options.heartbeatMs ?? 10_000;
  if (!Number.isFinite(heartbeatMs) || heartbeatMs < 1) throw new RangeError('Heartbeat interval must be positive.');

  let connected = true;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let active: ExtractionProgressEvent = {
        type: 'progress', stage: 'preparing', message: 'Preparing extraction.', elapsedSeconds: 0,
      };
      let activeSince = Date.now();

      const send = (event: ExtractionProgressEvent | ExtractionTerminalEvent) => {
        if (!connected) return;
        try { controller.enqueue(encodeExtractionEvent(event)); }
        catch { connected = false; }
      };
      const report: ProgressReporter = (event) => {
        active = { ...event, elapsedSeconds: 0, heartbeat: false };
        activeSince = Date.now();
        send(active);
      };

      heartbeatTimer = setInterval(() => {
        if (!connected) return;
        const elapsedSeconds = Math.floor((Date.now() - activeSince) / 1000);
        const message = active.stage === 'extracting_batch'
          ? `${active.message} Still processing.`
          : active.message;
        send({ ...active, message, elapsedSeconds, heartbeat: true });
      }, heartbeatMs);

      void (async () => {
        try {
          const terminal = await run(report);
          send(terminal);
        } catch {
          send({
            type: 'failed',
            error: {
              code: 'EXTRACTION_FAILED',
              message: 'Nebius extraction could not finish. Imported evidence remains available for review.',
            },
          });
        } finally {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (connected) {
            try { controller.close(); }
            catch { connected = false; }
          }
        }
      })();
    },
    cancel() {
      connected = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}
