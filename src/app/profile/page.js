import { getProductionCoreNavigationReadService } from "../../application/composition/productionApplicationComposition";
import { isAccessGateExpected } from "../../platform/accessGate/accessGateConfig.js";
import YouScreen from "../../screens/YouScreen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getProductionCoreNavigationReadService().getProfile();
  return <YouScreen nativePairingAvailable={isAccessGateExpected(process.env)} profile={profile} />;
}
