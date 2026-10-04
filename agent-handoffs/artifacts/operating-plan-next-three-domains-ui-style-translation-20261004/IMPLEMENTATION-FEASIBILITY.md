# Implementation feasibility

The concepts are direct visual translations, not new product behavior.

- Reuse: existing `OperatingPlanProtocolDomainView`, `OperatingPlanRecoverySupportView`, `OperatingPlanPeptideExecutionView`, peptide focused sheets, `PeptideDosePlanEditor`, `OperatingPlanSupplementSupportView`, `OperatingPlanSupplementEditorView`, shared schedule editor and current navigation destinations.
- Reuse locked presentation grammar: Operating Plan hero, compact section headings, line-field details, restrained surfaces, semantic chips, mineral-light surfaces and current action hierarchy.
- Estimated visual implementation complexity: Recovery **small–medium**; Peptides **medium–large** because the current behavior already spans sheets, advanced editor and lifecycle states; Supplements **medium** because one visual family must cover domain, Support and strategy create/edit.
- No new Server contract, Native destination, write command or data field is proposed.
- No history page is invented. Peptide history stays in Advanced; supplement strategy history remains version semantics rather than a current visible route.
