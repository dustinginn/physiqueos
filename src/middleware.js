// Temporary migration-security scaffolding: a provider-wide Founder access
// gate. Default posture is DENY. See
// docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md for why this
// exists and what it does and does not replace (it is not the future
// Native V1 Founder authentication architecture).
//
// Only active when PHYSIQUEOS_PROVIDER_FULL_RUNTIME=1 (the same flag every
// other provider-vs-legacy behavior in this codebase already keys off - see
// next.config.mjs's webpack fixture-swap and the media routes' own gating).
// Windows/local development never sets this flag and is therefore
// completely unaffected by this file.

import { NextResponse } from "next/server";
import { isAccessGateExpected, readAccessGateSecret } from "./platform/accessGate/accessGateConfig.js";
import { isPublicPath, FOUNDER_GATE_LOGIN_PATH } from "./platform/accessGate/publicRoutes.js";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./platform/accessGate/sessionToken.js";

// Excludes only /_next/static (framework JS/CSS/font chunks - never product
// data) and favicon.ico from even reaching this function, for performance.
// Every other path - every page, every /api route, every media/private-evidence
// route, every Server Action POST - runs through the checks below.
export const config = {
  matcher: ["/((?!_next/static|favicon\\.ico).*)"],
};

export async function middleware(request) {
  if (!isAccessGateExpected(process.env)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const secret = readAccessGateSecret(process.env);
  if (!secret) return denyResponse(request, 503, "ACCESS_GATE_NOT_CONFIGURED");

  // CSRF defense-in-depth for state-changing requests (Server Actions and
  // any mutation route): Next.js Server Actions already enforce their own
  // Origin/Host check, and the session cookie is SameSite=Lax, but an
  // explicit check here costs nothing and does not depend on that staying
  // true across framework versions.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (originHost !== request.headers.get("host")) return denyResponse(request, 403, "ORIGIN_MISMATCH");
    }
  }

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = cookieValue ? await verifySessionToken(cookieValue, secret) : null;
  if (!session) return denyResponse(request, 401, "AUTHENTICATION_REQUIRED");

  return NextResponse.next();
}

function isBrowserNavigation(request) {
  return (request.method === "GET" || request.method === "HEAD")
    && request.headers.get("sec-fetch-mode") === "navigate"
    && (request.headers.get("accept") ?? "").includes("text/html");
}

/**
 * Browser page-navigation requests get redirected to the login page.
 * Everything else (API/data reads, media, Server Actions, RSC/prefetch
 * fetches, uploads) gets a generic JSON error and nothing else - never a
 * rendered page, never product data, never an internal detail.
 */
function denyResponse(request, status, code) {
  if (status === 401 && isBrowserNavigation(request)) {
    const loginUrl = new URL(FOUNDER_GATE_LOGIN_PATH, request.url);
    const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    if (nextPath && nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl, { status: 302, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ code }, { status, headers: { "cache-control": "no-store" } });
}
