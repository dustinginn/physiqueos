import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DestinationId } from "../../contracts/v1/destination.js";
import { listPhase3CommandContracts } from "../commands/Phase3CommandService.js";
import { Phase3ReadModel } from "../read-models/Phase3ReadModelService.js";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { getApplicationCapabilities } from "./getApplicationCapabilities.js";

const specification = JSON.parse(fs.readFileSync(new URL("../../../openapi/physiqueos-v1.json", import.meta.url), "utf8"));

describe("Phase 3 OpenAPI/runtime consistency", () => {
  it("matches destination, command, and read-model registries exactly", () => {
    expect(specification.info.version).toBe("1.0.0-foundation.3");
    expect(specification.paths["/capabilities"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(new Set(specification.components.schemas.Destination.properties.id.enum)).toEqual(new Set(Object.values(DestinationId)));
    expect(new Set(specification.components.schemas.ApplicationCommandContract.properties.commandType.enum)).toEqual(new Set(listPhase3CommandContracts().map((item) => item.commandType)));
    expect(new Set(specification.components.schemas.ApplicationReadModel.properties.model.enum)).toEqual(new Set(Object.values(Phase3ReadModel)));
  });

  it("returns the documented registry only to an authenticated synthetic principal", () => {
    expect(() => getApplicationCapabilities()).toThrowError(expect.objectContaining({ status: 401 }));
    const principal = createAuthenticationPrincipal({ userId: "synthetic-user", deviceId: "synthetic-device", sessionId: "synthetic-session" });
    expect(getApplicationCapabilities({ principal })).toMatchObject({ canonicalRuntime: "legacy_json_file", transportActivation: "inactive", readModels: Object.values(Phase3ReadModel) });
  });
});
