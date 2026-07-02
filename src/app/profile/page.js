import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createYouProfileService } from "../../domain/services/YouProfileService";
import YouScreen from "../../screens/YouScreen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const service = createYouProfileService({
    repositories: FounderRepositories,
  });
  const profile = await service.getYouProfile();

  return <YouScreen profile={profile} />;
}
