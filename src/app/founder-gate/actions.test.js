import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { verifySessionToken, SESSION_COOKIE_NAME } from "../../platform/accessGate/sessionToken.js";
import { resetLoginRateLimitForTests } from "../../platform/accessGate/loginRateLimiter.js";

const REDIRECT_MARKER = "NEXT_REDIRECT";

function createRedirectError(destination) {
  const error = new Error(REDIRECT_MARKER);
  error.digest = `${REDIRECT_MARKER};push;${destination};307;`;
  error.__redirectDestination = destination;
  return error;
}

const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
const requestHeaders = { get: vi.fn(() => null) };
const redirectMock = vi.fn((destination) => {
  throw createRedirectError(destination);
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
  headers: vi.fn(async () => requestHeaders),
}));
vi.mock("next/navigation", () => ({
  redirect: (...args) => redirectMock(...args),
}));

const { loginWithGateSecret, logoutFounderGate } = await import("./actions.js");

const SECRET = "s".repeat(40);

function formData(values) {
  return { get: (key) => values[key] ?? null };
}

async function expectRedirectTo(promise, destination) {
  await expect(promise).rejects.toThrow(REDIRECT_MARKER);
  expect(redirectMock).toHaveBeenCalledWith(destination);
}

let originalEnv;
beforeEach(() => {
  originalEnv = { ...process.env };
  process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
  process.env.PHYSIQUEOS_ACCESS_GATE_SECRET = SECRET;
  process.env.NODE_ENV = "production";
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
  redirectMock.mockClear();
  requestHeaders.get.mockReturnValue(null);
  resetLoginRateLimitForTests();
});
afterEach(() => {
  process.env = originalEnv;
});

describe("loginWithGateSecret — session cookie persistence", () => {
  it("a successful login sets a cookie with an explicit persistent maxAge, not a browser-session cookie", async () => {
    await expectRedirectTo(loginWithGateSecret(formData({ accessCode: SECRET, next: "/" })), "/");

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, token, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(typeof token).toBe("string");
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    // Explicitly not a browser-session cookie: maxAge must be a positive finite number.
    expect(Number.isFinite(options.maxAge)).toBe(true);
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it("secure reflects NODE_ENV rather than being hardcoded", async () => {
    process.env.NODE_ENV = "development";
    await expectRedirectTo(loginWithGateSecret(formData({ accessCode: SECRET, next: "/" })), "/");
    const [, , options] = cookieStore.set.mock.calls[0];
    expect(options.secure).toBe(false);
  });

  it("the emitted token verifies immediately after login using the same secret", async () => {
    await expectRedirectTo(loginWithGateSecret(formData({ accessCode: SECRET, next: "/" })), "/");
    const [, token] = cookieStore.set.mock.calls[0];
    const payload = await verifySessionToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload.exp - payload.iat).toBe(12 * 60 * 60 * 1000);
  });

  it("the same stored token verifies again on a simulated later, independent request (tab-close/reopen equivalent)", async () => {
    await expectRedirectTo(loginWithGateSecret(formData({ accessCode: SECRET, next: "/" })), "/");
    const [, token] = cookieStore.set.mock.calls[0];

    // Simulate a brand-new, unrelated request 6 hours later presenting the same
    // cookie value the browser stored - this is exactly what a tab reopen replays.
    const sixHoursLater = Date.now() + 6 * 60 * 60 * 1000;
    const payload = await verifySessionToken(token, SECRET, { now: sixHoursLater });
    expect(payload).not.toBeNull();
  });

  it("the token is rejected once the intended lifetime boundary is crossed", async () => {
    await expectRedirectTo(loginWithGateSecret(formData({ accessCode: SECRET, next: "/" })), "/");
    const [, token] = cookieStore.set.mock.calls[0];

    const atExpiry = Date.now() + 12 * 60 * 60 * 1000;
    const payload = await verifySessionToken(token, SECRET, { now: atExpiry });
    expect(payload).toBeNull();
  });

  it("a failed login (wrong secret) never sets the session cookie", async () => {
    await expectRedirectTo(
      loginWithGateSecret(formData({ accessCode: "wrong-value", next: "/" })),
      "/founder-gate?error=1",
    );
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("a failed login (empty secret) never sets the session cookie", async () => {
    await expectRedirectTo(
      loginWithGateSecret(formData({ accessCode: "", next: "/" })),
      "/founder-gate?error=1",
    );
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("logout deletes the persistent cookie by name", async () => {
    await expect(logoutFounderGate()).rejects.toThrow(REDIRECT_MARKER);
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(redirectMock).toHaveBeenCalledWith("/founder-gate");
  });
});
