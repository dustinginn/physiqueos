import { describe, expect, it } from "vitest";
import { MEDIA_READ_PATH, readTrustedApplicationOrigin, resolveTrustedMediaRedirect } from "./trustedApplicationOrigin.js";

const providerOrigin = "https://physiqueos-foundation-staging-a9or4.ondigitalocean.app";
const env = { PHYSIQUEOS_PUBLIC_APP_ORIGIN: providerOrigin };

describe("trusted application origin", () => {
  it("accepts only the configured canonical external HTTPS origin", () => {
    expect(readTrustedApplicationOrigin(env)).toBe(providerOrigin);
    expect(readTrustedApplicationOrigin({ PHYSIQUEOS_PUBLIC_APP_ORIGIN: `${providerOrigin}/` })).toBe(providerOrigin);
  });

  it.each([
    ["missing", {}],
    ["malformed", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "not a URL" }],
    ["HTTP downgrade", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "http://provider.example" }],
    ["credentials", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "https://user:pass@provider.example" }],
    ["path", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "https://provider.example/base" }],
    ["query", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "https://provider.example/?x=1" }],
    ["fragment", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "https://provider.example/#x" }],
    ["non-default port", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "https://provider.example:8080" }],
    ["unspecified host", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "https://0.0.0.0" }],
    ["loopback", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "https://127.0.0.1" }],
    ["localhost", { PHYSIQUEOS_PUBLIC_APP_ORIGIN: "https://localhost" }],
  ])("fails closed for %s", (_label, candidate) => {
    expect(() => readTrustedApplicationOrigin(candidate)).toThrow();
  });

  it("resolves only the exact relative opaque media reader handle", () => {
    const redirect = resolveTrustedMediaRedirect(`${MEDIA_READ_PATH}?grant=opaque-value`, env);
    expect(redirect.href).toBe(`${providerOrigin}${MEDIA_READ_PATH}?grant=opaque-value`);
  });

  it.each([
    "https://evil.example/api/v1/media/read?grant=x",
    "//evil.example/api/v1/media/read?grant=x",
    "/\\evil.example/api/v1/media/read?grant=x",
    "/api/v1/media/read/extra?grant=x",
    "/api/v1/media/write?grant=x",
    "/api/v1/media/read?grant=x#fragment",
  ])("rejects an untrusted or non-reader handle: %s", (candidate) => {
    expect(() => resolveTrustedMediaRedirect(candidate, env)).toThrow();
  });
});
