import ProtocolTransitionPreviewScreen from "../../../../screens/ProtocolTransitionPreviewScreen";
import {
  markLiveProtocolTransitionReady,
  saveLiveProtocolDisposition,
} from "./actions";
import { loadLiveProtocolTransition } from "./context";

export const dynamic = "force-dynamic";

export default async function LiveProtocolTransitionPage({ searchParams }) {
  const query = await searchParams;
  const view = first(query.view);
  const viewMode = view?.endsWith("-edit")
    ? "edit"
    : view?.endsWith("-alternatives") ? "alternatives" : null;
  const { draft } = await loadLiveProtocolTransition();
  return (
    <ProtocolTransitionPreviewScreen
      draft={draft}
      finalReviewRoute={`/goals/transition/review?transitionId=${encodeURIComponent(draft.goalTransitionDraftId)}`}
      initialMode={first(query.mode) ?? viewMode}
      initialProtocol={first(query.protocol) ?? view?.replace(/-(edit|alternatives)$/, "")}
      initialSection={first(query.section) ?? "overview"}
      markReadyAction={markLiveProtocolTransitionReady}
      routeBase="/goals/transition/protocols"
      saveDispositionAction={saveLiveProtocolDisposition}
    />
  );
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
