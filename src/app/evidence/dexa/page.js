import { saveDEXAEvidence } from "./actions";
import DEXAUploadScreen from "../../../screens/DEXAUploadScreen";

export const dynamic = "force-dynamic";

export default async function DEXAUploadPage({ searchParams }) {
  const query = await searchParams;
  return <DEXAUploadScreen action={saveDEXAEvidence} errorCode={query?.error ?? null} />;
}
