/** Typed JSON helpers so every route returns the same envelope. */
export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return { data, ...(meta ?? {}) };
}

export function error(message: string, code?: string) {
  return { error: message, ...(code ? { code } : {}) };
}
