import ProtocolTransitionPreviewScreen from "../../../../../screens/ProtocolTransitionPreviewScreen";
import {
  markProtocolTransitionReadyAction,
  saveProtocolDispositionAction,
} from "./actions";
import { loadProtocolTransitionPreview } from "./context";

export const dynamic = "force-dynamic";

export default async function ProtocolTransitionPreviewPage({ searchParams }) {
  const query = await searchParams;
  const view = first(query.view);
  const viewMode = view?.endsWith("-edit") ? "edit" : view?.endsWith("-alternatives") ? "alternatives" : null;
  const viewProtocol = view?.replace(/-(edit|alternatives)$/, "");
  const { draft } = await loadProtocolTransitionPreview();
  return (
    <ProtocolTransitionPreviewScreen
      draft={draft}
      initialMode={first(query.mode) ?? viewMode}
      initialProtocol={first(query.protocol) ?? viewProtocol}
      initialSection={first(query.section) ?? "overview"}
      markReadyAction={markProtocolTransitionReadyAction}
      saveDispositionAction={saveProtocolDispositionAction}
    />
  );
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
