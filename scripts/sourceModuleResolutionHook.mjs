import path from "node:path";

export async function resolve(specifier, context, nextResolve) {
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

function asSourceModule(result) {
  const pathname = result?.url?.startsWith("file:")
    ? new URL(result.url).pathname.replaceAll("\\", "/")
    : "";
  return pathname.includes("/src/") && pathname.endsWith(".js")
    ? { ...result, format: "module" }
    : result;
}
