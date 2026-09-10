# Portable Provider Artifact Gate

## Purpose

`npm run provider:build:isolated` validates a DigitalOcean provider candidate
from a clean detached checkout of one exact Git commit. It is intentionally
independent of the local Windows PhysiqueOS runtime. Windows Task Scheduler,
port 3000, `deployPhysiqueOS.ps1`, and a pre-existing local `.next`, `BUILD_ID`,
or `SOURCE_COMMIT` are not inputs to provider release validation.

The optional `npm run provider:build:windows-protected` command retains the old
Windows before/after runtime-protection check for local operators. It delegates
artifact building, assembly, provenance, and privacy validation to the portable
core. Windows runtime health is therefore an optional local lifecycle concern,
not a provider-artifact acceptance requirement.

## Candidate-artifact guarantees

The portable gate requires:

- an explicit 40-character source commit;
- a detached checkout whose `HEAD` exactly equals that commit;
- no tracked or non-ignored untracked source changes;
- no untracked/ignored private payload or `.env*` input in the isolated
  checkout (tracked privacy-boundary documentation remains permitted);
- build and artifact destinations wholly inside the isolated checkout and not
  reached through an escaping symbolic/reparse path;
- a physical dependency tree rather than a junction to another checkout;
- successful Next.js provider/standalone compilation;
- successful bounded worker dependency collection;
- successful privacy scanning of the complete artifact root; and
- successful validation of the artifact manifest against its embedded web and
  worker identities and current content hashes.

The explicit source commit is verified as a Git commit and bound to its Git tree
identity before compilation. Build finalization writes the requested source
commit, provider build identity, Git tree, and candidate Next.js `BUILD_ID` into
the build output before artifact assembly. The same structured identity is
embedded in both web and worker artifacts. A top-level manifest binds those
identities to file counts, byte counts, and SHA-256 hashes. Validation rejects
source mismatch, identity mismatch, manifest corruption, or artifact mutation.

Privacy scanning rejects private filenames and roots, Founder owner identifiers,
Founder seed/source paths, recovery archives, credential-bearing database URIs,
DigitalOcean tokens, complete private keys, caller-supplied sensitive values,
and caller-supplied forbidden production file hashes.

## Portable invocation

Run from a clean detached exact-commit checkout with a physical `node_modules`:

```text
npm run provider:build:isolated -- \
  --isolated-root <exact-commit-checkout> \
  --source-commit <40-character-commit> \
  --provider-build-id <release-candidate-id> \
  --dist-dir <fresh-isolated-dist-dir> \
  --artifact-dir <fresh-isolated-artifact-dir>
```

The checkout may be a detached Git worktree or a separate clean clone. A dirty
developer root, its `.worktrees`, local runtime, and local operational files are
not read or scanned.

When validating an exact historical commit whose `next.config.mjs` predates the
portable gate, the runner supplies an isolated, non-existent path sentinel for
that version's former path-separation variable. The sentinel is inside the
candidate checkout, contains no runtime state, and is never created or read. It
allows the exact historical source to retain its old build guard without
consulting Windows, Task Scheduler, port 3000, or a local `.next`.

## Separation from Windows lifecycle safety

The checks formerly performed by the provider wrapper against the canonical
Windows `.next`, retained recovery directories, scheduled task, listener PID,
process start time, and runtime health protect the local Windows runtime. They do
not prove anything about the contents of a DigitalOcean candidate artifact.
Those checks remain in `providerBuildSafety.mjs` and the optional Windows wrapper
for local runtime operations; they are no longer prerequisites for provider
release validation.
