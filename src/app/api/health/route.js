import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function GET() {
  const [buildId, gitHead, runtimeMetadata] = await Promise.all([
    readBuildId().catch(() => null),
    readGitHead().catch(() => null),
    readRuntimeMetadata().catch(() => null),
  ]);

  return NextResponse.json({
    status: "ok",
    buildId,
    gitHead,
    startedAt: runtimeMetadata?.startedAt ?? process.env.PHYSIQUEOS_SERVER_STARTED_AT ?? null,
    runtimeMode: process.env.NODE_ENV ?? "production",
  });
}

async function readBuildId() {
  return String(await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim();
}

async function readGitHead() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), windowsHide: true, encoding: "utf8" });
  return String(stdout ?? "").trim();
}

async function readRuntimeMetadata() {
  const raw = await readFile(
    path.join(process.cwd(), "logs", "physiqueos-server.json"),
    "utf8"
  );
  return JSON.parse(String(raw).replace(/^\uFEFF/, ""));
}
