import {
  V3_SCHEMA,
  deepFreeze,
  evaluateDeclarativePredicate,
  semanticFingerprint,
} from "./V3Runtime.js";

export function reduceCoachingStateV3({
  goalContract,
  interpretationContext,
  priorCoachingState = null,
  evaluatedAt,
}) {
  const questions = new Map((priorCoachingState?.questions ?? []).map((item) =>
    [item.questionId, structuredClone(item)]));
  const transitions = [];
  for (const [id, question] of questions) {
    if (question.status === "open" && question.strategyRevisionId && question.strategyRevisionId !== goalContract.strategy.strategyRevisionId) {
      questions.set(id, { ...question, status: "superseded", supersededAt: evaluatedAt });
      transitions.push(transition(id, "open", "superseded", "strategy_revision_changed", evaluatedAt));
    }
  }

  for (const { definition, parentId } of questionDefinitions(goalContract.strategicQuestions)) {
    if (parentId && questions.get(parentId)?.status !== "answered") continue;
    if (!questions.has(definition.questionId) && definition.raiseWhen && !evaluateDeclarativePredicate(interpretationContext, definition.raiseWhen)) continue;
    if (!questions.has(definition.questionId)) {
      questions.set(definition.questionId, createOpenQuestion(definition, evaluatedAt));
      transitions.push(transition(definition.questionId, null, "open", "question_raised", evaluatedAt));
    }
    const question = questions.get(definition.questionId);
    if (question.status === "open" && definition.supersedeWhen && evaluateDeclarativePredicate(interpretationContext, definition.supersedeWhen)) {
      questions.set(definition.questionId, { ...question, status: "superseded", supersededAt: evaluatedAt });
      transitions.push(transition(definition.questionId, "open", "superseded", "configured_question_supersession", evaluatedAt));
      continue;
    }
    if (question.status !== "open" || !definition.answerWhen) continue;
    if (!evaluateDeclarativePredicate(interpretationContext, definition.answerWhen)) continue;
    const answered = {
      ...question,
      status: "answered",
      answerCode: definition.answerCode,
      answeredAt: evaluatedAt,
      answeredByEvidenceIds: [...interpretationContext.answerEvidenceIds],
    };
    questions.set(definition.questionId, answered);
    transitions.push(transition(definition.questionId, "open", "answered", definition.answerCode, evaluatedAt));
    if (definition.nextQuestionOnAnswer && !questions.has(definition.nextQuestionOnAnswer.questionId)) {
      const next = createOpenQuestion(definition.nextQuestionOnAnswer, evaluatedAt);
      questions.set(next.questionId, next);
      transitions.push(transition(next.questionId, null, "open", "successor_question_raised", evaluatedAt));
    }
  }

  const ordered = [...questions.values()].sort((left, right) =>
    (right.priority ?? 0) - (left.priority ?? 0) || String(left.raisedAt).localeCompare(String(right.raisedAt)) ||
    left.questionId.localeCompare(right.questionId));
  const currentRevision = goalContract.strategy.strategyRevisionId;
  const nextOpenQuestion = ordered.find((item) =>
    item.status === "open" && item.strategyRevisionId === currentRevision) ??
    ordered.find((item) => item.status === "open") ?? null;
  const semantic = {
    schemaVersion: V3_SCHEMA.coachingState,
    goalId: goalContract.goalId,
    priorCoachingStateId: priorCoachingState?.id ?? null,
    questions: ordered,
    transitions,
    nextOpenQuestionId: nextOpenQuestion?.questionId ?? null,
    nextEvidencePurpose: nextOpenQuestion?.evidencePurpose ?? null,
  };
  return deepFreeze({
    ...semantic,
    id: `coaching_state_v3|${semanticFingerprint(semantic).slice(7)}`,
    updatedAt: evaluatedAt,
  });
}

function questionDefinitions(definitions, parentId = null) {
  return definitions.flatMap((definition) => [{ definition, parentId }, ...(definition.nextQuestionOnAnswer ? questionDefinitions([definition.nextQuestionOnAnswer], definition.questionId) : [])]);
}

function createOpenQuestion(definition, raisedAt) {
  return {
    questionId: definition.questionId,
    kind: definition.kind,
    priority: definition.priority ?? 0,
    text: definition.text,
    strategyRevisionId: definition.strategyRevisionId,
    evidencePurpose: definition.evidencePurpose,
    status: "open",
    raisedAt,
    answeredAt: null,
    answerCode: null,
    answeredByEvidenceIds: [],
  };
}

function transition(questionId, from, to, reason, occurredAt) {
  return { questionId, from, to, reason, occurredAt };
}
