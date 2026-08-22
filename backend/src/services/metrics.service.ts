import { prisma } from "../config/db";
import { redis } from "../config/redis";
import { pineconeStats } from "./pinecone.service";
import { isDemoMode } from "../config/env";

/**
 * In-memory metrics accumulators (scraped on /metrics).
 * In production, replace with prom-client or push to Prometheus Pushgateway.
 */

// Counters
const httpRequestTotal = new Map<string, number>();
const httpRequestDurationMs = new Map<string, number[]>();
const workerStageDurationMs = new Map<string, number[]>();
const r2OperationTotal = new Map<string, number>();
const r2OperationDurationMs = new Map<string, number[]>();
const queueDepth = new Map<string, number>();

function key(...parts: string[]) {
  return parts.join(":");
}

function recordCounter(map: Map<string, number>, k: string, inc = 1) {
  map.set(k, (map.get(k) ?? 0) + inc);
}

function recordLatency(map: Map<string, number[]>, k: string, ms: number) {
  const arr = map.get(k) ?? [];
  arr.push(ms);
  // Keep only last 1000 samples per key
  if (arr.length > 1000) arr.shift();
  map.set(k, arr);
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[idx];
}

/** Record an HTTP request for metrics */
export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  durationMs: number,
) {
  const k = key(method, route, String(status));
  recordCounter(httpRequestTotal, k);
  recordLatency(httpRequestDurationMs, k, durationMs);
}

/** Record a worker stage duration */
export function recordWorkerStage(stage: string, durationMs: number) {
  recordLatency(workerStageDurationMs, stage, durationMs);
}

/** Record an R2 operation */
export function recordR2Operation(op: "put" | "get" | "delete" | "list" | "presign", durationMs: number, success: boolean) {
  const k = key(op, success ? "success" : "error");
  recordCounter(r2OperationTotal, k);
  recordLatency(r2OperationDurationMs, op, durationMs);
}

/** Record queue depth */
export function recordQueueDepth(queueName: string, depth: number) {
  queueDepth.set(queueName, depth);
}

function line(name: string, type: "gauge" | "counter" | "histogram", help: string, value: number, labels?: Record<string, string>) {
  const labelStr = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",")}}`
    : "";
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}${labelStr} ${value}\n`;
}

export async function prometheusText(): Promise<string> {
  const [docs, chunks, jobs, queries, users, papers, submissions] = await Promise.all([
    prisma.document.count(),
    prisma.chunk.count(),
    prisma.job.groupBy({ by: ["status"], _count: true }),
    prisma.queryLog.count(),
    prisma.user.count(),
    prisma.questionPaper.count(),
    prisma.submission.count(),
  ]);

  let redisOk = 0;
  try {
    redisOk = (await redis.ping()) === "PONG" ? 1 : 0;
  } catch {
    redisOk = 0;
  }

  let pineconeOk = 0;
  try {
    await pineconeStats();
    pineconeOk = 1;
  } catch {
    pineconeOk = 0;
  }

  let body = "";
  body += line("quill_up", "gauge", "API process is up", 1);
  body += line("quill_demo_mode", "gauge", "1 if GEMINI_API_KEY is empty", isDemoMode ? 1 : 0);
  body += line("quill_documents_total", "gauge", "Document rows", docs);
  body += line("quill_chunks_total", "gauge", "Chunk rows", chunks);
  body += line("quill_queries_total", "counter", "Ask log rows", queries);
  body += line("quill_users_total", "gauge", "User rows", users);
  body += line("quill_papers_total", "gauge", "Question paper rows", papers);
  body += line("quill_submissions_total", "gauge", "Submission rows", submissions);
  body += line("quill_redis_up", "gauge", "Redis ping", redisOk);
  body += line("quill_pinecone_up", "gauge", "Pinecone describeIndexStats", pineconeOk);
  for (const row of jobs) {
    body += line("quill_jobs", "gauge", "Jobs by status", row._count, { status: row.status });
  }

  // HTTP request metrics
  for (const [k, count] of httpRequestTotal) {
    const [method, route, status] = k.split(":");
    body += line("quill_http_requests_total", "counter", "HTTP requests total", count, { method, route, status });
  }
  for (const [k, latencies] of httpRequestDurationMs) {
    const [method, route, status] = k.split(":");
    const sorted = [...latencies].sort((a, b) => a - b);
    body += line("quill_http_request_duration_seconds", "histogram", "HTTP request latency", sorted.reduce((a, b) => a + b, 0) / 1000 / latencies.length, { method, route, status });
    body += line("quill_http_request_duration_seconds_p50", "gauge", "HTTP request latency p50", quantile(sorted, 0.5) / 1000, { method, route, status });
    body += line("quill_http_request_duration_seconds_p95", "gauge", "HTTP request latency p95", quantile(sorted, 0.95) / 1000, { method, route, status });
    body += line("quill_http_request_duration_seconds_p99", "gauge", "HTTP request latency p99", quantile(sorted, 0.99) / 1000, { method, route, status });
  }

  // Worker stage metrics
  for (const [stage, latencies] of workerStageDurationMs) {
    const sorted = [...latencies].sort((a, b) => a - b);
    body += line("quill_worker_stage_duration_seconds", "histogram", "Worker stage latency", sorted.reduce((a, b) => a + b, 0) / 1000 / latencies.length, { stage });
    body += line("quill_worker_stage_duration_seconds_p50", "gauge", "Worker stage latency p50", quantile(sorted, 0.5) / 1000, { stage });
    body += line("quill_worker_stage_duration_seconds_p95", "gauge", "Worker stage latency p95", quantile(sorted, 0.95) / 1000, { stage });
  }

  // R2 operation metrics
  for (const [k, count] of r2OperationTotal) {
    const [op, result] = k.split(":");
    body += line("quill_r2_operations_total", "counter", "R2 operations total", count, { operation: op, result });
  }
  for (const [op, latencies] of r2OperationDurationMs) {
    const sorted = [...latencies].sort((a, b) => a - b);
    body += line("quill_r2_operation_duration_seconds", "histogram", "R2 operation latency", sorted.reduce((a, b) => a + b, 0) / 1000 / latencies.length, { operation: op });
    body += line("quill_r2_operation_duration_seconds_p50", "gauge", "R2 operation latency p50", quantile(sorted, 0.5) / 1000, { operation: op });
    body += line("quill_r2_operation_duration_seconds_p95", "gauge", "R2 operation latency p95", quantile(sorted, 0.95) / 1000, { operation: op });
  }

  // Queue depth
  for (const [queue, depth] of queueDepth) {
    body += line("quill_queue_depth", "gauge", "BullMQ queue depth", depth, { queue });
  }

  return body;
}