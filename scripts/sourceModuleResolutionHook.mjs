import path from "node:path";

export async function resolve(specifier, context, nextResolve) {
  const replacement = providerReplacement(specifier, context);
  if (replacement) return asSourceModule(await nextResolve(replacement, context));
  try {
    return asSourceModule(await nextResolve(specifier, context));
  } catch (error) {
    if (
      !specifier.startsWith(".") ||
      path.extname(new URL(specifier, context.parentURL).pathname)
    ) {
      throw error;
    }
    if (error?.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
      return asSourceModule(await nextResolve(`${specifier}/index.js`, context));
    }
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return asSourceModule(await nextResolve(`${specifier}.js`, context));
  }
}

function providerReplacement(specifier, context) {
  if (process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || !context.parentURL ||
      !specifier.startsWith(".")) return null;
  const requested = new URL(specifier, context.parentURL).pathname.replaceAll("\\", "/");
  if (/\/data\/repositories\/founderRuntimeStore(?:\.js)?$/.test(requested)) {
    return new URL("../src/data/repositories/providerRuntimeStoreForbidden.js", import.meta.url).href;
  }
  if (/\/platform\/cutover\/DurableMigrationControlStore(?:\.js)?$/.test(requested)) {
    return new URL("../src/platform/cutover/providerMigrationControlForbidden.js", import.meta.url).href;
  }
  return null;
}

function asSourceModule(result) {
  const pathname = result?.url?.startsWith("file:")
    ? new URL(result.url).pathname.replaceAll("\\", "/")
    : "";
  return pathname.includes("/src/") && pathname.endsWith(".js")
    ? { ...result, format: "module" }
    : result;
}
