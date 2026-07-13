import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewRepository } from "./EvidenceReviewRepository";

describe("Evidence Review query safety", () => {
  it("does not mutate pending-review lifecycle during page-equivalent reads", async () => {
    const pending = { id: "review-pending", userId: "founder", status: "pending", updatedAt: "2026-07-12T00:00:00Z" };
    const reviews = [pending];
    const onChange = vi.fn();
    const repository = createEvidenceReviewRepository(reviews, { onChange });

    expect(await repository.getReviewById(pending.id)).toEqual(pending);
    expect(await repository.listReviews("founder")).toEqual([pending]);
    expect(reviews).toEqual([pending]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
