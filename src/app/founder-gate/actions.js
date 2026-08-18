"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAccessGateExpected, readAccessGateSecret } from "../../platform/accessGate/accessGateConfig.js";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_LIFETIME_MS } from "../../platform/accessGate/sessionToken.js";
import { sanitizeNextPath } from "../../platform/accessGate/safeRedirect.js";
import { checkLoginRateLimit } from "../../platform/accessGate/loginRateLimiter.js";
import { timingSafeStringEqual } from "../../platform/accessGate/timingSafeCompare.js";

export async function loginWithGateSecret(formData) {
  const env = process.env;
  const nextPath = sanitizeNextPath(formData.get("next"));
  const failureRedirect = () => redirect(`/founder-gate?error=1${nextPath !== "/" ? `&next=${encodeURIComponent(nextPath)}` : ""}`);

  if (!isAccessGateExpected(env)) failureRedirect();

  const secret = readAccessGateSecret(env);
  if (!secret) failureRedirect();

  const requestHeaders = await headers();
  const rateLimitKey = requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("x-real-ip") ?? "unknown";
  const rateLimit = checkLoginRateLimit(rateLimitKey);
  if (!rateLimit.allowed) failureRedirect();

  const supplied = String(formData.get("accessCode") ?? "");
  if (!(await timingSafeStringEqual(supplied, secret))) failureRedirect();

  const token = await createSessionToken(secret);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_LIFETIME_MS / 1000),
  });

  redirect(nextPath);
}

export async function logoutFounderGate() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/founder-gate");
}
