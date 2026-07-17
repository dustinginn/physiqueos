import MorningCheckInScreen from "../../../screens/MorningCheckInScreen";
import { saveMorningCheckIn } from "./actions";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { getLocalDateKey } from "../../../domain/utils/localDate";

export const dynamic = "force-dynamic";

export default async function MorningCheckInPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const today = getLocalDateKey(new Date(), user.timeZone);
  const weightEntries = await FounderRepositories.weights.listWeightEntries(user.id);
  const ordered = [...weightEntries].sort((a,b)=>String(b.measuredAt).localeCompare(String(a.measuredAt)));
  const existing = ordered.find((item)=>String(item.measuredAt).slice(0,10)===today)??null;
  const previous = ordered.find((item)=>String(item.measuredAt).slice(0,10)<today)??null;

  return (
    <MorningCheckInScreen
      action={saveMorningCheckIn}
      dateLabel={formatDate(today)}
      existingWeight={existing?.weight?.value??null}
      previousWeight={previous?.weight?.value??null}
    />
  );
}

function formatDate(value){const [year,month,day]=value.split("-").map(Number);return new Date(year,month-1,day).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});}
