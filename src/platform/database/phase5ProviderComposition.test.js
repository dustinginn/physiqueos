import { describe, expect, it } from "vitest";
import { createPhase5ProviderMediaCatalog } from "./phase5ProviderComposition.js";

describe("Phase 5 provider media catalog", () => {
  it("maps internal provider identity without exposing it as application metadata", async () => {
    const query = async () => ({ rows: [{
      id: "object-one", owner_user_id: "owner-one", content_type: "image/jpeg", byte_length: "12",
      sha256: "a".repeat(64), storage_key: "private/owner-one/object-one/original", provider_version: "version-one", state: "verified",
    }] });
    const object = await createPhase5ProviderMediaCatalog({ query }).getObject({ objectId: "object-one", ownerUserId: "owner-one" });
    expect(object).toMatchObject({ id: "object-one", ownerUserId: "owner-one", size: 12, objectKey: "private/owner-one/object-one/original", providerVersion: "version-one" });
  });

  it("requires owner-scoped lookup and returns no record when the provider row is absent", async () => {
    const query = async (text, values) => {
      expect(text).toContain("owner_user_id=$2");
      expect(values).toEqual(["object-one", "wrong-owner"]);
      return { rows: [] };
    };
    await expect(createPhase5ProviderMediaCatalog({ query }).getObject({ objectId: "object-one", ownerUserId: "wrong-owner" })).resolves.toBeNull();
  });
});
