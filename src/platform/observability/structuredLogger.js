const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|pin|credential|objectkey|presigned|evidence|health|content|bytes|buffer)/i;

export function redactStructuredValue(value, key = "root") {
  if (key !== "root" && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, code: value.code ?? "UNCLASSIFIED_ERROR", message: "[REDACTED]" };
  if (Array.isArray(value)) return value.map((entry) => redactStructuredValue(entry, key));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, redactStructuredValue(entry, entryKey)]));
  }
  return String(value);
}

export function createStructuredLogger({ sink = console, clock = () => new Date(), buildIdentity } = {}) {
  return Object.freeze({
    info(event, fields = {}) { write("info", event, fields); },
    warn(event, fields = {}) { write("warn", event, fields); },
    error(event, fields = {}) { write("error", event, fields); },
  });

  function write(level, event, fields) {
    const record = redactStructuredValue({ timestamp: clock().toISOString(), level, event, build: buildIdentity ?? null, ...fields });
    const method = typeof sink[level] === "function" ? level : "log";
    sink[method](JSON.stringify(record));
  }
}
