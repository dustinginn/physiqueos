import { saveProgressPhotoEvidence } from "./actions";
import ProgressPhotoUploadScreen from "../../../screens/ProgressPhotoUploadScreen";

export const dynamic = "force-dynamic";

export default function ProgressPhotoUploadPage() {
  return (
    <ProgressPhotoUploadScreen
      action={saveProgressPhotoEvidence}
      defaultDate={new Date().toISOString().slice(0, 10)}
    />
  );
}
