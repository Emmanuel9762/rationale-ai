export function safeErrorCodes(error: unknown): string[] {
  const codes = new Set<string>();
  const seen = new Set<unknown>();
  function visit(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return;
    seen.add(value);
    const e = value as { code?: unknown; cause?: unknown; sourceError?: unknown; errors?: unknown[] };
    if (typeof e.code === "string" && /^(?:[0-9A-Z]{5}|E[A-Z_]{2,40}|UND_ERR_[A-Z_]+)$/.test(e.code)) codes.add(e.code);
    visit(e.cause, depth+1); visit(e.sourceError, depth+1);
    if (Array.isArray(e.errors)) for (const item of e.errors) visit(item, depth+1);
  }
  visit(error,0);
  return [...codes];
}
