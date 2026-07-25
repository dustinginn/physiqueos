export const PHASE_DATE_ARITHMETIC_CONVENTION="start_plus_duration_calendar_days";

export function phaseTimingSnapshot(phase={}){return deepFreeze({timingMode:phase.timingMode??null,startDate:phase.startDate??null,targetDate:phase.targetDate??null,duration:phase.duration?structuredClone(phase.duration):null})}

export function expectedPhaseReviewDate(phase={}){
 if(phase.timingMode==="target_date")return validDate(phase.targetDate)?phase.targetDate:null;
 if(phase.timingMode!=="fixed_duration"||!validDate(phase.startDate)||!validDuration(phase.duration))return null;
 const date=new Date(`${phase.startDate}T12:00:00Z`),{value,unit}=phase.duration;
 if(unit==="days")date.setUTCDate(date.getUTCDate()+value);
 if(unit==="weeks")date.setUTCDate(date.getUTCDate()+value*7);
 if(unit==="months")date.setUTCMonth(date.getUTCMonth()+value);
 return date.toISOString().slice(0,10);
}

export function assessPhaseTimelineIntegrity(draft){
 const phases=draft?.phaseEditing?.workingAuthoredPhases??[],provenance=draft?.phaseEditing?.timingProvenance??{};const errors=[],warnings=[];
 for(const phase of phases){const record=provenance[phase.id];
  if(phase.timingMode==="fixed_duration"){if(!validDuration(phase.duration))errors.push(issue("PHASE_DURATION_REQUIRED",phase,"Add a valid planned duration."));if(!validDate(phase.startDate))errors.push(issue("PHASE_START_DATE_REQUIRED",phase,`Choose when ${durationLabel(phase.duration)} should begin.`));}
  else if(phase.timingMode==="target_date"){if(!validDate(phase.targetDate))errors.push(issue("PHASE_TARGET_DATE_REQUIRED",phase,"Add the date you want this phase to reach."));}
  else if(phase.timingMode==="completion_criteria"&&record?.deliberateUntimed!==true&&record?.source!=="persisted")errors.push(issue("PHASE_UNTIMED_CONFIRMATION_REQUIRED",phase,"Confirm that this phase should remain open-ended and evidence-led."));
  if(record?.confirmedTiming&&!equal(record.confirmedTiming,phaseTimingSnapshot(phase)))errors.push(issue("PHASE_TIMING_FINGERPRINT_MISMATCH",phase,"Review the phase timing again before saving."));
  if(record?.suppliedTiming?.duration&&phase.timingMode!=="fixed_duration")errors.push(issue("PHASE_SUPPLIED_DURATION_LOST",phase,"Restore the duration supplied for this phase."));
  if(phase.timingMode==="fixed_duration"&&phase.startDate&&phase.duration&&!expectedPhaseReviewDate(phase))errors.push(issue("PHASE_EXPECTED_REVIEW_INVALID",phase,"Correct the phase timing so its review date can be calculated."));
 }
 for(let index=1;index<phases.length;index+=1){const previousEnd=expectedPhaseReviewDate(phases[index-1]);if(previousEnd&&phases[index].startDate&&phases[index].startDate<previousEnd)errors.push(issue("PHASE_DATE_SEQUENCE_INVALID",phases[index],"Choose a start date after the prior phase review."));}
 return deepFreeze({valid:errors.length===0,errors,warnings,convention:PHASE_DATE_ARITHMETIC_CONVENTION,phaseTimings:phases.map(phase=>({phaseId:phase.id,...phaseTimingSnapshot(phase),expectedReviewDate:expectedPhaseReviewDate(phase)}))});
}

function issue(code,phase,message){return {code,phaseId:phase.id,phaseName:phase.name,message}}
function durationLabel(duration){return validDuration(duration)?`${duration.value}-${duration.unit.replace(/s$/,"")}`:"this phase"}
function validDuration(value){return value&&Number.isFinite(value.value)&&value.value>0&&["days","weeks","months"].includes(value.unit)}
function validDate(value){if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function deepFreeze(value){if(!value||typeof value!=="object"||Object.isFrozen(value))return value;Object.values(value).forEach(deepFreeze);return Object.freeze(value)}
