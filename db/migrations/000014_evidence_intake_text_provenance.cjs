const UP_SQL = `
ALTER TABLE physiqueos.evidence_intake_receipts
  ADD COLUMN evidence_text_kind text
  CHECK (evidence_text_kind IS NULL OR evidence_text_kind IN ('founder_typed','client_extracted'));
`;

const DOWN_SQL = `
ALTER TABLE physiqueos.evidence_intake_receipts
  DROP COLUMN IF EXISTS evidence_text_kind;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
