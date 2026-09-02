import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000013_native_sandbox_bootstrap_pairing.cjs");

describe("Native sandbox recovery-authorized pairing migration", () => {
  it("allows exactly one session or recovery issuer while preserving owner binding", () => {
    expect(migration.UP_SQL).toContain("issued_by_session_id DROP NOT NULL");
    expect(migration.UP_SQL).toContain("issued_by_recovery_credential_id text");
    expect(migration.UP_SQL).toContain("pairing_credentials_recovery_issuer_unique");
    expect(migration.UP_SQL).toContain("FOREIGN KEY (issued_by_recovery_credential_id, user_id)");
    expect(migration.UP_SQL).toContain("pairing_credentials_exactly_one_issuer_check");
  });

  it("restores the original session-only pairing shape on rollback", () => {
    expect(migration.DOWN_SQL).toContain("DROP COLUMN IF EXISTS issued_by_recovery_credential_id");
    expect(migration.DOWN_SQL).toContain("issued_by_session_id SET NOT NULL");
  });
});
