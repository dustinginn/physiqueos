import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  diagnoseAuthority,
  diagnoseProtocolState,
} from "./ProtocolStateDiagnosticService";

const file = path.resolve(process.cwd(), "private/founder/runtime-store.json");
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));
const diagnostic = () => diagnoseProtocolState(read());

describe("protocol state diagnostic", () => {
  it("groups production protocols and never writes", () => {
    const before = fs.readFileSync(file, "utf8");
    const result = diagnoseProtocolState(JSON.parse(before));

    expect(fs.readFileSync(file, "utf8")).toBe(before);
    expect(result.counts).toMatchObject({
      protocols: 24,
      activeProtocols: 15,
      plannedProtocols: 0,
      activeCommitments: 16,
    });
    expect(result.groups.Peptides.filter((item) => item.status === "active")).toHaveLength(2);
    expect(result.groups.Supplements.filter((item) => item.status === "active")).toHaveLength(4);
    expect(result.authority.status).toBe("legacy_compatible");
    expect(result.migrationContext).toEqual({
      markerPresent: false,
      determinesAuthority: false,
    });
  });

  it("compares transition disposition with the persisted lifecycle outcome", () => {
    const nutrition = diagnostic().transition.reviews.find(
      (item) => item.sourceProtocolId === "protocol_nutrition_founder_cut"
    );

    expect(nutrition).toMatchObject({
      disposition: "update",
      outcome: { originalStatus: "archived", actual: "new_record_created" },
    });
  });

  it("traces Retatrutide priorities through stable protocol ownership", () => {
    expect(diagnostic().retatrutide).toMatchObject({
      originalProtocolId: "protocol_retatrutide_founder",
      activeProtocolIds: ["protocol_retatrutide_founder"],
      reminderPriorityId: "reminder_retatrutide",
      transitionDisposition: "keep",
    });
  });

  it("reports the current Operating Plan sources", () => {
    expect(diagnostic().operatingPlan).toMatchObject({
      energyRecordId: expect.stringContaining("future_virtual_energy"),
      energyGoalId: "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass",
      nutritionContextId: "nutrition_context_founder_alpha",
      calorieRange: null,
    });
  });

  it("distinguishes Foam Rolling commitment from its canonicalized protocol", () => {
    const value = diagnostic().foamRolling;
    expect(value.protocol).toMatchObject({ status: "active" });
    expect(value.executionItem).toMatchObject({ id: "execution_foam_roll" });
    expect(value.reminder).toMatchObject({ id: "reminder_foam_roll_daily" });
    expect(value.status).toBe("healthy");
  });

  it("reports authoritative duplicates without a migration marker", () => {
    expect(diagnostic().duplicates).toEqual([]);
  });
});

describe("authoritative protocol-state classification", () => {
  it("does not require a migration marker for healthy canonical state", () => {
    const fixture = canonicalFixture();
    const withoutMarker = diagnoseProtocolState(fixture);
    const withMarker = diagnoseProtocolState({
      ...fixture,
      protocolReconciliationMigrations: [{ id: "historical" }],
    });

    expect(withoutMarker.authority.status).toBe("healthy");
    expect(withMarker.authority).toEqual(withoutMarker.authority);
    expect(withMarker.migrationContext.determinesAuthority).toBe(false);
  });

  it("keeps an unambiguous versionless root legacy compatible", () => {
    const fixture = canonicalFixture();
    delete fixture.protocols[0].currentVersionId;
    fixture.protocolVersions = [];

    expect(diagnoseAuthority(fixture).status).toBe("legacy_compatible");
  });

  it("diagnoses missing ownership and invalid current versions as incomplete", () => {
    const missingOwnership = canonicalFixture();
    missingOwnership.protocols[0].currentGoalIds = [];
    expect(diagnoseAuthority(missingOwnership)).toMatchObject({
      status: "incomplete",
      protocols: [
        expect.objectContaining({
          issues: expect.arrayContaining(["missing_active_goal_ownership"]),
        }),
      ],
    });

    const missingVersion = canonicalFixture();
    missingVersion.protocols[0].currentVersionId = "missing";
    expect(diagnoseAuthority(missingVersion)).toMatchObject({
      status: "incomplete",
      protocols: [
        expect.objectContaining({
          issues: expect.arrayContaining(["invalid_current_version"]),
        }),
      ],
    });
  });

  it("a marker cannot make duplicate or orphaned authority healthy", () => {
    const fixture = canonicalFixture();
    fixture.protocols.push({
      ...structuredClone(fixture.protocols[0]),
      id: "protocol-duplicate",
      currentVersionId: null,
    });
    fixture.executionItems.push({
      id: "orphan",
      active: true,
      protocolRootId: "missing",
      type: "supplement",
    });
    fixture.protocolReconciliationMigrations = [{ id: "historical" }];

    const result = diagnoseProtocolState(fixture);
    expect(result.authority.status).toBe("invalid");
    expect(result.authority.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate_active_protocol",
        "orphaned_protocol_execution",
      ])
    );
  });

  it("ignores paused and archived roots and requires concrete stable Execution ownership", () => {
    const fixture = canonicalFixture();
    fixture.protocols.push(
      { ...fixture.protocols[0], id: "paused", status: "paused" },
      { ...fixture.protocols[0], id: "archived", status: "archived" }
    );
    fixture.executionItems = [];
    const strategyOnly = diagnoseAuthority(fixture);
    expect(strategyOnly.protocols).toHaveLength(1);
    expect(strategyOnly.executions).toEqual([]);

    fixture.executionItems.push({
      id: "execution-supplement",
      active: true,
      protocolRootId: "protocol",
      type: "supplement",
    });
    expect(diagnoseAuthority(fixture).executions).toEqual([
      {
        id: "execution-supplement",
        protocolId: "protocol",
        status: "healthy",
        issues: [],
      },
    ]);
  });

  it("resolves peptide Executions through stable links and remains deterministic", () => {
    const fixture = canonicalFixture();
    fixture.protocols[0].category = "peptide";
    fixture.executionItems = [
      {
        id: "execution-beta",
        active: true,
        protocolRootId: "protocol",
        type: "peptide",
      },
      {
        id: "execution-alpha",
        active: true,
        linkedProtocolId: "protocol",
        type: "protocol",
      },
    ];
    const forward = diagnoseAuthority(fixture);
    const reverse = diagnoseAuthority({
      ...fixture,
      executionItems: fixture.executionItems.slice().reverse(),
    });

    expect(forward.executions.map((item) => item.id)).toEqual([
      "execution-alpha",
      "execution-beta",
    ]);
    expect(reverse).toEqual(forward);
  });
});

function canonicalFixture() {
  return {
    goals: [{ id: "goal", status: "active" }],
    protocols: [
      {
        id: "protocol",
        category: "supplement",
        currentGoalIds: ["goal"],
        currentVersionId: "version",
        sourceProtocolId: "source",
        status: "active",
      },
    ],
    protocolVersions: [
      {
        id: "version",
        protocolId: "protocol",
        status: "active",
      },
    ],
    executionItems: [
      {
        id: "execution",
        active: true,
        protocolRootId: "protocol",
        type: "supplement",
      },
    ],
  };
}
