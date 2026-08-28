const MEDIA_READ_PATH = "/api/v1/media/read";
const REJECTED_HOSTNAMES = new Set(["0.0.0.0", "127.0.0.1", "[::1]", "localhost"]);

export function readTrustedApplicationOrigin(env = process.env) {
  const configured = String(env.PHYSIQUEOS_PUBLIC_APP_ORIGIN ?? "").trim();
  if (!configured) throw new Error("PHYSIQUEOS_PUBLIC_APP_ORIGIN is required for provider media redirects.");

  let origin;
  try {
    origin = new URL(configured);
  } catch {
    throw new Error("PHYSIQUEOS_PUBLIC_APP_ORIGIN must be a valid absolute URL.");
  }

  const hostname = origin.hostname.toLowerCase();
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.port ||
    REJECTED_HOSTNAMES.has(hostname)
  ) {
    throw new Error("PHYSIQUEOS_PUBLIC_APP_ORIGIN must be a canonical external HTTPS origin.");
  }

  return origin.origin;
}

export function resolveTrustedMediaRedirect(accessHandle, env = process.env) {
  const candidate = String(accessHandle ?? "");
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    throw new Error("The media access handle must be a relative application path.");
  }

  const sentinel = "https://application.invalid";
  const handle = new URL(candidate, sentinel);
  if (handle.origin !== sentinel || handle.pathname !== MEDIA_READ_PATH || handle.hash) {
    throw new Error("The media access handle does not identify the protected media reader.");
  }

  return new URL(`${handle.pathname}${handle.search}`, `${readTrustedApplicationOrigin(env)}/`);
}

export { MEDIA_READ_PATH };
