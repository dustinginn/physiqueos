"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Dumbbell, FileText, Images, Scale, Trash2 } from "lucide-react";
import Card from "../components/ui/Card";
import EvidenceImage from "../components/progress/EvidenceImage";

const POSES = [["front-relaxed","Front Relaxed"],["back-relaxed","Rear Relaxed"],["back-flexed","Rear Flexed"]];
const UNKNOWN = [["unknown","Unknown"],["true","Yes"],["false","No"]];

export default function EvidenceReviewScreen({ confirmAction, decisionAction, discardAction, review }) {
  const [evidencePackage, setEvidencePackage] = useState(review.interpretedEvidence);
  const objects = evidencePackage?.evidence_objects ?? [];
  const activeObjects = objects.filter((item) => review.itemDecisions?.[item.id]?.included !== false);
  const updateObject = (index, next) => setEvidencePackage((current) => ({ ...current, evidence_objects: current.evidence_objects.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item) }));
  const status = review.status;
  const canEdit = ["pending", "commit_failed", "partially_committed"].includes(status);
  const blockingPhotoIssue = activeObjects.some((object) => {
    if (object.evidence_type !== "photo_session") return false;
    const poses = (object.photos ?? []).filter((photo) => photo.active !== false).map(photoPoseId);
    return new Set(poses).size !== poses.length || POSES.some(([id]) => !poses.includes(id));
  });

  return <main className="app-surface min-h-screen"><div className="mx-auto max-w-[720px] px-4 py-10">
    <Link className="text-sm font-bold text-[var(--primary)]" href="/log">← Back to Log</Link>
    <header className="mt-5"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-indigo-600">Evidence Review</p><h1 className="mt-2 text-3xl font-extrabold text-slate-950">Confirm what happened.</h1><p className="mt-2 text-sm leading-6 text-slate-600">Review PhysiqueOS&apos;s understanding before it becomes part of your history. Unknown values stay unknown.</p></header>
    <div className="mt-6 space-y-4">{objects.map((object, index) => { const included=review.itemDecisions?.[object.id]?.included!==false; return <div className={included?"":"opacity-60"} key={object.id??index}><EvidenceSection disabled={!canEdit||!included} object={object} onChange={(next)=>updateObject(index,next)} onRemove={()=>{}}/><form action={decisionAction} className="-mt-6 mb-4 px-5 pb-4"><input name="reviewId" type="hidden" value={review.id}/><input name="itemId" type="hidden" value={object.id}/><input name="included" type="hidden" value={included?"false":"true"}/><button className="text-xs font-extrabold text-indigo-700" disabled={!canEdit} type="submit">{included?"Exclude from confirmation":"Include in confirmation"}</button></form></div>;})}</div>
    {Object.keys(review.commitProgress??{}).length>0&&<Card className="mt-6 space-y-3"><h2 className="font-extrabold">Processing status</h2>{Object.entries(review.commitProgress).map(([step,value])=><div className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs" key={step}><p className="font-extrabold capitalize">{step.replaceAll("_"," ")} · {value.status}</p><p className="mt-1 text-slate-500">Attempts: {value.attempts??0}</p>{value.error&&<p className="mt-1 font-bold text-red-700">{value.error}</p>}<p className="mt-1 break-all text-slate-500">{resultIds(value.result)}</p></div>)}</Card>}
    {activeObjects.length === 0 && <Card className="mt-6"><p className="font-bold">No evidence remains in this check-in.</p></Card>}
    <form action={confirmAction} className="mt-6 space-y-4">
      <input name="reviewId" type="hidden" value={review.id}/><textarea className="hidden" name="evidenceJson" readOnly value={JSON.stringify(evidencePackage)}/>
      {canEdit ? <><div className="flex gap-3"><button className="min-h-12 flex-1 rounded-xl bg-[var(--primary)] px-4 font-extrabold text-white disabled:opacity-40" disabled={activeObjects.length===0||blockingPhotoIssue} type="submit">{status==="partially_committed"?"Retry Processing":"Confirm Check-In"}</button><button className="min-h-12 rounded-xl border border-[var(--divider)] px-4 font-bold" formAction={discardAction} type="submit">Discard</button></div>{["commit_failed","partially_committed"].includes(status) && <p className="text-sm font-bold text-red-700">Processing stopped safely at {failedStep(review.commitProgress) ?? "a downstream step"}. Successful steps will not run again.</p>}</> : <Card><p className="font-bold text-slate-900">This review was {status}.</p></Card>}
    </form>
  </div></main>;
}

function EvidenceSection(props) {
  const type=props.object.evidence_type;
  if(type==="photo_session"||type==="progress_photo")return <PhotoReview {...props}/>;
  if(type==="morning_weight"||type==="weight")return <WeightReview {...props}/>;
  if(["dexa_scan","dexa","body_composition"].includes(type))return <DexaReview {...props}/>;
  if(type==="training")return <WorkoutReview {...props}/>;
  return <GenericReview {...props}/>;
}

function PhotoReview({disabled,object,onChange,onRemove}) {
  const photos=object.photos??[];
  const poseIds=photos.filter((p)=>p.active!==false).map(photoPoseId);
  const duplicates=poseIds.filter((pose,index)=>poseIds.indexOf(pose)!==index);
  const required=["front-relaxed","back-relaxed","back-flexed"];
  const missing=required.filter((pose)=>!poseIds.includes(pose));
  const conditions=object.conditions??{};
  const updatePhoto=(index,next)=>onChange({photos:photos.map((photo,itemIndex)=>itemIndex===index?{...photo,...next}:photo)});
  return <ReviewCard icon={Images} title="Photo Session" onRemove={onRemove} disabled={disabled}>
    {(duplicates.length>0||missing.length>0)&&<Warning>{duplicates.length>0?"A pose appears more than once. Remove a retry or choose the correct pose.":`Missing ${missing.map(poseLabel).join(", ")}. You may still save unknown conditions, but the standard set is incomplete.`}</Warning>}
    <Field label="Capture date"><input disabled={disabled} type="date" value={String(object.observed_at??"").slice(0,10)} onChange={(event)=>onChange({observed_at:event.target.value})}/></Field>
    <div className="grid gap-3 sm:grid-cols-3">{photos.map((photo,index)=>photo.active===false?null:<div className="overflow-hidden rounded-2xl border border-[var(--divider)]" key={photo.id??index}><EvidenceImage alt={poseLabel(photoPoseId(photo))} className="aspect-[3/4] w-full object-cover" src={privateEvidenceUrl(photo.storage_path??photo.imagePath)}/><div className="space-y-2 p-3"><Select disabled={disabled} label="Pose" value={photoPoseId(photo)} options={POSES} onChange={(value)=>{const [view,pose]=value==="back-flexed"?["back","flexed"]:value.split("-");updatePhoto(index,{view,pose});}}/>{duplicates.includes(photoPoseId(photo))&&<p className="text-xs font-bold text-amber-700">Duplicate pose</p>}<button className="text-xs font-bold text-red-600" disabled={disabled} onClick={()=>updatePhoto(index,{active:false})} type="button">Remove image</button></div></div>)}</div>
    <div className="grid grid-cols-2 gap-3"><Select label="Time of day" disabled={disabled} value={conditionValue(conditions.timeOfDay)} options={[["unknown","Unknown"],["morning","Morning"],["afternoon","Afternoon"],["evening","Evening"]]} onChange={(value)=>onChange({conditions:{...conditions,timeOfDay:value}})}/>{[["fasted","Fasted"],["postWorkout","Post-workout"],["pump","Pump"]].map(([key,label])=><Select key={key} label={label} disabled={disabled} value={conditionValue(conditions[key])} options={UNKNOWN} onChange={(value)=>onChange({conditions:{...conditions,[key]:triState(value)}})}/>)}</div>
    <div className="grid grid-cols-2 gap-3"><Select label="Lighting" disabled={disabled} value={conditionValue(conditions.lighting)} options={[["unknown","Unknown"],["same","Same"],["different","Different"]]} onChange={(value)=>onChange({conditions:{...conditions,lighting:value}})}/><Select label="Location" disabled={disabled} value={conditionValue(conditions.location)} options={[["unknown","Unknown"],["same","Same"],["different","Different"]]} onChange={(value)=>onChange({conditions:{...conditions,location:value}})}/></div>
  </ReviewCard>;
}

function WeightReview({disabled,object,onChange,onRemove}) { const status=object.reviewStatus??object.correctionStatus??"new_entry"; return <ReviewCard icon={Scale} title="Weight" onRemove={onRemove} disabled={disabled}><div className="grid grid-cols-2 gap-3"><Field label="Weight"><input disabled={disabled} min="1" step="0.1" type="number" value={object.value??object.weight?.value??""} onChange={(e)=>onChange({value:Number(e.target.value)})}/></Field><Select disabled={disabled} label="Units" value={object.unit??object.weight?.unit??"lb"} options={[["lb","lb"],["kg","kg"]]} onChange={(unit)=>onChange({unit})}/><Field label="Date"><input disabled={disabled} type="date" value={String(object.observed_at??"").slice(0,10)} onChange={(e)=>onChange({observed_at:e.target.value})}/></Field><div><Label>Status</Label><p className="input-shell">{String(status).replaceAll("_"," ")}</p></div></div></ReviewCard>; }

function DexaReview({disabled,object,onChange,onRemove}) { const metadata=object.metadata??{}; const fields=[["totalMass","Weight"],["bodyFatPercentage","Body Fat %"],["fatMass","Fat Mass"],["leanMass","Lean Mass"],["boneMineralContent","Bone Mass"],["restingMetabolicRate","RMR"],["vatMass","VAT Mass"],["vatVolume","VAT Volume"]]; return <ReviewCard icon={FileText} title="DEXA" onRemove={onRemove} disabled={disabled}>{object.review_metadata?.duplicateCandidate&&<Warning>This may duplicate an existing scan.</Warning>}<Field label="Scan date"><input disabled={disabled} type="date" value={String(object.observed_at??"").slice(0,10)} onChange={(e)=>onChange({observed_at:e.target.value})}/></Field><div className="grid grid-cols-2 gap-3">{fields.map(([key,label])=><Field label={label} key={key}><input disabled={disabled} step="0.1" type="number" value={metadata[key]??""} placeholder="Unknown" onChange={(e)=>onChange({metadata:{...metadata,[key]:e.target.value===""?null:Number(e.target.value)}})}/></Field>)}</div><p className="text-xs text-slate-500">Source PDF: {object.source_file??"Unavailable"}</p></ReviewCard>; }

function WorkoutReview({disabled,object,onChange,onRemove}) { const exercises=object.exercises??[]; const updateExercise=(index,next)=>onChange({exercises:exercises.map((item,itemIndex)=>itemIndex===index?{...item,...next}:item)}); return <ReviewCard icon={Dumbbell} title={object.metadata?.activity_type??"Workout"} onRemove={onRemove} disabled={disabled}><Field label="Workout date"><input disabled={disabled} type="date" value={String(object.observed_at??"").slice(0,10)} onChange={(e)=>onChange({observed_at:e.target.value})}/></Field><div className="space-y-3">{exercises.map((exercise,index)=>exercise.removed?null:<div className="rounded-xl bg-[var(--surface-muted)] p-3" key={exercise.id??index}><div className="flex gap-2"><input className="input-shell flex-1" disabled={disabled} value={exercise.name??""} onChange={(e)=>updateExercise(index,{name:e.target.value})}/><button disabled={disabled} type="button" onClick={()=>updateExercise(index,{removed:true})}><Trash2 size={18}/></button></div>{exercise.resolutionStatus==="unrecognized"&&<Warning>Unresolved exercise identity</Warning>}<div className="mt-2 space-y-2">{(exercise.sets??[]).map((set,setIndex)=><div className="grid grid-cols-3 gap-2" key={setIndex}><SmallNumber label="Reps" value={set.reps} disabled={disabled} onChange={(value)=>updateSet(updateExercise,index,exercise,setIndex,{reps:value})}/><SmallNumber label="Load" value={set.weight} disabled={disabled} onChange={(value)=>updateSet(updateExercise,index,exercise,setIndex,{weight:value})}/><SmallNumber label="Seconds" value={set.duration_seconds} disabled={disabled} onChange={(value)=>updateSet(updateExercise,index,exercise,setIndex,{duration_seconds:value})}/></div>)}</div></div>)}</div></ReviewCard>; }

function GenericReview({disabled,object,onChange,onRemove}) { return <ReviewCard title={String(object.evidence_type??"Evidence").replaceAll("_"," ")} onRemove={onRemove} disabled={disabled}><Field label="Date"><input disabled={disabled} type="date" value={String(object.observed_at??"").slice(0,10)} onChange={(e)=>onChange({observed_at:e.target.value})}/></Field><p className="text-sm text-slate-600">{object.title??object.name??"Review this evidence before confirming."}</p></ReviewCard>; }

function ReviewCard({children,disabled,icon:Icon,title,onRemove}) { return <Card className="space-y-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2">{Icon&&<Icon size={20} className="text-indigo-600"/>}<h2 className="text-lg font-extrabold capitalize">{title}</h2></div><button className="text-xs font-bold text-red-600" disabled={disabled} onClick={onRemove} type="button">Remove</button></div>{children}</Card>; }
function Field({children,label}) { return <label className="block space-y-1"><Label>{label}</Label>{children}</label>; }
function Label({children}) { return <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{children}</span>; }
function Select({disabled,label,onChange,options,value}) { return <label className="block space-y-1"><Label>{label}</Label><select className="input-shell w-full" disabled={disabled} value={value} onChange={(e)=>onChange(e.target.value)}>{options.map(([id,text])=><option key={id} value={id}>{text}</option>)}</select></label>; }
function Warning({children}) { return <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800"><AlertTriangle size={16}/><span>{children}</span></div>; }
function SmallNumber({disabled,label,onChange,value}) { return <Field label={label}><input className="input-shell w-full" disabled={disabled} type="number" value={value??""} onChange={(e)=>onChange(e.target.value===""?null:Number(e.target.value))}/></Field>; }
function updateSet(updateExercise,index,exercise,setIndex,next) { updateExercise(index,{sets:(exercise.sets??[]).map((set,i)=>i===setIndex?{...set,...next}:set)}); }
function photoPoseId(photo){if(photo.view==="back"&&["flexed","rear double biceps","double_biceps"].includes(String(photo.pose).toLowerCase()))return "back-flexed";return `${photo.view}-${photo.pose}`.replace("rear-","back-");}
function poseLabel(id){return POSES.find(([key])=>key===id)?.[1]??id;}
function conditionValue(value){if(value&&typeof value==="object")value=value.value;if(value===true)return "true";if(value===false)return "false";return value??"unknown";}
function triState(value){return value==="true"?true:value==="false"?false:"unknown";}
function privateEvidenceUrl(value){if(!value)return null;return `/api/private-evidence/${String(value).replace(/^private[\\/]founder[\\/]/,"").replaceAll("\\","/")}`;}
function failedStep(progress={}){return Object.entries(progress).find(([,value])=>value?.status==="failed")?.[0]?.replaceAll("_"," ");}
function resultIds(result={}){const values=[result.canonicalEvidenceIds,result.records,result.completionRecordIds,result.analysisIds,result.synthesisIds,result.evaluationVersionId,result.artifactIds,result.refreshKey].flat().filter(Boolean);return values.length?`IDs: ${values.join(", ")}`:"No result IDs";}
