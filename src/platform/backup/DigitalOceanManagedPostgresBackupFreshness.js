const DEFAULT_MAXIMUM_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_API_BASE_URL = "https://api.digitalocean.com/v2";

export function createDigitalOceanManagedPostgresBackupFreshnessVerifier({
  clusterId,
  accessToken,
  fetchImpl = globalThis.fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  now = () => new Date(),
  maximumAgeMs = DEFAULT_MAXIMUM_AGE_MS,
} = {}) {
  const expectedClusterId = required(clusterId, "DigitalOcean database cluster ID");
  const token = required(accessToken, "DigitalOcean database-read token");
  if (typeof fetchImpl !== "function") throw new Error("Backup freshness verification requires fetch.");
  if (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs < 1) throw new Error("Backup freshness threshold is invalid.");

  return Object.freeze({
    async verify() {
      const verifiedAt = now();
      const [clusterPayload, backupPayload] = await Promise.all([
        request(`/databases/${encodeURIComponent(expectedClusterId)}`),
        request(`/databases/${encodeURIComponent(expectedClusterId)}/backups`),
      ]);
      const cluster = clusterPayload.database ?? clusterPayload;
      if (String(cluster?.id ?? "") !== expectedClusterId) {
        return result({ status: "BLOCKED", reason: "cluster-identity-mismatch", cluster, verifiedAt });
      }
      if (String(cluster?.status ?? "").toLowerCase() !== "online") {
        return result({ status: "BLOCKED", reason: "cluster-not-online", cluster, verifiedAt });
      }
      const backups = Array.isArray(backupPayload?.backups) ? backupPayload.backups : [];
      const latest = backups
        .map((backup) => ({ backup, createdAt: parseTimestamp(backup.created_at ?? backup.createdAt) }))
        .filter((entry) => entry.createdAt != null)
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
      if (!latest) return result({ status: "BLOCKED", reason: "backup-metadata-unavailable", cluster, verifiedAt });
      const ageMs = Math.max(0, verifiedAt.getTime() - latest.createdAt);
      return result({
        status: ageMs <= maximumAgeMs ? "PASS" : "BLOCKED",
        reason: ageMs <= maximumAgeMs ? "backup-current" : "backup-stale",
        cluster,
        verifiedAt,
        latestBackupAt: new Date(latest.createdAt),
        ageMs,
        backup: latest.backup,
      });
    },
  });

  async function request(relativePath) {
    let response;
    try {
      response = await fetchImpl(`${String(apiBaseUrl).replace(/\/$/, "")}${relativePath}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
    } catch (cause) {
      const error = new Error("DigitalOcean backup metadata is unavailable.", { cause });
      error.code = "BACKUP_PROVIDER_UNAVAILABLE";
      throw error;
    }
    if (!response?.ok) {
      const error = new Error(`DigitalOcean backup metadata request failed with HTTP ${response?.status ?? "unknown"}.`);
      error.code = "BACKUP_PROVIDER_UNAVAILABLE";
      throw error;
    }
    return response.json();
  }

  function result({ status, reason, cluster, verifiedAt, latestBackupAt = null, ageMs = null, backup = null }) {
    return Object.freeze({
      ready: status === "PASS",
      status,
      reason,
      clusterId: String(cluster?.id ?? expectedClusterId),
      clusterStatus: String(cluster?.status ?? "unknown"),
      latestBackupAt: latestBackupAt?.toISOString() ?? null,
      backupAgeMs: ageMs,
      backupAgeHours: ageMs == null ? null : Number((ageMs / 3_600_000).toFixed(3)),
      freshnessThresholdMs: maximumAgeMs,
      freshnessThresholdHours: Number((maximumAgeMs / 3_600_000).toFixed(3)),
      providerSource: "DigitalOcean API v2 managed database backup metadata",
      verificationTimestamp: verifiedAt.toISOString(),
      backupSizeGiB: numeric(backup?.size_gigabytes ?? backup?.sizeGigabytes),
      mutated: false,
    });
  }
}

export function assertManagedPostgresBackupFreshness(result) {
  if (result?.ready !== true || result?.status !== "PASS") {
    const error = new Error(`Managed PostgreSQL backup freshness is blocked: ${result?.reason ?? "unverified"}.`);
    error.code = "MANAGED_POSTGRES_BACKUP_NOT_FRESH";
    error.backupFreshness = result ?? null;
    throw error;
  }
  return result;
}

function parseTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}

export const MANAGED_POSTGRES_BACKUP_MAXIMUM_AGE_MS = DEFAULT_MAXIMUM_AGE_MS;
