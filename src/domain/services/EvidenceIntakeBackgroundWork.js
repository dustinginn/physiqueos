export const EVIDENCE_INTAKE_INTERPRETATION_TOPIC = "evidence.intake.interpret";
export const EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION = "1";

export function createEvidenceIntakeInterpretationMessage(receipt, { createId }) {
  return Object.freeze({
    id: createId(),
    userId: receipt.ownerUserId,
    operationId: null,
    topic: EVIDENCE_INTAKE_INTERPRETATION_TOPIC,
    dedupeKey: receipt.id,
    payloadVersion: EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION,
    payload: Object.freeze({ intakeReceiptId: receipt.id }),
  });
}
