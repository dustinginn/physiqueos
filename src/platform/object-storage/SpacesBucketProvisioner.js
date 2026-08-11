import {
  CreateBucketCommand,
  GetBucketAclCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
  HeadBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const PUBLIC_GROUPS = new Set([
  "http://acs.amazonaws.com/groups/global/AllUsers",
  "http://acs.amazonaws.com/groups/global/AuthenticatedUsers",
]);

export function createSpacesBucketProvisioner(config, { client } = {}) {
  validateConfig(config);
  const s3 = client ?? new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  return Object.freeze({
    async create() {
      await s3.send(new CreateBucketCommand({ Bucket: config.bucket, ACL: "private" }));
      await s3.send(new PutBucketVersioningCommand({
        Bucket: config.bucket,
        VersioningConfiguration: { Status: "Enabled" },
      }));
      await s3.send(new PutBucketLifecycleConfigurationCommand({
        Bucket: config.bucket,
        LifecycleConfiguration: {
          Rules: [{
            ID: "abort-incomplete-multipart-uploads",
            Status: "Enabled",
            Prefix: "",
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
          }],
        },
      }));
      return this.verify();
    },
    async verify() {
      await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
      const [versioning, acl, lifecycle] = await Promise.all([
        s3.send(new GetBucketVersioningCommand({ Bucket: config.bucket })),
        s3.send(new GetBucketAclCommand({ Bucket: config.bucket })),
        s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: config.bucket })),
      ]);
      if (versioning.Status !== "Enabled") throw new Error("Spaces versioning is not enabled.");
      if ((acl.Grants ?? []).some((grant) => PUBLIC_GROUPS.has(grant.Grantee?.URI))) {
        throw new Error("The Spaces bucket has a public ACL grant.");
      }
      const cleanup = (lifecycle.Rules ?? []).find((rule) => rule.ID === "abort-incomplete-multipart-uploads");
      if (cleanup?.Status !== "Enabled" || cleanup.AbortIncompleteMultipartUpload?.DaysAfterInitiation !== 1) {
        throw new Error("Interrupted multipart upload cleanup is not configured.");
      }
      return Object.freeze({ bucket: config.bucket, region: config.region, private: true, versioning: "Enabled", abortIncompleteMultipartAfterDays: 1 });
    },
    close() { s3.destroy?.(); },
  });
}

function validateConfig(config) {
  for (const key of ["region", "endpoint", "bucket", "accessKeyId", "secretAccessKey"]) {
    if (!String(config?.[key] ?? "").trim()) throw new Error(`Spaces provisioning ${key} is required.`);
  }
  if (!String(config.endpoint).startsWith("https://")) throw new Error("Spaces provisioning requires HTTPS.");
}
