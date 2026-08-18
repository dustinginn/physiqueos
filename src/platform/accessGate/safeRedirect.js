// Prevents open-redirect: only a same-origin, path-only value (starting
// with a single "/", never "//" or a value containing a scheme) is ever
// honored as a post-login destination. Anything else falls back to "/".

export function sanitizeNextPath(value) {
  const candidate = String(value ?? "");
  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("//")) return "/";
  if (/^\/[\\/]/.test(candidate)) return "/";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) return "/";
  return candidate;
}
