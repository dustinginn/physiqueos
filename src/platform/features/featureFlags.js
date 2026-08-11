export function createFeatureFlagEvaluator({ flags = [] } = {}) {
  const byKey = new Map(flags.map((flag) => [flag.key, Object.freeze({ ...flag })]));
  return Object.freeze({
    isEnabled(key, { platform = null, build = null } = {}) {
      const flag = byKey.get(key);
      if (!flag || flag.enabled !== true) return false;
      if (flag.platforms?.length && !flag.platforms.includes(platform)) return false;
      if (flag.minimumBuild != null && compareBuild(build, flag.minimumBuild) < 0) return false;
      return true;
    },
    describe() {
      return Object.freeze([...byKey.values()].map(({ key, enabled, platforms = null, minimumBuild = null }) => Object.freeze({ key, enabled, platforms, minimumBuild })));
    },
  });
}

function compareBuild(actual, minimum) {
  const left = Number(actual);
  const right = Number(minimum);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return -1;
  return left === right ? 0 : left > right ? 1 : -1;
}
