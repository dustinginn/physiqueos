import { loginWithGateSecret } from "./actions.js";
import { sanitizeNextPath } from "../../platform/accessGate/safeRedirect.js";

export const metadata = { title: "PhysiqueOS" };

export default async function FounderGatePage({ searchParams }) {
  const query = await searchParams;
  const hasError = query?.error === "1";
  const nextPath = sanitizeNextPath(query?.next);

  return (
    <main style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <form action={loginWithGateSecret} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: "20rem" }}>
        <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>PhysiqueOS</h1>
        <label htmlFor="accessCode" style={{ fontSize: "0.875rem" }}>Access code</label>
        <input
          id="accessCode"
          name="accessCode"
          type="password"
          autoComplete="off"
          autoFocus
          required
          style={{ padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: "0.5rem" }}
        />
        <input type="hidden" name="next" value={nextPath} />
        {hasError ? <p style={{ color: "#b91c1c", fontSize: "0.875rem" }} role="alert">Incorrect access code.</p> : null}
        <button
          type="submit"
          style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "#111827", color: "#fff", fontWeight: 600 }}
        >
          Continue
        </button>
      </form>
    </main>
  );
}
