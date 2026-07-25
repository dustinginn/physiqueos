"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Sparkles } from "lucide-react";
import { isLegacyIncompletePeptideUpdate } from "../domain/services/GoalProtocolTransitionService";
import { buildProtocolReviewReconciliation, preparedPlanSummary } from "../presentation/protocolReviewGroups";

const SECTIONS = ["overview", "protocols", "routine", "commitments", "review", "ready"];

export default function ProtocolTransitionPreviewScreen({
  draft: initialDraft,
  initialMode,
  initialProtocol,
  initialSection,
  markReadyAction,
  saveDispositionAction,
  routeBase = "/preview/goals/transition/protocols",
  finalReviewRoute = null,
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [section, setSection] = useState(SECTIONS.includes(initialSection) ? initialSection : "overview");
  const [selectedCategory, setSelectedCategory] = useState(initialProtocol ?? null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [showAlternatives, setShowAlternatives] = useState(initialMode === "alternatives");
  const [groupEditing, setGroupEditing] = useState(initialMode === "edit");
  const reconciliation = buildProtocolReviewReconciliation(draft);
  const reviewGroup = selectedCategory ? reconciliation.groups.find((item) => item.id === selectedCategory || item.reviews.some((review) => review.category === selectedCategory)) : null;

  function navigate(nextSection, category = null) {
    setSection(nextSection);
    setSelectedCategory(category);
    setShowAlternatives(false);
    setGroupEditing(false);
    const params = new URLSearchParams({ section: nextSection });
    if (category) params.set("protocol", category);
    window.history.replaceState(null, "", `${routeBase}?${params}`);
  }

  function followRecommendation(group, disposition = group.recommendation) {
    if (group.reviews.length > 1) {
      setGroupEditing(true);
      return;
    }
    const review = group.reviews[0];
    const protocolDraft = draft.protocolDrafts.find((item) => item.reviewId === review.id);
    const prepared = protocolDraft && ["ready", "valid"].includes(protocolDraft.status) && review.reviewStatus === "reviewed";
    if (prepared && ["update", "replace"].includes(review.intendedDisposition)) {
      window.location.assign(protocolEditRoute(routeBase, review.category));
      return;
    }
    startTransition(async () => {
      try {
        setMessage("");
        const next = await saveDispositionAction({ reviewId: review.id, disposition });
        setDraft(next);
        const nextDraft = next.protocolDrafts.find((item) => item.reviewId === review.id);
        const needsVirtualCadence = ["photos", "dexa"].includes(review.category) && !["ready", "valid"].includes(nextDraft?.status);
        if (["update", "replace"].includes(disposition) || needsVirtualCadence) window.location.assign(`${protocolEditRoute(routeBase, review.category)}?reviewId=${encodeURIComponent(review.id)}`);
        else navigate("protocols");
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function saveDisposition(reviewId, disposition, groupId = null) {
    startTransition(async () => {
      try {
        setMessage("");
        const next = await saveDispositionAction({ reviewId, disposition });
        setDraft(next);
        const nextReconciliation = buildProtocolReviewReconciliation(next);
        if (groupId && nextReconciliation.groups.find((group) => group.id === groupId)?.resolved) navigate("protocols");
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function editGroupedItem(review) {
    startTransition(async () => {
      try {
        setMessage("");
        setDraft(await saveDispositionAction({ reviewId: review.id, disposition: "update" }));
        window.location.assign(`${protocolEditRoute(routeBase, review.category)}?reviewId=${encodeURIComponent(review.id)}`);
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function markReady() {
    startTransition(async () => {
      try {
        setMessage("");
        const next = await markReadyAction();
        setDraft(next);
        if (finalReviewRoute) window.location.assign(finalReviewRoute);
        else navigate("ready");
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  return (
    <main className="app-surface mx-auto min-h-screen w-full max-w-[393px] overflow-x-hidden pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="px-4 pt-8">
        <header className="mb-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--primary)]">Protocol review</p>
          <h1 className="mt-1 text-2xl font-extrabold text-[var(--text-primary)]">Build Lean Mass Strategy</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">Your current goal and protocols remain unchanged while you prepare what comes next.</p>
        </header>

        <section className="rounded-[24px] border border-[var(--divider)] bg-[var(--surface-elevated)] p-4 shadow-sm">
          {reviewGroup ? (
            <ProtocolDetail draft={draft} editing={groupEditing} editGroupedItem={editGroupedItem} group={reviewGroup} navigate={navigate} onPrimary={followRecommendation} saveDisposition={saveDisposition} setEditing={setGroupEditing} setShowAlternatives={setShowAlternatives} showAlternatives={showAlternatives} />
          ) : (
            <SectionContent draft={draft} navigate={navigate} reconciliation={reconciliation} section={section} />
          )}
        </section>

        {message && <p className="mt-3 rounded-xl bg-[var(--surface-warning)] p-3 text-sm font-bold text-[var(--text-primary)]">{message}</p>}

        {!reviewGroup && section !== "ready" && (
          <nav className="mt-5 flex gap-3" data-testid="protocol-transition-actions">
            <button className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[14px] border border-[var(--divider)] bg-[var(--surface-elevated)] text-sm font-extrabold disabled:opacity-40" disabled={section === "overview" || pending} onClick={() => navigate(SECTIONS[Math.max(0, SECTIONS.indexOf(section) - 1)])}><ArrowLeft size={17}/> Back</button>
            {section === "review" ? (
              <button className="flex min-h-12 flex-[1.5] items-center justify-center gap-2 rounded-[14px] bg-[var(--primary)] px-3 text-sm font-extrabold text-white disabled:opacity-40" disabled={pending || !draft.validation.valid} onClick={markReady}><Check size={17}/> Ready for Activation</button>
            ) : (
              <button className="flex min-h-12 flex-[1.5] items-center justify-center gap-2 rounded-[14px] bg-[var(--primary)] text-sm font-extrabold text-white disabled:opacity-40" disabled={pending || (section === "protocols" && !reconciliation.isReadyForNext)} onClick={() => navigate(SECTIONS[Math.min(SECTIONS.length - 1, SECTIONS.indexOf(section) + 1)])}>{section === "overview" ? "Review Protocols" : "Next"} <ArrowRight size={17}/></button>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}

function protocolEditRoute(routeBase, category) {
  if (routeBase === "/preview/goals/transition/protocols") {
    // Preserve the accepted preview route shape: `/preview/goals/transition/protocols/edit/${review.category}`
    return `/preview/goals/transition/protocols/edit/${category}`;
  }
  return `${routeBase}/edit/${category}`;
}

function SectionContent({ draft, navigate, reconciliation, section }) {
  if (section === "overview") return <Overview draft={draft}/>;
  if (section === "protocols") return <ProtocolList navigate={navigate} reconciliation={reconciliation}/>;
  if (section === "routine") return <Routine draft={draft}/>;
  if (section === "commitments") return <Commitments draft={draft}/>;
  if (section === "review") return <FinalReview reconciliation={reconciliation}/>;
  return <ReadyConfirmation/>;
}

function Overview({ draft }) {
  const counts = dispositionCounts(draft);
  return <><Eyebrow/><h2 className="mt-3 text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">Let’s update the protocols for your new goal</h2><p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">Your current protocols will stay saved with your completed goal. We’ll use them as the starting point for the new protocols that support Build Lean Mass.</p><div className="mt-5 grid grid-cols-2 gap-3"><Metric label="Carrying forward" value={counts.keep}/><Metric label="Recommended updates" value={counts.update}/><Metric label="Pause or leave behind" value={counts.pause}/><Metric label="Still unresolved" value={draft.validation.unresolvedReviewIds.length}/></div></>;
}

function ProtocolList({ navigate, reconciliation }) {
  return <><Eyebrow/><h2 className="mt-3 text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">Let’s decide how each protocol should carry forward.</h2><p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">Each current plan stays with your completed goal. Here, you’re reviewing what the new goal needs.</p>{!reconciliation.isReadyForNext&&<div className="mt-4 rounded-2xl bg-[var(--surface-warning)] p-4"><p className="text-sm font-extrabold text-[var(--text-primary)]">Still needs review</p><p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">{reconciliation.unresolvedGroupNames.join(" · ")}</p></div>}<div className="mt-5 space-y-3">{reconciliation.groups.map((group)=><button className="w-full rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] p-4 text-left" key={group.id} onClick={()=>navigate("protocols",group.id)}><span className="flex items-start justify-between gap-3"><span><span className="block text-sm font-extrabold text-[var(--text-primary)]">{group.title}</span><span className="mt-1 block text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">{group.preparedItems.length?"Prepared plan":"Current plan"}</span><span className="mt-1 block space-y-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{(group.preparedItems.length?group.preparedItems:group.currentItems).map((item,index)=><span className="block" key={`${item.reviewId??item.id}_${index}`}><strong>{group.reviews.length>1?`${item.name} — `:""}</strong>{item.summary}</span>)}</span></span><ChevronRight className="mt-1 shrink-0 text-[var(--text-muted)]" size={18}/></span><span className="mt-3 flex items-center justify-between gap-2"><span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] text-[var(--text-secondary)]">{group.statusLabel}</span><span className="text-xs font-extrabold text-[var(--primary)]">{group.primaryAction}</span></span></button>)}</div></>;
}

function ProtocolDetail({ draft, editing, editGroupedItem, group, navigate, onPrimary, saveDisposition, setEditing, setShowAlternatives, showAlternatives }) {
  const review = group.reviews[0];
  const protocolDraft = draft.protocolDrafts.find((item)=>item.reviewId===review.id);
  const prepared = preparedPlanSummary(review, protocolDraft, { openingBaseline: draft.handoff?.openingEvidenceBaseline });
  if (editing && group.reviews.length > 1) return <GroupedPlanEditor draft={draft} editGroupedItem={editGroupedItem} group={group} navigate={navigate} saveDisposition={saveDisposition}/>;
  return <><button className="mb-4 flex min-h-11 items-center gap-2 text-sm font-extrabold text-[var(--text-secondary)]" onClick={()=>navigate("protocols")}><ArrowLeft size={17}/> Back to Protocols</button><Eyebrow/><h2 className="mt-3 text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">{group.title}</h2>{prepared.length>0&&<div className="mt-3 rounded-2xl bg-[var(--surface-success)] p-4"><p className="text-sm font-extrabold text-[var(--text-primary)]">Updated plan prepared</p><ul className="mt-2 list-disc pl-5 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{prepared.map((item)=><li key={item}>{item}</li>)}</ul></div>}<div className="mt-4 rounded-2xl bg-[var(--surface-muted)] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">Current plan</p>{group.currentItems.map((item)=><div className="mt-2" key={item.id}><p className="text-sm font-extrabold text-[var(--text-primary)]">{group.reviews.length>1&&item.name}</p><p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">{item.summary}</p></div>)}</div><Info label="Coach recommendation" value={`${group.recommendationTitle} ${group.recommendationReason}`}/><button className="mt-4 min-h-12 w-full rounded-[14px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white" onClick={()=>group.reviews.length>1?setEditing(true):onPrimary(group)}>{prepared.length>0?"Review or Edit Plan":group.primaryAction}</button><button className="mt-2 min-h-11 w-full text-sm font-extrabold text-[var(--text-secondary)]" onClick={()=>setShowAlternatives(!showAlternatives)}>I’d like to do something different</button>{showAlternatives&&<AlternativeChoices group={group} onChoose={onPrimary}/>}</>;
}

function AlternativeChoices({group,onChoose}){return <div className="mt-3 space-y-2 rounded-2xl border border-[var(--divider)] p-3"><p className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">Other options</p>{[["keep","Keep this plan"],["update","Update this plan"],["replace","Choose a new plan"],["pause","Pause for now"],["leave_behind","Leave it behind"]].map(([value,label])=><button className="min-h-11 w-full rounded-xl bg-[var(--surface-muted)] px-3 text-left text-sm font-extrabold text-[var(--text-primary)]" key={value} onClick={()=>onChoose(group,value)}>{label}</button>)}<p className="text-xs font-semibold leading-5 text-[var(--text-secondary)]"><strong>Update</strong> starts with the current strategy. <strong>Choose a new plan</strong> uses a fundamentally different strategy.</p></div>;}

function GroupedPlanEditor({draft,editGroupedItem,group,navigate,saveDisposition}) {
  return <><button className="mb-4 flex min-h-11 items-center gap-2 text-sm font-extrabold text-[var(--text-secondary)]" onClick={()=>navigate("protocols",group.id)}><ArrowLeft size={17}/> {group.title}</button><Eyebrow/><h2 className="mt-3 text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">Review {group.title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">Each plan stays separate. You can keep or change one without affecting the others.</p><div className="mt-4 space-y-3">{group.currentItems.map((item)=>{
    const review=group.reviews.find((entry)=>entry.id===item.id);
    const protocolDraft=draft.protocolDrafts.find((entry)=>entry.reviewId===review.id);
    const legacyIncomplete=isLegacyIncompletePeptideUpdate(draft,review,protocolDraft);
    const resolved=(review.intendedDisposition==="keep"&&["accepted","reviewed"].includes(review.reviewStatus)&&["ready","valid"].includes(protocolDraft?.status))||(["pause","leave_behind"].includes(review.intendedDisposition)&&review.reviewStatus==="reviewed"&&!protocolDraft)||(["update","replace"].includes(review.intendedDisposition)&&review.reviewStatus==="reviewed"&&["ready","valid"].includes(protocolDraft?.status));
    return <div className="rounded-2xl bg-[var(--surface-muted)] p-4" key={item.id}><div className="flex items-center justify-between gap-3"><p className="text-sm font-extrabold text-[var(--text-primary)]">{item.name}</p><span className="text-[10px] font-extrabold uppercase tracking-[.06em] text-[var(--text-muted)]">{resolved?"Reviewed":"Needs review"}</span></div>{legacyIncomplete?<><p className="mt-3 text-[10px] font-extrabold uppercase tracking-[.06em] text-[var(--text-muted)]">Current plan</p><p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{item.summary}</p><p className="mt-3 text-[10px] font-extrabold uppercase tracking-[.06em] text-[var(--text-muted)]">Coach recommendation</p><p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">Keep the current Retatrutide plan unless you want to change the schedule or taper.</p><div className="mt-3 space-y-2"><button className="min-h-11 w-full rounded-xl bg-[var(--primary)] px-3 text-xs font-extrabold text-white" onClick={()=>saveDisposition(review.id,"keep",group.id)}>Keep This Plan</button><button className="min-h-11 w-full rounded-xl border border-[var(--divider)] px-3 text-xs font-extrabold" onClick={()=>editGroupedItem(review)}>Review and Update</button></div></>:<><p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{item.summary}</p><div className="mt-3 grid grid-cols-2 gap-2"><button className="min-h-11 rounded-xl bg-[var(--primary)] px-2 text-xs font-extrabold text-white" onClick={()=>saveDisposition(review.id,"keep",group.id)}>Keep This Plan</button><button className="min-h-11 rounded-xl border border-[var(--divider)] px-2 text-xs font-extrabold" onClick={()=>saveDisposition(review.id,"pause",group.id)}>Pause</button><button className="min-h-11 rounded-xl border border-[var(--divider)] px-2 text-xs font-extrabold" onClick={()=>editGroupedItem(review)}>Update</button><button className="min-h-11 rounded-xl border border-[var(--divider)] px-2 text-xs font-extrabold" onClick={()=>saveDisposition(review.id,"leave_behind",group.id)}>Leave behind</button></div></>}</div>;
  })}</div><button className="mt-4 min-h-12 w-full rounded-[14px] bg-[var(--primary)] text-sm font-extrabold text-white" onClick={()=>navigate("protocols")}>Done Reviewing</button></>;
}

function Routine({ draft }) {
  const grouped = ["daily","weekly","periodic"];
  return <><Eyebrow/><h2 className="mt-3 text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">Your future routine</h2><p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">This is what you’ll actually do once the new goal and reviewed protocols are activated.</p>{grouped.map((frequency)=><div className="mt-5" key={frequency}><h3 className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--text-muted)]">{({daily:"Every Day",weekly:"Every Week",periodic:"Periodically"})[frequency]}</h3><div className="mt-2 space-y-2">{draft.generatedRoutine.filter((item)=>item.frequency===frequency).map((item)=><div className="rounded-xl bg-[var(--surface-muted)] p-3" key={item.id}><p className="text-sm font-extrabold text-[var(--text-primary)]">{item.text}</p>{item.change&&<p className="mt-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--primary)]">{item.change}</p>}</div>)}{!draft.generatedRoutine.some((item)=>item.frequency===frequency)&&<p className="text-xs font-semibold text-[var(--text-muted)]">Nothing reviewed yet.</p>}</div></div>)}</>;
}

function Commitments({ draft }) {
  return <><Eyebrow/><h2 className="mt-3 text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">What the new strategy expects</h2><p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">These expectations come only from protocols prepared for the new goal. Paused and left-behind protocols are excluded.</p><div className="mt-5 space-y-2">{draft.generatedCommitments.map((item)=><div className="flex gap-2 rounded-xl bg-[var(--surface-muted)] p-3" key={item.id}><Check className="mt-0.5 shrink-0 text-emerald-600" size={15}/><p className="text-sm font-extrabold text-[var(--text-primary)]">{item.requirement}</p></div>)}</div></>;
}

function FinalReview({ reconciliation }) {
  return <><Eyebrow/><h2 className="mt-3 text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">Review the strategy for your new goal</h2><Info label="New goal" value="Build Lean Mass"/><Info label="Guardrail" value="Stay approximately 8–9% body fat while gaining gradually."/><Info label="How we’ll start" value="Maintenance calibration"/><Info label="Briefing rhythm" value="Wednesday and Sunday; daily evidence collection continues."/><Info label="Protocol outcomes" value={`${reconciliation.preparedCount} prepared · ${reconciliation.unresolvedCount} unresolved`}/><Info label="Meaningful changes" value="Nutrition and activity will be reviewed together while maintenance is established. Coaching updates move from every morning to Wednesday and Sunday."/><div className={`mt-4 rounded-2xl p-4 ${reconciliation.isReadyForNext?"bg-[var(--surface-success)]":"bg-[var(--surface-warning)]"}`}><p className="font-extrabold text-[var(--text-primary)]">{reconciliation.isReadyForNext?"Ready to mark for activation":"A few decisions still need review"}</p><p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{reconciliation.isReadyForNext?"Your current goal and protocols are still unchanged.":`Review ${reconciliation.unresolvedGroupNames.join(", ")} before continuing.`}</p></div></>;
}

function ReadyConfirmation() {
  return <><Eyebrow/><h2 className="mt-3 text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">Your new goal and protocols are ready.</h2><p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">Nothing has been activated yet. Your current goal and its protocols remain unchanged.</p><div className="mt-5 rounded-2xl bg-[var(--surface-success)] p-4"><p className="font-extrabold text-[var(--text-primary)]">Ready for the final transition</p><p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">The next implementation step will connect this reviewed strategy to goal completion and activation as one safe operation.</p></div></>;
}

function Eyebrow(){return <div className="flex items-center gap-2 text-[var(--primary)]"><Sparkles size={18}/><p className="text-xs font-extrabold uppercase tracking-[.12em]">Coach guidance</p></div>;}
function Metric({label,value}){return <div className="rounded-2xl bg-[var(--surface-muted)] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">{label}</p><p className="mt-1 text-2xl font-black text-[var(--text-primary)]">{value}</p></div>;}
function Info({label,value}){return <div className="mt-3 rounded-2xl bg-[var(--surface-muted)] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">{label}</p><p className="mt-1 text-sm font-extrabold leading-6 text-[var(--text-primary)]">{value}</p></div>;}
function dispositionCounts(draft){return draft.protocolReviews.reduce((counts,item)=>{if(item.intendedDisposition==="keep")counts.keep++;else if(item.intendedDisposition==="update")counts.update++;else if(["pause","leave_behind"].includes(item.intendedDisposition))counts.pause++;return counts;},{keep:0,update:0,pause:0});}
