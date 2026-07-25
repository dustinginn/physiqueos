import { describe, expect, it } from "vitest";
import { reconcileProtocolTransition } from "./ProtocolTransitionReconciliationService";

function review(id, category, disposition, reviewStatus, recommendation = "update") {
  return { id, category, displayName: category === "peptide" ? "Peptide" : category === "supplement" ? "Supplement" : title(category), intendedDisposition: disposition, reviewStatus, recommendation };
}
function protocolDraft(reviewId, status = "ready", payload = {}) {
  return { id: `draft_${reviewId}`, reviewId, status, payload };
}
function title(value) {
  return value.replace(/(^|_)(\w)/g, (_, space, letter) => `${space ? " " : ""}${letter.toUpperCase()}`);
}

describe("Protocol Transition reconciliation", () => {
  it.each([
    ["keep", "accepted", true, "Ready for new goal"],
    ["update", "reviewed", true, "Updated plan prepared"],
    ["replace", "reviewed", true, "New plan prepared"],
  ])("resolves a valid %s outcome", (disposition, status, hasDraft, label) => {
    const item = review("one", "energy", disposition, status);
    const result = reconcileProtocolTransition({ protocolReviews: [item], protocolDrafts: hasDraft ? [protocolDraft(item.id)] : [] });
    expect(result.reviews[0]).toMatchObject({ resolved: true, statusLabel: label });
    expect(result).toMatchObject({ preparedCount: 1, unresolvedCount: 0, ready: true });
  });

  it.each(["pause", "leave_behind"])("treats an intentional %s decision as resolved without a preview draft", (disposition) => {
    const item = review("one", "supplement", disposition, "reviewed");
    const result = reconcileProtocolTransition({ protocolReviews: [item], protocolDrafts: [] });
    expect(result.reviews[0].resolved).toBe(true);
    expect(result.unresolvedCount).toBe(0);
  });

  it("keeps an update or replacement unresolved until a valid plan is saved", () => {
    const update = review("update", "energy", "update", "editing");
    const replacement = review("replace", "nutrition", "replace", "reviewed");
    const result = reconcileProtocolTransition({ protocolReviews: [update, replacement], protocolDrafts: [protocolDraft(replacement.id, "draft")] });
    expect(result).toMatchObject({ preparedCount: 0, unresolvedCount: 2, ready: false });
    expect(result.unresolvedGroups.map((group) => group.title)).toEqual(["Energy", "Nutrition"]);
  });

  it("aggregates Peptides from every separate underlying record", () => {
    const retatrutide = review("reta", "peptide", "keep", "accepted", "keep");
    const tesamorelin = review("tesa", "peptide", "update", "editing");
    const partial = reconcileProtocolTransition({ protocolReviews: [retatrutide, tesamorelin], protocolDrafts: [protocolDraft(retatrutide.id), protocolDraft(tesamorelin.id, "draft")] });
    expect(partial.groups[0]).toMatchObject({ id: "peptides", resolved: false, statusLabel: "Needs review", actionLabel: "Continue Peptide Review" });
    const resolved = reconcileProtocolTransition({ protocolReviews: [retatrutide, { ...tesamorelin, intendedDisposition: "pause", reviewStatus: "reviewed" }], protocolDrafts: [protocolDraft(retatrutide.id)] });
    expect(resolved.groups[0]).toMatchObject({ resolved: true, statusLabel: "Decisions reviewed", actionLabel: "Review Peptide Plan" });
    expect(resolved.reviews.map((item) => item.reviewId)).toEqual(["reta", "tesa"]);
  });

  it("aggregates Supplements and identifies remaining work by its user-facing group name", () => {
    const creatine = review("creatine", "supplement", "keep", "accepted", "keep");
    const magnesium = review("magnesium", "supplement", "leave_behind", "reviewed", "keep");
    const electrolytes = review("electrolytes", "supplement", "update", "editing", "keep");
    const result = reconcileProtocolTransition({ protocolReviews: [creatine, magnesium, electrolytes], protocolDrafts: [protocolDraft(creatine.id), protocolDraft(electrolytes.id, "draft")] });
    expect(result.groups[0]).toMatchObject({ id: "supplements", resolved: false, actionLabel: "Continue Supplement Review" });
    expect(result.unresolvedGroups).toEqual([{ id: "supplements", title: "Supplements" }]);
  });
});
