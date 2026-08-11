import { staleVersionProblem } from "../../contracts/v1/problem";

export function assertExpectedVersion({ expectedVersion, actualVersion, resource = null }) {
  const expected = normalizeVersion(expectedVersion);
  const actual = normalizeVersion(actualVersion);
  if (expected !== actual) throw staleVersionProblem({ expectedVersion: expected, actualVersion: actual, resource });
  return actual;
}

export function nextAggregateVersion(currentVersion) {
  return (BigInt(normalizeVersion(currentVersion)) + 1n).toString();
}

function normalizeVersion(value) {
  const candidate = String(value);
  if (!/^[1-9]\d*$/.test(candidate)) throw new Error("Aggregate version must be a positive integer.");
  return candidate;
}
