// Constant-time string comparison via digest-then-compare, using only Web
// Crypto so it works in any runtime this codebase's other accessGate
// modules run in. Never short-circuits on length or content.
export async function timingSafeStringEqual(a, b) {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(String(a ?? ""))),
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(String(b ?? ""))),
  ]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let index = 0; index < bytesA.length; index += 1) diff |= bytesA[index] ^ bytesB[index];
  return diff === 0 && String(a ?? "").length > 0;
}
