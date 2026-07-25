import { getTrainingRepresentativePathPreview } from "../../../../../domain/services/TrainingRepresentativePathPreviewService";
import TrainingRepresentativePathPreviewScreen from "../../../../../screens/TrainingRepresentativePathPreviewScreen";
export const dynamic="force-dynamic";
export default async function Page({searchParams}){const query=await searchParams;return <TrainingRepresentativePathPreviewScreen model={await getTrainingRepresentativePathPreview({context:query?.context})} view="arms"/>}
