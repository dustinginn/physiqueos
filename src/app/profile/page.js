import { getProductionCoreNavigationReadService } from "../../application/composition/productionApplicationComposition";
import YouScreen from "../../screens/YouScreen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getProductionCoreNavigationReadService().getProfile();
  return <YouScreen profile={profile} />;
}
