"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Camera, Eye, ImagePlus, Replace, Trash2 } from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import { createClientDraftId } from "../lib/clientDraftId";

const ORIENTATIONS = [["front","Front"],["rear","Rear"],["side_unspecified","Side"],["left_side","Left Side"],["right_side","Right Side"]];
const VARIANTS = [["standard","Standard"],["double_biceps","Double Biceps"],["lat_spread","Lat Spread"],["side_chest","Side Chest"],["other","Other"]];
const SUGGESTIONS = [
  ["front","relaxed","standard"], ["rear","relaxed","standard"], ["rear","flexed","double_biceps"],
  ["side_unspecified","relaxed","standard"], ["front","flexed","standard"],
];

export default function ProgressPhotoUploadScreen({ action, defaultDate = "", confirmationIntent = null, returnTo = null }) {
  const [items, setItems] = useState([]);
  const [preview, setPreview] = useState(null);
  const allConfirmed = items.length > 0 && items.every((item) => item.identityStatus === "confirmed" && (item.poseVariant !== "other" || item.customLabel.trim()));

  function addFiles(fileList) {
    const files = [...fileList];
    setItems((current) => [...current, ...files.map((file, offset) => {
      const suggested = SUGGESTIONS[current.length + offset] ?? ["front","relaxed","standard"];
      return { draftId: createClientDraftId("photo"), file, previewUrl: URL.createObjectURL(file),
        orientation:suggested[0], contractionState:suggested[1], poseVariant:suggested[2], customLabel:"", tags:"",
        goalValidationRole:suggested[0] === "front" && suggested[1] === "relaxed" ? "primary" : "supporting",
        identityStatus:"suggested" };
    })]);
  }
  function update(draftId, changes) { setItems((current) => current.map((item) => item.draftId === draftId ? { ...item, ...changes } : item)); }
  function remove(draftId) { setItems((current) => current.filter((item) => item.draftId !== draftId)); }
  function replace(draftId, file) {
    if (!file) return;
    setItems((current) => current.map((item) => {
      if (item.draftId !== draftId) return item;
      URL.revokeObjectURL(item.previewUrl);
      return { ...item, draftId:createClientDraftId("photo"), file, previewUrl:URL.createObjectURL(file), identityStatus:"edited" };
    }));
  }
  function move(index, delta) {
    setItems((current) => { const next=[...current]; const target=index+delta;if(target<0||target>=next.length)return current;[next[index],next[target]]=[next[target],next[index]];return next; });
  }
  async function submit(event) {
    event.preventDefault();
    if (!allConfirmed) return;
    const data = new FormData(event.currentTarget);
    items.forEach((item) => data.append("photos", item.file));
    data.set("photoIdentitiesJson", JSON.stringify(items.map((item, sourceOrder) => ({
      clientId:item.draftId, sourceOrder, orientation:item.orientation, contractionState:item.contractionState,
      poseVariant:item.poseVariant, customLabel:item.customLabel, tags:item.tags.split(",").map((tag)=>tag.trim()).filter(Boolean),
      goalValidationRole:item.goalValidationRole, identityStatus:item.identityStatus, userConfirmedIdentity:true,
    }))));
    await action(data);
  }

  const countLabel = `${items.length} Photo${items.length === 1 ? "" : "s"}`;

  return <main className="min-h-screen bg-[var(--background)]">
    <div className="mx-auto max-w-[393px] px-4 pt-10 pb-32">
      <Link className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]" href="/"><ArrowLeft size={18}/>Home</Link>
      <header className="mb-6 space-y-2"><IconBadge icon={Camera} color="evidence" size="md"/>
        <p className="text-sm font-semibold uppercase tracking-[.12em] text-[var(--primary)]">Progress Photos</p>
        <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">Build your photo session.</h1>
        <p className="text-base leading-7 text-[var(--text-secondary)]">Choose any useful views, identify each one, then confirm the set. File order never decides the pose.</p>
      </header>
      <form className="space-y-4" onSubmit={submit}>
        {returnTo&&<input name="returnTo" type="hidden" value={returnTo}/>}
        {confirmationIntent&&Object.entries(confirmationIntent).map(([name,value])=><input key={name} name={name} type="hidden" value={String(value)}/>)}
        {confirmationIntent&&<Card variant="success"><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--confidence)]">Visible Abs confirmation</p><p className="mt-1 text-sm font-bold leading-6 text-[var(--text-primary)]">Front relaxed is required for the completion decision. Every other confirmed view adds supporting context.</p></Card>}
        <Card className="space-y-3">
          <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 text-sm font-extrabold text-[var(--primary)]">
            <ImagePlus size={20}/>{items.length ? "Add more photos" : "Select photos"}
            <input accept="image/*" className="sr-only" multiple onChange={(event)=>{addFiles(event.target.files);event.target.value="";}} type="file"/>
          </label>
          <p className="text-xs font-medium leading-5 text-[var(--text-muted)]">One photo, five photos, or a future pose set all work. You’ll review every identity before anything is submitted.</p>
        </Card>
        <div className="space-y-3" data-testid="photo-identity-review">
          {items.map((item,index)=><PhotoIdentityCard item={item} index={index} key={item.draftId} total={items.length}
            onMove={(delta)=>move(index,delta)} onPreview={()=>setPreview(item)} onRemove={()=>remove(item.draftId)}
            onReplace={(file)=>replace(item.draftId,file)}
            onUpdate={(changes)=>update(item.draftId,{...changes,identityStatus:item.identityStatus==="confirmed"?"edited":changes.identityStatus??"edited"})}/>)}
        </div>
        <Card className="space-y-3"><h2 className="text-base font-extrabold text-[var(--text-primary)]">Session conditions</h2>
          <input className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--input-bg)] px-3 text-base font-semibold" defaultValue={defaultDate} name="capturedAt" required type="date"/>
          <div className="grid grid-cols-2 gap-2">{["morning","fasted","postWorkout"].map((name)=><Select key={name} label={name==="postWorkout"?"Post-workout":name} name={name}><option value="unknown">Unknown</option><option value="true">Yes</option><option value="false">No</option></Select>)}
            <Select label="Pump" name="pump"><option value="unknown">Unknown</option><option value="true">Present</option><option value="false">None</option></Select></div>
          <input className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--input-bg)] px-3" name="lighting" placeholder="Lighting consistency"/>
          <input className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--input-bg)] px-3" name="location" placeholder="Location"/>
          <textarea className="min-h-20 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--input-bg)] p-3" name="notes" placeholder="Session notes"/>
          <label className="flex gap-3 text-sm font-semibold text-[var(--text-primary)]"><input name="originalUnedited" required type="checkbox" value="true"/>These are original, unedited photos.</label>
        </Card>
        <div className="sticky bottom-24 z-20 rounded-[20px] bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow-card)]">
          <ActionButton disabled={!allConfirmed} type="submit">{allConfirmed?`Continue with ${countLabel}`:"Confirm every photo identity"}</ActionButton>
        </div>
      </form>
    </div>
    {preview&&<Preview item={preview} onClose={()=>setPreview(null)}/>}
  </main>;
}

function PhotoIdentityCard({item,index,total,onMove,onPreview,onRemove,onReplace,onUpdate}) {
  const label=useMemo(()=>poseLabel(item),[item]);
  return <Card className="space-y-3" data-draft-id={item.draftId} data-testid="photo-identity-card">
    <div className="flex gap-3"><button aria-label={`Preview ${label}`} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl" onClick={onPreview} type="button"><Image alt={label} className="h-full w-full object-cover" height={96} src={item.previewUrl} unoptimized width={80}/><Eye className="absolute bottom-1 right-1 rounded-full bg-black/60 p-1 text-white" size={22}/></button>
      <div className="min-w-0 flex-1"><p className="text-xs font-bold text-[var(--text-muted)]">Photo {index+1}</p><p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{label}</p>
        <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${item.identityStatus==="confirmed"?"bg-[var(--surface-success)] text-[var(--confidence)]":"bg-[var(--surface-warning)] text-amber-700"}`}>{item.identityStatus.replace("_"," ")}</span></div>
      <div className="flex flex-col"><button aria-label="Move photo up" className="min-h-11 min-w-11" disabled={index===0} onClick={()=>onMove(-1)} type="button"><ArrowUp size={18}/></button><button aria-label="Move photo down" className="min-h-11 min-w-11" disabled={index===total-1} onClick={()=>onMove(1)} type="button"><ArrowDown size={18}/></button></div>
    </div>
    <div className="grid grid-cols-2 gap-2"><Select label="Orientation" value={item.orientation} onChange={(e)=>onUpdate({orientation:e.target.value})}>{ORIENTATIONS.map(([value,text])=><option key={value} value={value}>{text}</option>)}</Select>
      <Select label="Contraction" value={item.contractionState} onChange={(e)=>onUpdate({contractionState:e.target.value})}><option value="relaxed">Relaxed</option><option value="flexed">Flexed</option></Select>
      <Select label="Pose variant" value={item.poseVariant} onChange={(e)=>onUpdate({poseVariant:e.target.value})}>{VARIANTS.map(([value,text])=><option key={value} value={value}>{text}</option>)}</Select>
      <Select label="Goal role" value={item.goalValidationRole} onChange={(e)=>onUpdate({goalValidationRole:e.target.value})}><option value="supporting">Supporting</option><option value="primary">Primary</option><option value="context_only">Context only</option></Select></div>
    {item.poseVariant==="other"&&<input className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--input-bg)] px-3" onChange={(e)=>onUpdate({customLabel:e.target.value})} placeholder="Custom pose label" value={item.customLabel}/>}
    <input className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--input-bg)] px-3" onChange={(e)=>onUpdate({tags:e.target.value})} placeholder="Optional tags, separated by commas" value={item.tags}/>
    <div className="grid grid-cols-3 gap-2"><label className="flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-xl bg-[var(--surface-muted)] text-xs font-bold"><Replace size={15}/>Replace<input accept="image/*" className="sr-only" onChange={(e)=>onReplace(e.target.files?.[0])} type="file"/></label>
      <button className="min-h-11 rounded-xl bg-[var(--surface-muted)] text-xs font-bold text-red-600" onClick={onRemove} type="button"><Trash2 className="mr-1 inline" size={15}/>Remove</button>
      <button className="min-h-11 rounded-xl bg-[var(--primary)] text-xs font-extrabold text-white" onClick={()=>onUpdate({identityStatus:"confirmed"})} type="button">Confirm</button></div>
  </Card>;
}
function Select({label,children,...props}) { return <label className="space-y-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]"><span>{label}</span><select className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--input-bg)] px-2 text-sm font-semibold normal-case tracking-normal text-[var(--text-primary)]" {...props}>{children}</select></label>; }
function Preview({item,onClose}) { return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--modal-backdrop)] p-4" role="dialog"><button aria-label="Close preview" className="absolute right-4 top-4 min-h-11 rounded-full bg-white px-4 font-bold" onClick={onClose}>Close</button><Image alt={`Preview ${poseLabel(item)}`} className="max-h-[85vh] max-w-full rounded-2xl object-contain" height={1200} src={item.previewUrl} unoptimized width={900}/></div>; }
function poseLabel(item) { const side={front:"Front",rear:"Rear",left_side:"Left Side",right_side:"Right Side",side_unspecified:"Side"}[item.orientation]??"Photo"; if(item.poseVariant==="other"&&item.customLabel)return item.customLabel;const variant=!["standard","unspecified"].includes(item.poseVariant)?` — ${item.poseVariant.replaceAll("_"," ").replace(/\b\w/g,(c)=>c.toUpperCase())}`:"";return `${side} ${item.contractionState[0].toUpperCase()+item.contractionState.slice(1)}${variant}`; }
