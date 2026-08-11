export const PROBLEM_VERSION = "1";

export class ApplicationProblem extends Error {
  constructor({ status, code, title, detail = null, type = null, fieldErrors = [], recovery = null, cause } = {}) {
    super(detail ?? title ?? code ?? "Application request failed.", { cause });
    this.name = "ApplicationProblem";
    this.status = Number(status ?? 500);
    this.code = String(code ?? "INTERNAL_ERROR");
    this.title = String(title ?? "Application request failed");
    this.detail = detail == null ? null : String(detail);
    this.type = type ?? `https://physiqueos.app/problems/${this.code.toLowerCase().replaceAll("_", "-")}`;
    this.fieldErrors = fieldErrors;
    this.recovery = recovery;
  }
}

export function toProblemDetails(error, { requestId = null, instance = null } = {}) {
  const problem = error instanceof ApplicationProblem
    ? error
    : new ApplicationProblem({ status: 500, code: "INTERNAL_ERROR", title: "The request could not be completed." });
  return Object.freeze({
    problemVersion: PROBLEM_VERSION,
    type: problem.type,
    title: problem.title,
    status: problem.status,
    code: problem.code,
    detail: problem.detail,
    instance,
    requestId,
    fieldErrors: Array.isArray(problem.fieldErrors) ? problem.fieldErrors : [],
    recovery: problem.recovery ?? null,
  });
}

export function staleVersionProblem({ expectedVersion, actualVersion, resource = null } = {}) {
  return new ApplicationProblem({
    status: 412,
    code: "STALE_VERSION",
    title: "The resource changed after it was loaded.",
    detail: "Refresh the canonical state and reapply the local change.",
    recovery: { expectedVersion: String(expectedVersion), actualVersion: String(actualVersion), resource },
  });
}
