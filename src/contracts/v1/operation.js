export const OperationStatus = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELED: "canceled",
});

const STATUSES = new Set(Object.values(OperationStatus));

export function createOperationResource(data = {}) {
  if (!data.id || !STATUSES.has(data.status)) throw new Error("Operation id and supported status are required.");
  return Object.freeze({
    operationVersion: "1",
    id: String(data.id),
    status: data.status,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    result: data.result ?? null,
    problem: data.problem ?? null,
  });
}
