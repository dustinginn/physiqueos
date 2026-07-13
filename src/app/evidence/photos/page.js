import { saveProgressPhotoEvidence } from "./actions";
import ProgressPhotoUploadScreen from "../../../screens/ProgressPhotoUploadScreen";

export const dynamic = "force-dynamic";

export default async function ProgressPhotoUploadPage({ searchParams }) {
  const params = await searchParams;
  const requestedView = String(params?.view ?? "");
  const defaultView = requestedView === "back" || requestedView === "rear"
    ? "back"
    : "front";

  return (
    <ProgressPhotoUploadScreen
      action={saveProgressPhotoEvidence}
      defaultDate={new Date().toISOString().slice(0, 10)}
      defaultView={defaultView}
      returnTo={params?.session ? `/log?session=${params.session}` : null}
    />
  );
}
