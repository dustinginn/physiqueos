import { describe, expect, it } from "vitest";
import {
  appendEvidenceRecoveryContext,
  createEvidenceRecoveryContext,
  evidenceReviewMatchesRecoveryContext,
  parseEvidenceRecoverySearchParams,
} from "./EvidenceRecoveryContext";

describe("Evidence recovery navigation context", () => {
  const input = {
    date: "2026-08-08",
    expectedEvidenceType: "nutrition",
    recoveryKey: "protocol:nutrition:2026-08-08",
    returnTo: "/check-in/morning",
  };

  it("round-trips the prior date, type, key, and allowlisted return path", () => {
    const href = appendEvidenceRecoveryContext("/log", input);
    const query = new URL(href, "https://example.test").searchParams;
    expect(parseEvidenceRecoverySearchParams(query)).toEqual(input);
  });

  it("round-trips the allowlisted prior-day Nutrition update intent", () => {
    const update = { ...input, recoveryIntent: "update" };
    const href = appendEvidenceRecoveryContext("/log", update);
    expect(parseEvidenceRecoverySearchParams(
      new URL(href, "https://example.test").searchParams
    )).toEqual(update);
  });

  it.each([
    ["an external URL", { ...input, returnTo: "https://example.com" }],
    ["a protocol-relative URL", { ...input, returnTo: "//example.com" }],
    ["another internal route", { ...input, returnTo: "/admin" }],
    ["an unsupported evidence type", { ...input, expectedEvidenceType: "dexa" }],
    ["an unsupported recovery intent", { ...input, recoveryIntent: "replace" }],
    ["an update intent for another type", {
      ...input, expectedEvidenceType: "training", recoveryIntent: "update",
    }],
  ])("rejects %s", (_label, candidate) => {
    expect(createEvidenceRecoveryContext(candidate)).toBeNull();
  });

  it("accepts only a review containing the exact recovery date and type", () => {
    const review = {
      interpretedEvidence: {
        evidence_objects: [{
          id: "nutrition",
          evidence_type: "nutrition",
          observed_at: "2026-08-08",
        }],
      },
    };
    expect(evidenceReviewMatchesRecoveryContext(review, input)).toBe(true);
    expect(evidenceReviewMatchesRecoveryContext(review, {
      ...input,
      date: "2026-08-07",
    })).toBe(false);
    expect(evidenceReviewMatchesRecoveryContext(review, {
      ...input,
      expectedEvidenceType: "training",
    })).toBe(false);
  });
});
