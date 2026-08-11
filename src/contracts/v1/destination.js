export const DestinationId = Object.freeze({
  PLATFORM_STATUS: "platform.status",
  OPERATION_DETAIL: "operation.detail",
});

const DESTINATIONS = new Set(Object.values(DestinationId));

export function createDestination(id, parameters = {}) {
  if (!DESTINATIONS.has(id)) throw new Error(`Unsupported destination: ${id}`);
  return Object.freeze({ id, parameters: Object.freeze({ ...parameters }) });
}

export function isDestinationId(value) {
  return DESTINATIONS.has(value);
}
