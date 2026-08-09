import { saveProgressPhotoEvidence } from "./actions";
import ProgressPhotoUploadScreen from "../../../screens/ProgressPhotoUploadScreen";
import {
  parseEvidenceRecoverySearchParams,
} from "../../../domain/services/EvidenceRecoveryContext";

export const dynamic = "force-dynamic";

export default async function ProgressPhotoUploadPage({ searchParams }) {
  const params = await searchParams;
  const recoveryContext = parseEvidenceRecoverySearchParams(params);
  const requestedView = String(params?.view ?? "");
  const defaultView = requestedView === "back" || requestedView === "rear"
    ? "back"
    : "front";
  const confirmationIntent = params?.confirmationPurpose === "visible_abs_completion"
      ? {
        goalId: params?.goalId === "goal_visible_abs_at_rest" ? params.goalId : "goal_visible_abs_at_rest",
        confirmationPurpose: "visible_abs_completion",
        numericalThresholdComplete: params?.numericalThresholdComplete === "true",
        visualCriterionComplete: params?.visualCriterionComplete === "true" ? true : params?.visualCriterionComplete === "false" ? false : "uncertain",
        criterion: params?.criterion === "lower_abs_visible_at_rest" ? params.criterion : "lower_abs_visible_at_rest",
        requiredPose: params?.requiredPose === "front-relaxed" ? params.requiredPose : "front-relaxed",
        userConfirmationRequired: params?.userConfirmationRequired !== "false",
        requestedEvidence: String(params?.requestedEvidence ?? "relaxed_front_photo"),
        sourceContext: String(params?.sourceContext ?? "dexa_event"),
        sourceId: String(params?.sourceId ?? ""),
      }
    : null;

  return (
    <ProgressPhotoUploadScreen
      action={saveProgressPhotoEvidence}
      defaultDate={recoveryContext?.date ?? new Date().toISOString().slice(0, 10)}
      defaultView={defaultView}
      confirmationIntent={confirmationIntent}
      recoveryContext={recoveryContext}
      returnTo={recoveryContext?.returnTo ?? (params?.session ? `/log?session=${params.session}` : null)}
    />
  );
}
