export function runRepositoryReadScope({ repositories, readModel, callback } = {}) {
  if (typeof callback !== "function") throw new Error("Repository read scope requires a callback.");
  const runInReadScope = repositories?.runInReadScope;
  return typeof runInReadScope === "function"
    ? runInReadScope(callback, { readModel })
    : callback();
}

export function scopeRepositoryReadService({ repositories, namespace, service } = {}) {
  if (!service || typeof service !== "object") throw new Error("Repository read scope requires a service.");
  const runInReadScope = repositories?.runInReadScope;
  if (typeof runInReadScope !== "function") return service;
  const scoped = Object.fromEntries(Object.entries(service).map(([name, value]) => [
    name,
    typeof value === "function"
      ? (...args) => runRepositoryReadScope({
          repositories,
          readModel: `${namespace}.${name}`,
          callback: () => value(...args),
        })
      : value,
  ]));
  return Object.isFrozen(service) ? Object.freeze(scoped) : scoped;
}
