import { fileURLToPath } from "node:url";
import { assertProviderBuildLocation } from "./scripts/providerBuildSafety.mjs";

/** @type {import('next').NextConfig} */
const isProviderFullRuntime = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1";
if (isProviderFullRuntime) assertProviderBuildLocation();

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.69", "float-departed-symphony.ngrok-free.dev"],
  distDir: process.env.PHYSIQUEOS_BUILD_DIST_DIR || ".next",
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  ...(isProviderFullRuntime ? { output: "standalone" } : {}),
  ...(isProviderFullRuntime ? {
    outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  } : {}),
  ...(isProviderFullRuntime ? {
    outputFileTracingExcludes: {
      "/*": [
        "private/**/*",
        "tmp/**/*",
        ".tmp/**/*",
        "logs/**/*",
        "screenshots/**/*",
        "test-results/**/*",
        "playwright-report/**/*",
        "backups/**/*",
        "runtime-exports/**/*",
        "scripts/**/*",
        "tests/**/*",
        "**/.env*",
        "**/*.dump",
        "**/*.backup",
        "src/data/founderSeed/**/*",
        "src/data/seed/**/*",
        "src/fixtures/**/*",
      ],
    },
  } : {}),
  webpack(config, { webpack }) {
    if (isProviderFullRuntime) {
      const replacement = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]data[\\/]repositories[\\/]founderRuntimeStore(?:\.js)?$/,
          replacement("./src/data/repositories/providerRuntimeStoreForbidden.js")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]platform[\\/]cutover[\\/]DurableMigrationControlStore(?:\.js)?$/,
          replacement("./src/platform/cutover/providerMigrationControlForbidden.js")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]fixtures[\\/]user(?:\.js)?$/,
          replacement("./src/platform/provider/safeUserFixture.js")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]fixtures[\\/]homeHeader(?:\.js)?$/,
          replacement("./src/platform/provider/safeHomeHeaderFixture.js")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]fixtures[\\/]goals(?:\.js)?$/,
          replacement("./src/platform/provider/safeGoalsFixture.js")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]fixtures[\\/]homeGoals(?:\.js)?$/,
          replacement("./src/platform/provider/safeHomeGoalsFixture.js")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]fixtures[\\/]monthlyBriefingPreview(?:\.js)?$/,
          replacement("./src/platform/provider/safeMonthlyPreviewFixture.js")
        )
      );
    }
    return config;
  },
};

export default nextConfig;
