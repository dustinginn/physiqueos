const NUMBER_WORDS=Object.freeze({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12});

export function interpretGoalOutcome(value){
 const description=String(value??"").trim();
 if(!description)return unresolved("Tell me what you want to accomplish.",["description","metric","amount","unit"]);
 const normalized=description.toLowerCase().replaceAll("-"," ");
 const metric=/lean\s+mass/.test(normalized)?"lean_mass":null;
 const direction=/\b(build|gain|add|increase)\b/.test(normalized)?"increase":null;
 const numeric=normalized.match(/\b(\d+(?:\.\d+)?)\b/);const word=normalized.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
 const amount=numeric?Number(numeric[1]):word?NUMBER_WORDS[word[1]]:null;
 const unit=/\b(lb|lbs|pound|pounds)\b/.test(normalized)?"lb":null;
 const missing=[!metric&&"metric",!direction&&"direction",amount==null&&"amount",!unit&&"unit"].filter(Boolean);
 if(missing.length)return unresolved(guidance(missing),missing);
 return freeze({status:"interpreted",target:{type:"numeric_change",metric,direction,amount,unit,description},missingFields:[],clarification:null});
}

export function assessOverallGoalCompleteness(plan={}){
 const target=plan.target??{},timeline=plan.timeline??{};const missing=[];
 if(target.type!=="numeric_change")missing.push("target.type");
 for(const key of ["metric","direction","amount","unit","description"])if(target[key]==null||target[key]===""||target[key]==="unspecified")missing.push(`target.${key}`);
 if(!timeline.startDate)missing.push("timeline.startDate");
 if(!timeline.targetDate)missing.push("timeline.targetDate");
 if(target.targetDate!==timeline.targetDate)missing.push("target.targetDate");
 return freeze({complete:missing.length===0,missingFields:missing,message:completenessGuidance(missing)});
}

function unresolved(clarification,missingFields){return freeze({status:"clarification_required",target:null,missingFields,clarification})}
function guidance(missing){if(missing.includes("amount"))return "Add how much lean mass you want to build.";if(missing.includes("metric"))return "Tell me what you want to build or change.";if(missing.includes("unit"))return "Add the unit for your target amount.";return "Tell me whether you want to build, gain, reduce, or maintain it."}
function completenessGuidance(missing){if(!missing.length)return null;if(missing.some(x=>x.startsWith("target.")))return "Tell me what you want to accomplish, including how much and the unit.";if(missing.includes("timeline.startDate"))return "Choose when this journey begins.";return "Choose the date you want to work toward."}
function freeze(value){Object.values(value).forEach(item=>item&&typeof item==="object"&&Object.freeze(item));return Object.freeze(value)}
