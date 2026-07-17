import { createElement } from "react";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createMonthlyBriefingPreviewService } from "../../../../../domain/services/MonthlyBriefingPreviewService";
import MonthlyBriefingScreen from "../../../../../screens/MonthlyBriefingScreen";

export default async function MonthlyBriefingPreviewPage(){const user=await FounderRepositories.users.getCurrentUser();const narrative=await createMonthlyBriefingPreviewService({repositories:FounderRepositories}).preview({userId:user.id});return createElement(MonthlyBriefingScreen,{narrative});}
