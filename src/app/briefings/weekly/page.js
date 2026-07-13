import {FounderRepositories} from "../../../data/repositories/founderRepositories";
import {createWeeklyNarrativeService} from "../../../domain/services/WeeklyNarrativeService";
import WeeklyBriefingScreen from "../../../screens/WeeklyBriefingScreen";
import DailyBriefingScreen from "../../../screens/DailyBriefingScreen";
export const dynamic="force-dynamic";
export default async function WeeklyPage(){const user=await FounderRepositories.users.getCurrentUser();const artifact=await createWeeklyNarrativeService({repositories:FounderRepositories}).getLatest({userId:user.id});if(!artifact)return <main className="app-surface min-h-screen p-8"><p className="font-bold">No Weekly Briefing is available yet.</p></main>;if(!artifact.briefing?.weeklyNarrative)return <DailyBriefingScreen backHref="/briefings/review" backLabel="Briefing History" briefing={artifact.briefing} eyebrow="Weekly Briefing"/>;return <WeeklyBriefingScreen narrative={artifact.briefing.weeklyNarrative}/>;}
