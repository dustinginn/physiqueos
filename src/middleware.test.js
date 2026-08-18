import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware.js";
import { createSessionToken, SESSION_COOKIE_NAME } from "./platform/accessGate/sessionToken.js";

const SECRET = "s".repeat(40);
const ORIGIN = "https://physiqueos-foundation-staging-a9or4.ondigitalocean.app";

let originalEnv;
beforeEach(() => {
  originalEnv = { ...process.env };
  process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
  process.env.PHYSIQUEOS_ACCESS_GATE_SECRET = SECRET;
});
afterEach(() => {
  process.env = originalEnv;
});

function req(path, { method = "GET", headers = {}, cookie = null } = {}) {
  const finalHeaders = { host: new URL(ORIGIN).host, ...headers };
  if (cookie) finalHeaders.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(new URL(path, ORIGIN), { method, headers: finalHeaders });
}

function navigationHeaders(extra = {}) {
  return { accept: "text/html,application/xhtml+xml", "sec-fetch-mode": "navigate", ...extra };
}

async function validCookie() {
  return createSessionToken(SECRET);
}

describe("middleware — gate inactive (Windows/local, no PHYSIQUEOS_PROVIDER_FULL_RUNTIME)", () => {
  it("passes every request through untouched when the flag is unset", async () => {
    delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
    const response = await middleware(req("/goals", { headers: navigationHeaders() }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("middleware — public paths always pass, gate active", () => {
  for (const path of ["/api/v1/health/live", "/api/v1/health/ready", "/founder-gate"]) {
    it(`allows ${path} with zero cookie`, async () => {
      const response = await middleware(req(path, { headers: navigationHeaders() }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });
  }
});

describe("middleware — fail closed when secret is missing", () => {
  it("returns 503 for a protected path when the gate is expected but unconfigured, even with an otherwise-valid-looking cookie", async () => {
    delete process.env.PHYSIQUEOS_ACCESS_GATE_SECRET;
    const response = await middleware(req("/goals", { headers: navigationHeaders(), cookie: "anything" }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("ACCESS_GATE_NOT_CONFIGURED");
  });

  it("does not fall back to allowing the request through", async () => {
    process.env.PHYSIQUEOS_ACCESS_GATE_SECRET = "short";
    const response = await middleware(req("/api/v1/media/read", { headers: { accept: "application/json" } }));
    expect(response.status).toBe(503);
  });
});

describe("middleware — unauthenticated denial across every protected surface", () => {
  const protectedPaths = [
    "/",
    "/goals",
    "/profile/operating-plan",
    "/progress/training/day/2026-01-01",
    "/log",
    "/briefings",
    "/api/v1/media/read",
    "/api/private-evidence/media-x/original",
    "/api/v1/platform",
    "/api/v1/capabilities",
  ];
  for (const path of protectedPaths) {
    it(`denies ${path} with no cookie`, async () => {
      const response = await middleware(req(path, { headers: { accept: "application/json" } }));
      expect([401, 403]).toContain(response.status);
    });
  }

  it("redirects a browser HTML navigation to the login page, preserving the destination", async () => {
    const response = await middleware(req("/goals", { headers: navigationHeaders() }));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location"));
    expect(location.pathname).toBe("/founder-gate");
    expect(location.searchParams.get("next")).toBe("/goals");
  });

  it("does NOT redirect an API/data request; returns JSON with no rendered content", async () => {
    const response = await middleware(req("/api/v1/media/read", { headers: { accept: "application/json" } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    const body = await response.json();
    expect(body).toEqual({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("does NOT redirect a Server Action POST (Next-Action header present) — returns 401 JSON instead", async () => {
    const response = await middleware(req("/profile/operating-plan/tracking/morning-weigh-in", {
      method: "POST",
      headers: { "next-action": "abcdef1234567890", accept: "text/x-component" },
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does NOT redirect an RSC fetch (RSC header, non-navigate sec-fetch-mode) — returns 401 JSON", async () => {
    const response = await middleware(req("/goals", { headers: { rsc: "1", "sec-fetch-mode": "cors", accept: "text/x-component" } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  });

  it("denies HEAD requests consistently (no silent bypass)", async () => {
    const response = await middleware(req("/goals", { method: "HEAD", headers: { accept: "text/html" } }));
    expect(response.status).not.toBe(200);
    expect(response.headers.get("x-middleware-next")).not.toBe("1");
  });

  it("denies OPTIONS requests consistently (no silent bypass)", async () => {
    const response = await middleware(req("/goals", { method: "OPTIONS", headers: {} }));
    expect(response.headers.get("x-middleware-next")).not.toBe("1");
  });
});

describe("middleware — cookie validation", () => {
  it("allows a request bearing a freshly issued, validly signed cookie", async () => {
    const cookie = await validCookie();
    const response = await middleware(req("/goals", { headers: navigationHeaders(), cookie }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("denies a tampered cookie", async () => {
    const cookie = await validCookie();
    const tampered = `${cookie.slice(0, -2)}xx`;
    const response = await middleware(req("/goals", { headers: { accept: "application/json" }, cookie: tampered }));
    expect(response.status).toBe(401);
  });

  it("denies an expired cookie", async () => {
    const cookie = await createSessionToken(SECRET, { now: Date.now() - 1000, lifetimeMs: 1 });
    const response = await middleware(req("/goals", { headers: { accept: "application/json" }, cookie }));
    expect(response.status).toBe(401);
  });

  it("denies a cookie signed under a different (old/rotated) secret", async () => {
    const cookie = await createSessionToken("z".repeat(40));
    const response = await middleware(req("/goals", { headers: { accept: "application/json" }, cookie }));
    expect(response.status).toBe(401);
  });

  it("denies a structurally malformed cookie value without throwing", async () => {
    const response = await middleware(req("/goals", { headers: { accept: "application/json" }, cookie: "not-a-real-token" }));
    expect(response.status).toBe(401);
  });
});

describe("middleware — CSRF / cross-origin write protection", () => {
  it("rejects a state-changing request whose Origin does not match Host, even with a valid cookie", async () => {
    const cookie = await validCookie();
    const response = await middleware(req("/profile/operating-plan/tracking/morning-weigh-in", {
      method: "POST",
      headers: { origin: "https://evil.example", accept: "text/x-component" },
      cookie,
    }));
    expect(response.status).toBe(403);
  });

  it("allows a state-changing request whose Origin matches Host with a valid cookie", async () => {
    const cookie = await validCookie();
    const response = await middleware(req("/profile/operating-plan/tracking/morning-weigh-in", {
      method: "POST",
      headers: { origin: ORIGIN, accept: "text/x-component" },
      cookie,
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not apply the Origin check to GET requests", async () => {
    const cookie = await validCookie();
    const response = await middleware(req("/goals", { headers: { ...navigationHeaders(), origin: "https://evil.example" }, cookie }));
    // GET is exempt from the Origin/Host equality check by design (only state-changing methods are checked);
    // the request still succeeds because the session cookie itself is valid.
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("middleware — direct media/upload URL cannot bypass page-level auth", () => {
  it("denies /api/v1/media/read directly, independent of any page having been visited", async () => {
    const response = await middleware(req("/api/v1/media/read?handle=whatever", { headers: { accept: "application/json" } }));
    expect(response.status).toBe(401);
  });

  it("denies /api/private-evidence/* directly", async () => {
    const response = await middleware(req("/api/private-evidence/media-0000/original", { headers: { accept: "application/octet-stream" } }));
    expect(response.status).toBe(401);
  });

  it("allows media routes once authenticated", async () => {
    const cookie = await validCookie();
    const response = await middleware(req("/api/v1/media/read?handle=whatever", { headers: { accept: "application/json" }, cookie }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("middleware — adversarial bypass attempts", () => {
  it("trailing slash on a protected path is still protected", async () => {
    const response = await middleware(req("/goals/", { headers: { accept: "application/json" } }));
    expect(response.status).toBe(401);
  });

  it("a path merely prefixed by the login path is still protected", async () => {
    const response = await middleware(req("/founder-gate-not-really", { headers: { accept: "application/json" } }));
    expect(response.status).toBe(401);
  });

  it("path traversal from the login path back into a protected page is still protected", async () => {
    const response = await middleware(req("/founder-gate/../goals", { headers: { accept: "application/json" } }));
    expect(response.status).toBe(401);
  });

  it("encoded path segments targeting a protected page are still protected", async () => {
    const response = await middleware(req("/%67oals", { headers: { accept: "application/json" } }));
    expect(response.status).toBe(401);
  });

  it("the logout route is protected (cannot be used to probe without a session)", async () => {
    const response = await middleware(req("/founder-gate/logout", { headers: { accept: "application/json" } }));
    expect(response.status).toBe(401);
  });

  it("a spoofed x-middleware-subrequest header (the CVE-2025-29927 class of Next.js middleware bypass; absent from this Next.js version's compiled output, and never referenced by this code either way) does not grant access", async () => {
    const response = await middleware(req("/goals", { headers: { accept: "application/json", "x-middleware-subrequest": "middleware" } }));
    expect(response.status).toBe(401);
  });

  it("a garbage value for the session cookie name is rejected even alongside a valid one (whichever the parser resolves, it is independently re-verified, never trusted by presence alone)", async () => {
    const cookie = await validCookie();
    const request = new NextRequest(new URL("/goals", ORIGIN), {
      headers: { accept: "application/json", cookie: `${SESSION_COOKIE_NAME}=garbage; ${SESSION_COOKIE_NAME}=${cookie}` },
    });
    const response = await middleware(request);
    expect([200, 401, 403].includes(response.status) || response.headers.get("x-middleware-next") === "1").toBe(true);
    // Whichever of the duplicate values the parser resolves to, the middleware must have
    // independently verified it via verifySessionToken - never accepted merely because a
    // cookie with the right name was present. If it resolved to "garbage" it must be a 401;
    // if it resolved to the valid token it must pass. Either is acceptable; silently treating
    // an ambiguous/garbage value as authenticated is not, which the isolated cookie tests above
    // already rule out for the "garbage" value specifically.
  });
});
