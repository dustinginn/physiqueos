import { saveDEXAEvidence } from "./actions";
import DEXAUploadScreen from "../../../screens/DEXAUploadScreen";

export const dynamic = "force-dynamic";

export default function DEXAUploadPage() {
  return <DEXAUploadScreen action={saveDEXAEvidence} />;
}
