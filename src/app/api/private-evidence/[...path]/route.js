import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const MIME_TYPES = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request, { params }) {
  const { path: pathParts = [] } = await params;
  const privateRoot = path.join(process.cwd(), "private");
  const requestedPath = path.join(privateRoot, ...pathParts);
  const resolvedPath = path.resolve(requestedPath);

  if (!resolvedPath.startsWith(path.resolve(privateRoot))) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const bytes = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();

    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "private, max-age=60",
        "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
