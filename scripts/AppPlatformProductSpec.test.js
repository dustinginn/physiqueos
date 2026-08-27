import fs from "node:fs";
import { describe, expect, it } from "vitest";

const template = fs.readFileSync("infra/digitalocean/app.product.template.yaml", "utf8");
const dockerfile = fs.readFileSync("Dockerfile.product", "utf8");
const nextConfig = fs.readFileSync("next.config.mjs", "utf8");

describe("full-product App Platform specification", () => {
  it("preserves the accepted app, component topology, health check and alerts", () => {
    expect(template.match(/^  - name: web$/gm)).toHaveLength(1);
    expect(template.match(/^  - name: worker$/gm)).toHaveLength(1);
    expect(template.match(/instance_size_slug: apps-s-1vcpu-0\.5gb/g)).toHaveLength(2);
    expect(template.match(/instance_count: 1/g)).toHaveLength(2);
    expect(template).toContain("http_path: /api/v1/health/live");
    expect(template.match(/rule: DEPLOYMENT_FAILED/g)).toHaveLength(1);
    expect(template.match(/rule: DOMAIN_FAILED/g)).toHaveLength(1);
    expect(template.match(/rule: CPU_UTILIZATION/g)).toHaveLength(2);
    expect(template.match(/rule: MEM_UTILIZATION/g)).toHaveLength(2);
    expect(template.match(/rule: RESTART_COUNT/g)).toHaveLength(2);
  });

  it("keeps compatibility mode explicit and enables only the provider dry-run boundary through an explicit render input", () => {
    expect(template.match(/PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE/g)).toHaveLength(2);
    expect(template.match(/PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT/g)).toHaveLength(2);
    expect(template.match(/PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED[^\n]*PROVIDER_MIGRATION_DRY_RUN_ENABLED/g)).toHaveLength(2);
    expect(template.match(/PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY/g)).toHaveLength(2);
    expect(template.match(/PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256/g)).toHaveLength(2);
    expect(template.match(/PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED/g)).toHaveLength(2);
    expect(template).not.toContain("DIGITALOCEAN_ACCESS_TOKEN");
    expect(template).not.toContain("PHYSIQUEOS_MIGRATION_DATABASE_URL");
  });

  it("retains the Next server runtime required by standalone route modules", () => {
    expect(nextConfig).not.toContain('".next*/**/*"');
    expect(dockerfile).toContain("test -f .next/standalone/.next/server/webpack-runtime.js");
  });
});
