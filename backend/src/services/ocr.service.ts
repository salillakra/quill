import { createWorker, type Worker } from "tesseract.js";
import { AppError } from "../middleware/error";

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/**
 * tesseract.js workers are single-flight. Ingest BullMQ concurrency is 2
 * (`ingest.worker.ts`), so two jobs must not call recognize() on the same
 * worker at once.
 */
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng").catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

async function discardWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // already dead or never finished initializing
  }
}

async function recognize(imagePath: string): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(imagePath);
  return data.text ?? "";
}

export async function ocrImage(imagePath: string): Promise<string> {
  return serialize(async () => {
    try {
      return await recognize(imagePath);
    } catch {
      // terminate() nulls the thread (`tesseract.js/src/createWorker.js`);
      // a cached wrapper then throws on postMessage. Drop it and retry once.
      await discardWorker();
      try {
        return await recognize(imagePath);
      } catch (err) {
        await discardWorker();
        throw new AppError(422, `OCR failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
}

/** OCR a set of page images, returning text tagged with page markers. */
export async function ocrPages(imagePaths: string[]): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const text = await ocrImage(imagePaths[i]);
    parts.push(`[Page ${i + 1}]\n${text}`);
  }
  return parts.join("\n\n");
}

/** Best-effort shutdown so the worker thread pool exits cleanly. */
export async function shutdownOcr(): Promise<void> {
  await discardWorker();
}
