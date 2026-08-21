import { describe, expect, it } from "vitest";
import {
  loadPhase7BProductionConfiguration,
  PHASE7B_PRODUCTION_APP_ID,
  PHASE7B_ROUTING_LEAF,
  PHASE7B_ROUTING_ZONE,
} from "./Phase7BProductionConfiguration.js";

describe("Phase7BProductionConfiguration", () => {
  it("loads exact non-secret production identities while leaving credentials at transport boundaries", () => {
    const env = validEnvironment();
    env.DIGITALOCEAN_ACCESS_TOKEN = "synthetic-provider-secret";
    env.PHYSIQUEOS_DATABASE_URL = "synthetic-database-secret";
    const config = loadPhase7BProductionConfiguration({ env, expectedEnvironment: "physiqueos-production" });
    expect(config).toEqual({
      schemaVersion: 1,
      environment: "physiqueos-production",
      canonicalOwnerUserId: "phase7b-founder-owner",
      provider: {
        appId: PHASE7B_PRODUCTION_APP_ID,
        deploymentId: "bed088ae-064e-4420-845c-0d972ed81153",
        buildId: "phase7b-production-build",
        sourceCommit: "c240684ebd1c5366947c2bf73aabe1afa2eee407",
        webComponent: "web",
        workerComponent: "worker",
        customDomainReady: true,
      },
      routing: {
        parentDomain: "dustinginn.com",
        delegatedZone: PHASE7B_ROUTING_ZONE,
        publicLeaf: PHASE7B_ROUTING_LEAF,
        recordType: "CNAME",
        ttl: 60,
        windowsTarget: "windows-edge.example.net",
        providerTarget: "physiqueos-provider.ondigitalocean.app",
        windowsCustomDomainReady: true,
        providerCustomDomainReady: true,
      },
    });
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("synthetic-provider-secret");
    expect(serialized).not.toContain("synthetic-database-secret");
    expect(Object.isFrozen(config.routing)).toBe(true);
  });

  it.each([
    ["wrong environment", { PHYSIQUEOS_PHASE7B_ENVIRONMENT: "staging" }, "PHASE7B_CONFIG_IDENTITY_MISMATCH"],
    ["wrong app", { PHYSIQUEOS_PHASE7B_APP_ID: "00000000-0000-4000-8000-000000000000" }, "PHASE7B_CONFIG_IDENTITY_MISMATCH"],
    ["wrong web component", { PHYSIQUEOS_PHASE7B_WEB_COMPONENT: "frontend" }, "PHASE7B_CONFIG_IDENTITY_MISMATCH"],
    ["wrong worker component", { PHYSIQUEOS_PHASE7B_WORKER_COMPONENT: "jobs" }, "PHASE7B_CONFIG_IDENTITY_MISMATCH"],
    ["wrong zone", { PHYSIQUEOS_PHASE7B_ROUTING_ZONE: "dustinginn.com" }, "PHASE7B_CONFIG_IDENTITY_MISMATCH"],
    ["wrong leaf", { PHYSIQUEOS_PHASE7B_ROUTING_LEAF: "www.dustinginn.com" }, "PHASE7B_CONFIG_IDENTITY_MISMATCH"],
    ["wrong record type", { PHYSIQUEOS_PHASE7B_ROUTING_RECORD_TYPE: "A" }, "PHASE7B_CONFIG_IDENTITY_MISMATCH"],
    ["wrong TTL", { PHYSIQUEOS_PHASE7B_ROUTING_TTL: "300" }, "PHASE7B_CONFIG_VALUE_INVALID"],
    ["missing deployment", { PHYSIQUEOS_PHASE7B_PROVIDER_DEPLOYMENT_ID: "" }, "PHASE7B_CONFIG_VALUE_MISSING"],
    ["ambiguous target", { PHYSIQUEOS_PHASE7B_WINDOWS_ROUTING_TARGET: "physiqueos-provider.ondigitalocean.app" }, "PHASE7B_CONFIG_TARGET_AMBIGUOUS"],
    ["free ngrok edge", { PHYSIQUEOS_PHASE7B_WINDOWS_ROUTING_TARGET: "old-edge.ngrok-free.dev" }, "PHASE7B_CONFIG_WINDOWS_EDGE_UNSUPPORTED"],
    ["unproven Windows edge", { PHYSIQUEOS_PHASE7B_WINDOWS_EDGE_CUSTOM_DOMAIN_READY: "0" }, "PHASE7B_CONFIG_WINDOWS_EDGE_UNPROVEN"],
    ["unproven provider domain", { PHYSIQUEOS_PHASE7B_PROVIDER_CUSTOM_DOMAIN_READY: "0" }, "PHASE7B_CONFIG_PROVIDER_DOMAIN_UNPROVEN"],
    ["URL target", { PHYSIQUEOS_PHASE7B_PROVIDER_ROUTING_TARGET: "https://provider.example" }, "PHASE7B_CONFIG_HOSTNAME_INVALID"],
  ])("rejects %s", (_label, override, code) => {
    expect(() => loadPhase7BProductionConfiguration({
      env: { ...validEnvironment(), ...override },
      expectedEnvironment: "physiqueos-production",
    })).toThrow(expect.objectContaining({ code }));
  });
});

function validEnvironment() {
  return {
    PHYSIQUEOS_PHASE7B_ENVIRONMENT: "physiqueos-production",
    PHYSIQUEOS_PHASE7B_APP_ID: PHASE7B_PRODUCTION_APP_ID,
    PHYSIQUEOS_PHASE7B_WEB_COMPONENT: "web",
    PHYSIQUEOS_PHASE7B_WORKER_COMPONENT: "worker",
    PHYSIQUEOS_PHASE7B_ROUTING_ZONE: PHASE7B_ROUTING_ZONE,
    PHYSIQUEOS_PHASE7B_ROUTING_LEAF: PHASE7B_ROUTING_LEAF,
    PHYSIQUEOS_PHASE7B_ROUTING_RECORD_TYPE: "CNAME",
    PHYSIQUEOS_PHASE7B_ROUTING_TTL: "60",
    PHYSIQUEOS_PHASE7B_PROVIDER_DEPLOYMENT_ID: "bed088ae-064e-4420-845c-0d972ed81153",
    PHYSIQUEOS_PHASE7B_PROVIDER_BUILD_ID: "phase7b-production-build",
    PHYSIQUEOS_PHASE7B_PROVIDER_SOURCE_COMMIT: "c240684ebd1c5366947c2bf73aabe1afa2eee407",
    PHYSIQUEOS_PHASE7B_CANONICAL_OWNER_USER_ID: "phase7b-founder-owner",
    PHYSIQUEOS_PHASE7B_WINDOWS_ROUTING_TARGET: "windows-edge.example.net",
    PHYSIQUEOS_PHASE7B_PROVIDER_ROUTING_TARGET: "physiqueos-provider.ondigitalocean.app",
    PHYSIQUEOS_PHASE7B_WINDOWS_EDGE_CUSTOM_DOMAIN_READY: "1",
    PHYSIQUEOS_PHASE7B_PROVIDER_CUSTOM_DOMAIN_READY: "1",
  };
}
