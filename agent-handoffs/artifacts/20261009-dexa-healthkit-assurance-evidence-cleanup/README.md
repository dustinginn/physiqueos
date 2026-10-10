# DEXA Evidence cleanup visual evidence

Candidate base: `59223a41052201121ca1ade24aaf3a4ad0db637e` (Native Build 95)

These simulator captures use the repository's deterministic Evidence review fixture. They contain no production health data.

| Capture | Purpose | SHA-256 |
| --- | --- | --- |
| `before-build95-dexa-evidence-dark.png` | Build 95 baseline showing the obsolete `DEXA → Apple Health` verification card | `866e8fb572acc0126f556fa9d6fca59e6af89009c54c7706d06e2c8b0a62fba3` |
| `after-candidate-dexa-evidence-dark.png` | Candidate Dark appearance; Latest Scan flows directly into DEXA summary metrics | `b362b8ce2ebccf6b17fb07a7636735487136be621b7b2a4fdfbf1033686c19f6` |
| `after-candidate-dexa-evidence-mineral.png` | Candidate Mineral appearance; card remains absent and layout closes cleanly | `c89dce73fbbd24500f4704ea7223dcbb1ae7fb07e6fbedc6375a16c80af5e257` |

The obsolete launch seam was deliberately left in the after-capture invocation. Its absence therefore verifies that the Evidence page no longer renders the temporary verification card even when old review tooling supplies the legacy state.
