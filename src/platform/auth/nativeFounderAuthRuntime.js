import { requireScope } from "../../application/auth/principal.js";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import {
  getProductionFounderAuthService,
  getProductionFounderWeightSummaryReadService,
} from "../../application/composition/productionApplicationComposition.js";
import { foundationBuildIdentity, foundationLogger } from "../foundation/runtime.js";
import { createFounderBearerAuthenticator } from "./requestAuthenticator.js";

let productionRuntime;

export function createNativeFounderAuthRuntime({ founderAuthService, weightSummaryReadService, logger = null, clock = () => performance.now() } = {}) {
  if (!founderAuthService || !weightSummaryReadService) throw new Error("Native Founder auth runtime dependencies are required.");
  const authenticator = createFounderBearerAuthenticator(founderAuthService);

  return Object.freeze({
    buildIdentity: foundationBuildIdentity,
    logger,
    async pair({ pairingCredential, platform, displayName, requestId = null }) {
      if (platform !== "ios" || !String(displayName ?? "").trim() || String(displayName).trim().length > 80) {
        throw invalidRequest("The iPhone device description is invalid.");
      }
      const startedAt = clock();
      const session = await founderAuthService.registerDeviceWithPairing({ pairingCredential, platform, displayName: String(displayName).trim() });
      logger?.info("native.auth.device_registered", { requestId, durationMs: elapsed(clock, startedAt), route: "/api/v1/native/auth/pair", status: 200 });
      return session;
    },
    async refresh({ refreshCredential, requestId = null }) {
      const startedAt = clock();
      const session = await founderAuthService.rotateRefreshCredential(refreshCredential);
      logger?.info("native.auth.refresh_succeeded", { requestId, durationMs: elapsed(clock, startedAt), route: "/api/v1/native/auth/refresh", status: 200 });
      return session;
    },
    async revokeSession({ request, requestId = null }) {
      const startedAt = clock();
      const principal = await authenticator.authenticate(request);
      await founderAuthService.revokeSession({ principal });
      logger?.info("native.auth.session_revoked", { requestId, durationMs: elapsed(clock, startedAt), route: "/api/v1/native/auth/session", status: 200 });
      return Object.freeze({ revoked: true });
    },
    async readWeightSummary({ request, requestId = null }) {
      const startedAt = clock();
      const authStartedAt = clock();
      const principal = requireScope(await authenticator.authenticate(request), "founder:read");
      const authDurationMs = elapsed(clock, authStartedAt);
      const readStartedAt = clock();
      const result = await weightSummaryReadService.getCurrentWeight({ principal });
      logger?.info("native.weight_summary_read.succeeded", {
        requestId,
        route: "/api/v1/native/weight/summary",
        status: 200,
        authDurationMs,
        readDurationMs: elapsed(clock, readStartedAt),
        durationMs: elapsed(clock, startedAt),
      });
      return result;
    },
  });
}

function invalidRequest(title) {
  return new ApplicationProblem({ status: 400, code: "AUTH_REQUEST_INVALID", title });
}

export function getProductionNativeFounderAuthRuntime(env = process.env) {
  if (!productionRuntime) {
    productionRuntime = createNativeFounderAuthRuntime({
      founderAuthService: getProductionFounderAuthService(env),
      weightSummaryReadService: getProductionFounderWeightSummaryReadService(env),
      logger: foundationLogger,
    });
  }
  return productionRuntime;
}

export function resetProductionNativeFounderAuthRuntimeForTests() {
  if (process.env.NODE_ENV === "production") throw new Error("The Native Founder auth runtime cannot be reset in production.");
  productionRuntime = undefined;
}

function elapsed(clock, startedAt) {
  return Math.max(0, Math.round((clock() - startedAt) * 100) / 100);
}
