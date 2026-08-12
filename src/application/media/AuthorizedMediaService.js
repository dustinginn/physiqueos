import { createAuthorizedReadDescriptor } from "../../platform/object-storage/privateObjectContracts.js";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { assertPrincipalOwns, requireAuthenticationPrincipal } from "../auth/principal.js";

export function createAuthorizedMediaService({ catalog, delivery, clock = () => new Date() } = {}) {
  if (!catalog?.getObject || !delivery?.authorizeRead) {
    throw new Error("Authorized media requires catalog and delivery adapters.");
  }
  return Object.freeze({
    async authorizeRead({ principal, objectId, renditionId = null, lifetimeSeconds = 300 } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const object = await catalog.getObject({ objectId, ownerUserId: actor.userId, renditionId });
      if (!object) throw unavailable();
      assertPrincipalOwns(actor, object.ownerUserId);
      const expiresInSeconds = Math.min(300, Math.max(1, Number(lifetimeSeconds) || 300));
      const access = await delivery.authorizeRead({ object, expiresInSeconds, principal: actor });
      const accessHandle = access?.accessHandle ?? access?.url;
      if (!accessHandle) throw new Error("The media delivery adapter returned no authorized access handle.");
      return createAuthorizedReadDescriptor({
        objectId: object.id,
        ownerUserId: object.ownerUserId,
        contentType: object.contentType,
        size: object.size,
        sha256: object.sha256,
        expiresAt: new Date(clock().getTime() + expiresInSeconds * 1000).toISOString(),
        accessHandle,
      });
    },
  });
}

function unavailable() {
  return new ApplicationProblem({ status: 404, code: "OBJECT_NOT_FOUND", title: "The private object is unavailable." });
}
