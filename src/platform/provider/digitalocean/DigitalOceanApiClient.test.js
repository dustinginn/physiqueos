import { describe, expect, it, vi } from "vitest";
import { createDigitalOceanApiClient } from "./DigitalOceanApiClient.js";
import {
  DigitalOceanLeastPrivilegeScopes,
  ProviderResultClassification,
  redactProviderEvidence,
} from "./DigitalOceanProviderContract.js";

// Assemble a fake prefix at runtime so repository secret scanners never see a token-shaped literal.
const PAT = ["dop", "v1", "checkpoint3-secret-value"].join("_");
const operationIdentity = Object.freeze({ operationId: "phase7b-op-1", commandId: "phase7b-command-1" });

describe("DigitalOceanApiClient reads", () => {
  it("performs an exact app GET with finite transport configuration and safe evidence", async () => {
    const fetchImpl = vi.fn(async () => json({ app: { id: "app-1", spec: { name: "physiqueos" } } }, 200, {
      "x-request-id": "provider-request-1", "ratelimit-limit": "5000", "ratelimit-remaining": "4999", "ratelimit-reset": "123",
    }));
    const result = await client(fetchImpl).getApp("app-1");

    expect(result).toMatchObject({
      classification: ProviderResultClassification.REQUEST_ACCEPTED,
      value: { id: "app-1" },
      evidence: {
        method: "GET", resourceKind: "app", safePath: "/v2/apps/{app_id}", status: 200,
        providerRequestId: "provider-request-1", contentType: "application/json",
        authorizationHeaderConstructed: true, authorizationScheme: "Bearer",
        rateLimit: { limit: 5000, remaining: 4999, reset: 123 },
      },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.digitalocean.com/v2/apps/app-1");
    expect(String(url)).not.toContain(PAT);
    expect(init.headers.authorization).toBe(`Bearer ${PAT}`);
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(result)).not.toContain(PAT);
  });

  it("normalizes surrounding clipboard whitespace but rejects transformed credential shapes before dispatch", async () => {
    const fetchImpl = vi.fn(async () => json({ app: { id: "app-1" } }));
    const api = createDigitalOceanApiClient({ accessToken: `\uFEFF \r\n${PAT}\r\n `, fetchImpl });
    await expect(api.getApp("app-1")).resolves.toMatchObject({ classification: ProviderResultClassification.REQUEST_ACCEPTED });
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe(`Bearer ${PAT}`);
    expect(fetchImpl.mock.calls[0][1].headers.authorization.match(/Bearer/g)).toHaveLength(1);

    const malformed = [
      [PAT],
      { token: PAT },
      `Bearer ${PAT}`,
      `"${PAT}"`,
      `${PAT}\r\nother`,
      `${PAT}\u200B`,
    ];
    for (const accessToken of malformed) {
      expect(() => createDigitalOceanApiClient({ accessToken, fetchImpl })).toThrow(/must be a string|unsupported characters/);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404, 429, 500, 503])("classifies HTTP %i as a conclusive read failure without retry", async (status) => {
    const fetchImpl = vi.fn(async () => json({ id: "provider-error", message: `Bearer ${PAT}` }, status));
    const error = await capture(client(fetchImpl).getApp("app-1"));
    expect(error).toMatchObject({ classification: ProviderResultClassification.READ_FAILED, evidence: { status, retryCount: 0 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error)).not.toContain(PAT);
  });

  it("retains safe first-response authentication telemetry without reading or exposing the body", async () => {
    const fetchImpl = vi.fn(async () => json({ message: `Bearer ${PAT}` }, 401, {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": "provider-auth-request",
    }));
    const error = await capture(client(fetchImpl).getApp("app-1"));
    expect(error).toMatchObject({
      classification: ProviderResultClassification.READ_FAILED,
      evidence: {
        method: "GET", safePath: "/v2/apps/{app_id}", status: 401,
        contentType: "application/json; charset=utf-8", providerRequestId: "provider-auth-request",
        authorizationHeaderConstructed: true, authorizationScheme: "Bearer", retryCount: 0,
      },
    });
    expect(JSON.stringify(error)).not.toContain(PAT);
  });

  it("classifies timeout and connection reset separately from provider rejection", async () => {
    const timeoutFetch = vi.fn(() => new Promise(() => {}));
    const timeoutError = await capture(client(timeoutFetch, { requestTimeoutMs: 5 }).getApp("app-1"));
    expect(timeoutError).toMatchObject({ classification: ProviderResultClassification.READ_FAILED, evidence: { timedOut: true } });

    const resetError = await capture(client(vi.fn(async () => { throw new Error(`ECONNRESET ${PAT}`); })).getApp("app-1"));
    expect(resetError).toMatchObject({ classification: ProviderResultClassification.READ_FAILED, evidence: { timedOut: false } });
    expect(JSON.stringify(resetError)).not.toContain(PAT);
  });

  it("applies the same finite deadline to a stalled successful response body", async () => {
    const stalledBody = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {} }) },
    };
    const error = await capture(client(vi.fn(async () => stalledBody), { requestTimeoutMs: 5 }).getApp("app-1"));
    expect(error).toMatchObject({ classification: ProviderResultClassification.READ_FAILED, evidence: { timedOut: true, status: 200 } });
  });

  it("uses only explicitly bounded retries for transport-failed reads", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("reset"))
      .mockResolvedValueOnce(json({ app: { id: "app-1" } }));
    const result = await client(fetchImpl, { maximumReadAttempts: 2, readRetryDelayMs: 0 }).getApp("app-1");
    expect(result.evidence.retryCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uses only the injected mock transport and never falls through to the live global fetch", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("LIVE_NETWORK_DISABLED"));
    try {
      const injected = vi.fn(async () => json({ app: { id: "app-1" } }));
      await expect(client(injected).getApp("app-1")).resolves.toMatchObject({ classification: ProviderResultClassification.REQUEST_ACCEPTED });
      expect(injected).toHaveBeenCalledTimes(1);
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      globalFetch.mockRestore();
    }
  });

  it.each([
    ["malformed JSON", () => text("{not-json", 200, "application/json")],
    ["unexpected content type", () => text("ok", 200, "text/plain")],
    ["oversized body", () => json({ app: { id: "app-1", padding: "x".repeat(256) } })],
  ])("fails closed on %s", async (_label, responseFactory) => {
    const error = await capture(client(vi.fn(async () => responseFactory()), { maximumResponseBytes: 64 }).getApp("app-1"));
    expect(error.classification).toBe(ProviderResultClassification.READ_FAILED);
  });

  it("fails closed when the returned app/deployment/action identity differs", async () => {
    const appError = await capture(client(vi.fn(async () => json({ app: { id: "app-2" } }))).getApp("app-1"));
    expect(appError).toMatchObject({ classification: ProviderResultClassification.IDENTITY_MISMATCH });

    const deploymentError = await capture(client(vi.fn(async () => json({ deployment: { id: "deployment-2" } }))).getDeployment({ appId: "app-1", deploymentId: "deployment-1" }));
    expect(deploymentError).toMatchObject({ classification: ProviderResultClassification.IDENTITY_MISMATCH });

    const actionError = await capture(client(vi.fn(async () => json({ action: { id: 22 } }))).getAction(11));
    expect(actionError).toMatchObject({ classification: ProviderResultClassification.IDENTITY_MISMATCH });
  });

  it("lists only a bounded page of records and preserves provider pagination data", async () => {
    const fetchImpl = vi.fn(async () => json({ domain_records: [{ id: 7, type: "CNAME", name: "app", data: "target.example" }], links: { pages: {} }, meta: { total: 1 } }));
    const result = await client(fetchImpl).listDomainRecords({ domainName: "example.com", page: 2, perPage: 50, type: "CNAME", name: "app.example.com" });
    expect(result.value).toEqual({ records: [{ id: 7, type: "CNAME", name: "app", data: "target.example" }], links: { pages: {} }, meta: { total: 1 } });
    const requested = new URL(fetchImpl.mock.calls[0][0]);
    expect(Object.fromEntries(requested.searchParams)).toEqual({ page: "2", per_page: "50", name: "app.example.com", type: "CNAME" });
    expect(() => client(fetchImpl).listDomainRecords({ domainName: "example.com", perPage: 201 })).toThrow(/perPage/);
  });
});

describe("DigitalOceanApiClient mutations", () => {
  it("submits the caller-rendered full app spec unchanged and captures the resulting deployment identity", async () => {
    const spec = Object.freeze({ name: "physiqueos", services: [{ name: "web", github: { branch: "combined-app-platform-cutover" } }], workers: [] });
    const fetchImpl = vi.fn(async () => json({ app: { id: "app-1", spec, in_progress_deployment: { id: "deployment-1" } } }));
    const result = await client(fetchImpl).updateApp({ appId: "app-1", spec, updateAllSourceVersions: true, operationIdentity });

    expect(result).toMatchObject({
      classification: ProviderResultClassification.REQUEST_ACCEPTED,
      providerIdentity: { resourceId: "app-1", deploymentId: "deployment-1" },
      evidence: { providerResourceId: "app-1", providerDeploymentId: "deployment-1", operationIdentity },
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ spec, update_all_source_versions: true });
    expect(fetchImpl.mock.calls[0][1].method).toBe("PUT");
  });

  it("creates a forced deployment and binds our operation identity separately from provider identity", async () => {
    const fetchImpl = vi.fn(async () => json({ deployment: { id: "deployment-1", phase: "PENDING_BUILD" } }));
    const result = await client(fetchImpl).createDeployment({ appId: "app-1", forceBuild: true, operationIdentity });
    expect(result.providerIdentity).toEqual({ resourceId: "deployment-1", deploymentId: "deployment-1" });
    expect(result.evidence.operationIdentity).toEqual(operationIdentity);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ force_build: true });
  });

  it.each([400, 403, 409, 429, 500, 503])("classifies mutation HTTP %i as conclusively rejected with zero retries", async (status) => {
    const fetchImpl = vi.fn(async () => json({ message: "rejected" }, status));
    const error = await capture(client(fetchImpl, { maximumReadAttempts: 3 }).createDeployment({ appId: "app-1", forceBuild: true, operationIdentity }));
    expect(error).toMatchObject({ classification: ProviderResultClassification.REQUEST_REJECTED, evidence: { status, retryCount: 0 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies timeout, connection loss, malformed success, and truncated success as ambiguous and never retries", async () => {
    const cases = [
      vi.fn(() => new Promise(() => {})),
      vi.fn(async () => { throw new Error("ECONNRESET"); }),
      vi.fn(async () => text("not-json", 202, "application/json")),
      vi.fn(async () => text("partial", 202, "text/plain")),
    ];
    for (const fetchImpl of cases) {
      const error = await capture(client(fetchImpl, { requestTimeoutMs: 5, maximumReadAttempts: 3 }).createDeployment({ appId: "app-1", forceBuild: true, operationIdentity }));
      expect(error.classification).toBe(ProviderResultClassification.MUTATION_AMBIGUOUS);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("classifies an oversized successful mutation response as ambiguous with one mutation attempt", async () => {
    const fetchImpl = vi.fn(async () => json({ deployment: { id: "deployment-1", padding: "x".repeat(512) } }));
    const error = await capture(client(fetchImpl, { maximumResponseBytes: 64 }).createDeployment({ appId: "app-1", forceBuild: true, operationIdentity }));
    expect(error.classification).toBe(ProviderResultClassification.MUTATION_AMBIGUOUS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("supports exact domain and record CRUD envelopes without encoding routing policy", async () => {
    const responses = [
      json({ domain: { name: "example.com", ttl: 1800 } }, 201),
      json({ domain_record: { id: 7, type: "CNAME", name: "app", data: "target.example" } }, 201),
      json({ domain_record: { id: 7, type: "CNAME", name: "app", data: "other.example" } }),
      new Response(null, { status: 204 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift());
    const api = client(fetchImpl);
    await expect(api.createDomain({ name: "example.com", operationIdentity })).resolves.toMatchObject({ providerIdentity: { resourceId: "example.com" } });
    await expect(api.createDomainRecord({ domainName: "example.com", record: { type: "CNAME", name: "app", data: "target.example", ttl: 60 }, operationIdentity })).resolves.toMatchObject({ providerIdentity: { resourceId: 7 } });
    await expect(api.updateDomainRecord({ domainName: "example.com", recordId: 7, record: { data: "other.example" }, operationIdentity })).resolves.toMatchObject({ providerIdentity: { resourceId: 7 } });
    await expect(api.deleteDomainRecord({ domainName: "example.com", recordId: 7, operationIdentity })).resolves.toMatchObject({ classification: ProviderResultClassification.REQUEST_ACCEPTED });
    expect(fetchImpl.mock.calls.map(([, init]) => init.method)).toEqual(["POST", "POST", "PUT", "DELETE"]);
  });
});

describe("DigitalOcean provider safety contract", () => {
  it("rejects API base URLs containing credentials or sensitive URL state", () => {
    expect(() => createDigitalOceanApiClient({ accessToken: PAT, fetchImpl: vi.fn(), apiBaseUrl: `https://${PAT}@api.digitalocean.com` })).toThrow(/must not contain credentials/);
    expect(() => createDigitalOceanApiClient({ accessToken: PAT, fetchImpl: vi.fn(), apiBaseUrl: "not a url" })).toThrow("The DigitalOcean API base URL is invalid.");
  });

  it("redacts authorization, PAT-like values, credentials, hashes, signed URLs, and sensitive query values", () => {
    const unsafe = {
      Authorization: `Bearer ${PAT}`,
      note: `failed with ${PAT}`,
      credential: "plaintext",
      authorizationHash: "secret-hash",
      url: "https://objects.example/file?X-Amz-Credential=abc&X-Amz-Signature=def&safe=yes",
    };
    const serialized = JSON.stringify(redactProviderEvidence(unsafe));
    for (const secret of [PAT, "plaintext", "secret-hash", "abc", "def"]) expect(serialized).not.toContain(secret);
    expect(serialized).toContain("safe=yes");
  });

  it("documents exact least-privilege capability sets without broad api:write", () => {
    expect(DigitalOceanLeastPrivilegeScopes.appUpdate).toEqual(["app:update", "app:read", "regions:read", "sizes:read", "actions:read"]);
    expect(DigitalOceanLeastPrivilegeScopes.domainDelete).toEqual(["domain:delete", "domain:read"]);
    expect(JSON.stringify(DigitalOceanLeastPrivilegeScopes)).not.toContain("api:write");
  });
});

function client(fetchImpl, extra = {}) {
  return createDigitalOceanApiClient({ accessToken: PAT, fetchImpl, requestTimeoutMs: 50, ...extra });
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function text(body, status, contentType) {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

async function capture(promise) {
  try {
    await promise;
    throw new Error("Expected promise to reject.");
  } catch (error) {
    return error;
  }
}
