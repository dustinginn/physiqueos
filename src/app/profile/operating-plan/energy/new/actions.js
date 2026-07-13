"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createCutEnergyStrategyService } from "../../../../../domain/services/CutEnergyStrategyService";
export async function activateCutEnergyStrategy(formData) { const user = await FounderRepositories.users.getCurrentUser(); const input = JSON.parse(String(formData.get("strategy") || "{}")); await createCutEnergyStrategyService({ repositories: FounderRepositories }).activate({ ...input, userId: user.id, effectiveAt: new Date().toISOString().slice(0,10), confirmedAt: new Date().toISOString() }); revalidatePath("/profile/operating-plan"); redirect("/profile/operating-plan?energy=activated"); }
