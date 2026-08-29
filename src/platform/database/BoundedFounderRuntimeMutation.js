import { assertKnownPhase4Collection } from "../migration/phase4DomainCollections.js";

export function createShallowWritableFounderRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new Error("Bounded Founder mutation requires a loaded canonical runtime.");
  }
  return { ...runtime };
}

export function detachBoundedFounderCollections(runtime, collections = []) {
  let detachedCollectionCount = 0;
  for (const collection of collections ?? []) {
    assertKnownPhase4Collection(collection);
    const source = runtime[collection];
    if (Array.isArray(source)) {
      runtime[collection] = [...source];
      detachedCollectionCount += 1;
    } else if (source && typeof source === "object") {
      runtime[collection] = { ...source };
      detachedCollectionCount += 1;
    }
  }
  return detachedCollectionCount;
}
