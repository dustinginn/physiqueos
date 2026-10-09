import { FOUNDATION_SOURCE_COLLECTIONS } from "../migration/foundationSourceCollections.js";

const SINGLETON_COLLECTIONS = new Set(["user", "nutritionContext", "operatingPlan"]);
// Promise resolution and Node inspection probe these on any returned value;
// they are not collection reads.
const BENIGN_KEYS = new Set(["then", "constructor", "toJSON", "inspect"]);

/**
 * A bounded canonical load fills every collection it did not read with an empty
 * default, so code that reaches past the bounded set would silently compute
 * from nothing (a briefing missing its Goal, an evaluation missing its scans).
 * This view keeps the loaded collections exactly as loaded and replaces every
 * other Founder collection with a non-enumerable sentinel that throws on first
 * use. Repository construction (which only stores references) and the
 * whole-store semantic digest (which enumerates keys) are unaffected; any real
 * read of an unloaded collection fails loudly as a retryable step failure
 * instead of degrading the result.
 */
export function createGuardedBoundedRuntime(runtime, loadedCollections = []) {
  if (!runtime || typeof runtime !== "object") {
    throw new Error("A guarded bounded runtime requires a loaded canonical runtime.");
  }
  const loaded = new Set(loadedCollections);
  for (const collection of loaded) {
    if (!FOUNDATION_SOURCE_COLLECTIONS.includes(collection)) {
      throw Object.assign(new Error(`Unknown Founder collection ${collection}.`), {
        code: "BOUNDED_READ_COLLECTION_UNKNOWN",
      });
    }
  }
  const guarded = {};
  for (const [key, value] of Object.entries(runtime)) {
    if (FOUNDATION_SOURCE_COLLECTIONS.includes(key) && !loaded.has(key)) continue;
    guarded[key] = value;
  }
  for (const collection of FOUNDATION_SOURCE_COLLECTIONS) {
    if (loaded.has(collection)) continue;
    Object.defineProperty(guarded, collection, {
      configurable: false,
      enumerable: false,
      value: unloadedCollection(collection),
      writable: false,
    });
  }
  return guarded;
}

export function isUnloadedCollectionError(error) {
  return error?.code === "BOUNDED_READ_COLLECTION_NOT_LOADED";
}

function unloadedCollection(collection) {
  const fail = () => {
    throw Object.assign(
      new Error(`Founder collection ${collection} was not loaded by this bounded read.`),
      { code: "BOUNDED_READ_COLLECTION_NOT_LOADED", collection }
    );
  };
  return new Proxy(SINGLETON_COLLECTIONS.has(collection) ? {} : [], {
    get(_target, key) {
      if (key === Symbol.iterator || key === Symbol.asyncIterator) return fail();
      if (typeof key === "symbol" || BENIGN_KEYS.has(key)) return undefined;
      return fail();
    },
    has: fail,
    ownKeys: fail,
    set: fail,
    defineProperty: fail,
    deleteProperty: fail,
    getOwnPropertyDescriptor: fail,
  });
}
