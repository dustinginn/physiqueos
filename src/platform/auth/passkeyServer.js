import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

export function createPasskeyServer({ rpName, rpId, expectedOrigin }) {
  if (!rpName || !rpId || !expectedOrigin) throw new Error("Passkey relying-party configuration is required.");
  return Object.freeze({
    generateRegistrationOptions: (input) => generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userID: new TextEncoder().encode(input.userId),
      userName: input.userName,
      userDisplayName: input.displayName,
      excludeCredentials: input.excludeCredentials ?? [],
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    }),
    verifyRegistrationResponse: ({ response, expectedChallenge }) => verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID: rpId, requireUserVerification: true }),
    generateAuthenticationOptions: (input = {}) => generateAuthenticationOptions({ rpID: rpId, userVerification: "required", allowCredentials: input.allowCredentials ?? [] }),
    verifyAuthenticationResponse: ({ response, expectedChallenge, credential }) => verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID: rpId, credential, requireUserVerification: true }),
  });
}
