import { describe, expect, it, vi } from "vitest";
import { createSpacesBucketProvisioner } from "./SpacesBucketProvisioner";

const config = Object.freeze({ region: "sfo3", endpoint: "https://sfo3.digitaloceanspaces.com", bucket: "synthetic-private", accessKeyId: "key", secretAccessKey: "secret" });

describe("Spaces bucket provisioning", () => {
  it("creates a private versioned bucket with interrupted multipart cleanup", async () => {
    const client = { send: vi.fn(async (command) => responseFor(command)), destroy: vi.fn() };
    const result = await createSpacesBucketProvisioner(config, { client }).create();
    expect(result).toEqual({ bucket: "synthetic-private", region: "sfo3", private: true, versioning: "Enabled", abortIncompleteMultipartAfterDays: 1 });
    expect(client.send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
      "CreateBucketCommand",
      "PutBucketVersioningCommand",
      "PutBucketLifecycleConfigurationCommand",
      "HeadBucketCommand",
      "GetBucketVersioningCommand",
      "GetBucketAclCommand",
      "GetBucketLifecycleConfigurationCommand",
    ]);
  });

  it("rejects a public ACL or missing versioning", async () => {
    const publicClient = { send: vi.fn(async (command) => responseFor(command, { publicAcl: true })) };
    await expect(createSpacesBucketProvisioner(config, { client: publicClient }).verify()).rejects.toThrow("public ACL");
    const unversionedClient = { send: vi.fn(async (command) => responseFor(command, { versioning: "Suspended" })) };
    await expect(createSpacesBucketProvisioner(config, { client: unversionedClient }).verify()).rejects.toThrow("versioning");
  });
});

function responseFor(command, overrides = {}) {
  if (command.constructor.name === "GetBucketVersioningCommand") return { Status: overrides.versioning ?? "Enabled" };
  if (command.constructor.name === "GetBucketAclCommand") return { Grants: overrides.publicAcl ? [{ Grantee: { URI: "http://acs.amazonaws.com/groups/global/AllUsers" } }] : [] };
  if (command.constructor.name === "GetBucketLifecycleConfigurationCommand") return { Rules: [{ ID: "abort-incomplete-multipart-uploads", Status: "Enabled", AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] };
  return {};
}
