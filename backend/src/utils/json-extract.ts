/**
 * Recovers JSON from raw LLM output. Models love wrapping JSON in
 * markdown fences or prose; this strips fences and locates the first
 * balanced JSON block. Falls back to a trailing-`}` scan.
 */
export function extractJson(raw: string): unknown {
  let text = raw.trim();

  // Strip markdown code fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Direct parse
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  // First { ... } block (balanced braces)
  const start = text.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }

  // First [ ... ] block (balanced brackets)
  const arrStart = text.indexOf("[");
  if (arrStart !== -1) {
    let depth = 0;
    for (let i = arrStart; i < text.length; i++) {
      if (text[i] === "[") depth++;
      else if (text[i] === "]") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(arrStart, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }

  return null;
}
