import { describe, it, expect } from "vitest";
import { isPublicPath, FOUNDER_GATE_LOGIN_PATH, COMBINED_CUTOVER_TRANSFER_ROUTE_PATH_PREFIX } from "./publicRoutes.js";

describe("publicRoutes.isPublicPath", () => {
  it("allows exactly the two health endpoints", () => {
    expect(isPublicPath("/api/v1/health/live")).toBe(true);
    expect(isPublicPath("/api/v1/health/ready")).toBe(true);
  });

  it("allows the login route itself", () => {
    expect(isPublicPath(FOUNDER_GATE_LOGIN_PATH)).toBe(true);
  });

  it("allows framework static assets under /_next/static/", () => {
    expect(isPublicPath("/_next/static/css/abc123.css")).toBe(true);
    expect(isPublicPath("/_next/static/chunks/main.js")).toBe(true);
  });

  it("allows favicon.ico", () => {
    expect(isPublicPath("/favicon.ico")).toBe(true);
  });

  it("does NOT allow /_next/image (potential media-proxy bypass vector)", () => {
    expect(isPublicPath("/_next/image")).toBe(false);
    expect(isPublicPath("/_next/image?url=x")).toBe(false);
  });

  it("does NOT allow /_next/data", () => {
    expect(isPublicPath("/_next/data/build-id/goals.json")).toBe(false);
  });

  it("does NOT broadly allow /api", () => {
    expect(isPublicPath("/api")).toBe(false);
    expect(isPublicPath("/api/v1/goals")).toBe(false);
    expect(isPublicPath("/api/v1/platform")).toBe(false);
    expect(isPublicPath("/api/v1/capabilities")).toBe(false);
  });

  it("does NOT allow media/private-evidence routes", () => {
    expect(isPublicPath("/api/v1/media/read")).toBe(false);
    expect(isPublicPath("/api/private-evidence/media-x/original")).toBe(false);
  });

  it("does NOT allow product pages", () => {
    for (const page of ["/", "/goals", "/log", "/profile/operating-plan", "/progress/training/day/2026-01-01", "/briefings"]) {
      expect(isPublicPath(page)).toBe(false);
    }
  });

  it("does NOT allow the logout route (must be reached only while authenticated)", () => {
    expect(isPublicPath("/founder-gate/logout")).toBe(false);
  });

  it("does not treat a path merely prefixed by the login path as public", () => {
    expect(isPublicPath("/founder-gate-evil")).toBe(false);
    expect(isPublicPath(`${FOUNDER_GATE_LOGIN_PATH}/../goals`)).toBe(false);
  });

  it("allows the machine-authenticated combined-cutover transfer channel (exempt from the Founder session cookie, not from authentication)", () => {
    expect(isPublicPath(`${COMBINED_CUTOVER_TRANSFER_ROUTE_PATH_PREFIX}declare`)).toBe(true);
    expect(isPublicPath(`${COMBINED_CUTOVER_TRANSFER_ROUTE_PATH_PREFIX}chunk`)).toBe(true);
    expect(isPublicPath(`${COMBINED_CUTOVER_TRANSFER_ROUTE_PATH_PREFIX}complete`)).toBe(true);
    expect(isPublicPath(`${COMBINED_CUTOVER_TRANSFER_ROUTE_PATH_PREFIX}status`)).toBe(true);
  });

  it("does NOT allow the bare transfer route without its trailing segment", () => {
    expect(isPublicPath("/api/v1/operations/combined-cutover/transfer")).toBe(false);
  });

  it("does NOT allow a sibling combined-cutover path to ride the transfer prefix", () => {
    expect(isPublicPath("/api/v1/operations/combined-cutover/transfer-evil/declare")).toBe(false);
    expect(isPublicPath("/api/v1/operations/combined-cutover/authority")).toBe(false);
  });
});
