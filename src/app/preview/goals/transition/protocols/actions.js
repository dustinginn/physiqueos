"use server";

import { revalidatePath } from "next/cache";
import { loadProtocolTransitionPreview } from "./context";

const ROUTE = "/preview/goals/transition/protocols";

export async function saveProtocolDispositionAction({ reviewId, disposition }) {
  const { handoff, historicalProtocols, service } = await loadProtocolTransitionPreview();
  await service.saveDisposition({ handoff, historicalProtocols, reviewId, disposition });
  revalidatePath(ROUTE);
  return service.getOrPreview({ handoff, historicalProtocols });
}

export async function saveTransitionProtocolDraftAction({ reviewId, payload }) {
  const { handoff, historicalProtocols, service } = await loadProtocolTransitionPreview();
  await service.saveProtocolDraft({ handoff, historicalProtocols, reviewId, payload });
  revalidatePath(ROUTE);
  return service.getOrPreview({ handoff, historicalProtocols });
}

export async function markProtocolTransitionReadyAction() {
  const { handoff, historicalProtocols, service } = await loadProtocolTransitionPreview();
  await service.markReady({ handoff, historicalProtocols });
  revalidatePath(ROUTE);
  return service.getOrPreview({ handoff, historicalProtocols });
}
