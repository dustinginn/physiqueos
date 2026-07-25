"use server";

import { revalidatePath } from "next/cache";
import { loadLiveProtocolTransition } from "./context";

const ROUTE = "/goals/transition/protocols";

export async function saveLiveProtocolDisposition({ reviewId, disposition }) {
  return safelySave(async () => {
    const context = await loadLiveProtocolTransition();
    await context.service.saveDisposition({ ...context, reviewId, disposition });
    revalidatePath(ROUTE);
    return context.service.getOrPreview(context);
  });
}

export async function saveLiveTransitionProtocolDraft({ reviewId, payload }) {
  return safelySave(async () => {
    const context = await loadLiveProtocolTransition();
    await context.service.saveProtocolDraft({ ...context, reviewId, payload });
    revalidatePath(ROUTE);
    return context.service.getOrPreview(context);
  });
}

async function safelySave(operation) {
  try {
    return await operation();
  } catch (error) {
    console.error("Live protocol transition save failed.", {
      code: error?.code ?? "PROTOCOL_TRANSITION_SAVE_FAILED",
      name: error?.name ?? "Error",
    });
    throw new Error("We couldn't save this plan. Your current goal is unchanged. Please try again.");
  }
}

export async function markLiveProtocolTransitionReady() {
  const context = await loadLiveProtocolTransition();
  await context.service.markReady(context);
  revalidatePath(ROUTE);
  return context.service.getOrPreview(context);
}
