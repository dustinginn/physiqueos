export function finishDurableOperatingPlanSave({ paths, revalidate }) {
  const failedPaths = [];
  for (const path of [...new Set(paths)]) {
    try {
      revalidate(path, "page");
    } catch {
      failedPaths.push(path);
    }
  }
  return Object.freeze({
    refreshed: failedPaths.length === 0,
    failedPaths: Object.freeze(failedPaths),
  });
}
