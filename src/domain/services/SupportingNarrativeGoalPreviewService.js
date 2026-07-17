const GOALS={
  maintenance:{id:"goal_maintain_8_9_body_fat",key:"maintenance",productionHref:"/goals/maintenance"},
  leanMass:{id:"goal_preserve_lean_mass",key:"leanMass",productionHref:"/goals/lean-mass"},
};

export function composeSupportingNarrativeGoalPreview({goalKey,dossier}={}){
  const definition=GOALS[goalKey];
  if(!definition) return null;
  return goalKey==="leanMass"?composeLeanMass(dossier,definition):composeMaintenance(dossier,definition);
}

function composeMaintenance({config={},data={}}={},goal){
  const scans=data.sourceFacts?.dexaScans??[];
  const weights=data.sourceFacts?.weights??[];
  const {baseline:firstScan,current:latestScan}=selectBodyFatComparisonWindow(scans,data.sourceFacts?.goalStartDate);
  const firstWeight=weights[0]??null,latestWeight=weights.at(-1)??null;
  const nearing=/entering|target range|on track/i.test(data.status??"");
  return base({goal,config,data,hero:{state:nearing?"Nearing Target Range":"Building Stability",conclusion:latestScan?`You are moving toward the maintenance range. The next job is to arrive without over-cutting, then prove the result can be held.`:"The maintenance path is taking shape. The next measurement will clarify how close the target range has become.",estimate:nearing?"Range approaching":null},map:{summary:"The cut established the route. Maintenance begins when the target range can be reached and held.",stops:[stop(firstScan?"complete":"next","Start",firstScan?`${formatDate(firstScan.date)} · ${formatPercent(firstScan.bodyFat)} Baseline`:"Body Fat Baseline Pending"),stop("complete","Ground Covered",latestScan?`${formatPercent(latestScan.bodyFat)} DEXA Confirmation`:"Downward Trend Established"),stop("current","Today",nearing?"Nearing Target Range":"Building Stability"),stop("next","Next Milestone","8–9% Body Fat Range"),stop("destination","Goal","Stable 8–9% Body Fat")]},ground:[firstWeight&&latestWeight?chapter("Durable Weight Trend",`Weight moved from ${firstWeight.value.toFixed(1)} to ${latestWeight.value.toFixed(1)} ${latestWeight.unit}, bringing the maintenance range closer.`):null,latestScan?chapter("Body Fat Direction Confirmed",`DEXA confirmed that the cut is moving toward the intended range.`):null,chapter("Transition Strategy Defined","The remaining objective is no longer simply to get lighter. It is to arrive lean enough, then establish stability.")],road:[road("outcome","8–9% Body Fat Range","Reach the objective range without pushing beyond it unnecessarily."),road("execution","Controlled Finish","Keep the current deficit measured while the range approaches."),road("confirmation","Stable Weight Window","Confirm that body weight and visual condition can hold after the cut ends.")],criteria:[criterion("8–9% Body Fat Range",nearing?"In Progress":"Remaining"),criterion("Stable Weight in Target Range","Remaining")],strategy:{conclusion:"Finish the cut without turning maintenance into a second aggressive phase. Nutrition, training, and recovery should make the landing controlled.",constraint:"Avoid over-cutting while the target range approaches."},turning:[firstScan&&turn(firstScan.date,"Body Fat Baseline",`${formatPercent(firstScan.bodyFat)} established the measured starting point.`),latestScan&&turn(latestScan.date,"DEXA Direction Confirmed",`The latest scan showed meaningful movement toward the objective range.`),latestWeight&&turn(latestWeight.date,"Maintenance Range Approaching",`The current weight trend brought the transition from fat loss to stability into view.`)],confidence:{summary:firstScan?"DEXA, weight, and visual definition agree that the maintenance range is approaching.":"A comparable body-fat baseline has not yet been established for this cut. The next goal-period DEXA can create one.",watching:"Stability after the deficit ends—not simply another lower weigh-in."},transition:nearing?{title:"What comes next",state:"Approaching Transition",body:"Once the target range is reached, the objective changes from losing more weight to holding the result. Calories and activity should move deliberately toward stability."}:null});
}

function composeLeanMass({config={},data={}}={},goal){
  const scans=data.sourceFacts?.dexaScans??[];
  const {baseline:firstScan,current:latestScan}=selectLeanMassComparisonWindow(scans,data.sourceFacts?.goalStartDate);
  const stable=/stable|on track|protected/i.test(data.status??"");
  return base({goal,config,data,hero:{state:stable?"Holding Steady":"Under Observation",conclusion:"The cut continues to test lean-mass retention. Training and visual muscularity remain supportive, while the next DEXA is the measurement that can confirm the outcome.",estimate:"Next DEXA decision point"},map:{summary:"Preservation is measured across the cut, not from a single training day or photo.",stops:[stop(firstScan?"complete":"next","Start",firstScan?`${formatDate(firstScan.date)} · ${firstScan.leanMass?.toFixed(1)} ${firstScan.unit} Baseline`:"Lean Mass Baseline Pending"),stop("complete","Ground Covered",latestScan?`${latestScan.leanMass?.toFixed(1)} ${latestScan.unit} DEXA Measurement`:"Training Quality Maintained"),stop("current","Today",stable?"Holding Steady":"Under Observation"),stop("next","Next Milestone","Comparable DEXA Confirmation"),stop("destination","Goal","Lean Mass Preserved Through Cut")]},ground:[firstScan&&chapter("Lean Mass Baseline Established",`${firstScan.leanMass?.toFixed(1)} ${firstScan.unit} created the preservation reference point.`),chapter("Resistance Training Maintained","Training quality continues to provide the stimulus needed to retain muscle during the cut."),chapter("Visual Muscularity Retained","Progress photos continue to show retained upper-body shape and muscularity as body weight declines.")],road:[road("outcome","Lean Mass Preservation","Hold the strongest available lean-mass markers through the remainder of the cut."),road("execution","High-Quality Resistance Output","Keep the training stimulus productive without exceeding recovery."),road("confirmation","Comparable DEXA Measurement","Use the next scan to confirm preservation under comparable conditions.")],criteria:[criterion("Lean Mass Preserved Through Cut",stable?"Ready to Confirm":"In Progress")],strategy:{conclusion:"Keep resistance training productive, protein support consistent, and recovery protected while the deficit remains active.",constraint:"Do not trade training quality for faster scale loss."},turning:[firstScan&&turn(firstScan.date,"Lean Mass Baseline",`${firstScan.leanMass?.toFixed(1)} ${firstScan.unit} established the measured reference point.`),latestScan&&turn(latestScan.date,"Latest Lean Mass Measurement",`DEXA updated the preservation picture and made the next comparable scan the key confirmation point.`),data.sourceFacts?.trainingGeneratedAt&&turn(String(data.sourceFacts.trainingGeneratedAt).slice(0,10),"Training Support Confirmed","Current resistance-training evidence continued to support the preservation strategy.")],confidence:{summary:firstScan?"DEXA provides the measured anchor, while training and photos support the view that muscularity is being retained.":"A comparable lean-mass baseline has not yet been established for this cut. The next goal-period DEXA can create one.",watching:"The next comparable DEXA measurement through the final stage of the cut."},transition:{title:"What comes next",state:"Next Chapter",body:"Once lean-mass preservation is confirmed through the remainder of the cut, maintenance becomes the bridge to the next objective: gradually building new lean mass while holding approximately 8–9% body fat. The focus will shift from protecting existing muscle to supporting sustainable growth without giving back body-fat progress."}});
}

export function selectLeanMassComparisonWindow(scans=[],goalStartDate=null){
  return selectComparisonWindow(scans,goalStartDate,"leanMass");
}

export function selectBodyFatComparisonWindow(scans=[],goalStartDate=null){
  return selectComparisonWindow(scans,goalStartDate,"bodyFat");
}

export function resolveLeanMassGoalStartDate(goals=[]){
  return resolveSupportingGoalStartDate(goals,"leanMass");
}

export function resolveSupportingGoalStartDate(goals=[],goalKey){
  const definition=GOALS[goalKey];
  const supportingGoal=goals.find((goal)=>goal.id===definition?.id||(goalKey==="leanMass"&&goal.metricKey==="leanMass")||(goalKey==="maintenance"&&goal.metricKey==="bodyFatPercentage"&&!goal.primary));
  const activePrimaryGoal=goals.find((goal)=>goal.primary&&goal.status==="active");
  return toDateKey(supportingGoal?.startDate)||toDateKey(activePrimaryGoal?.startDate)||null;
}

function selectComparisonWindow(scans,goalStartDate,metric){
  const start=toDateKey(goalStartDate);
  if(!start)return{baseline:null,current:null,scans:[]};
  const comparable=scans.filter((scan)=>toDateKey(scan?.date)>=start&&Number.isFinite(scan?.[metric])).slice().sort((left,right)=>toDateKey(left.date).localeCompare(toDateKey(right.date)));
  return{baseline:comparable[0]??null,current:comparable.at(-1)??null,scans:comparable};
}

function base({goal,config,data,hero,map,ground,road:roadItems,criteria,strategy,turning,confidence,transition}){const reasons=confidenceReasons(data);return{id:`narrative_goal_${goal.id}`,goalId:goal.id,productionHref:goal.productionHref,hero:{title:config.title,state:hero.state,conclusion:hero.conclusion,confidence:number(data.confidence),confidenceLabel:data.confidenceLabel??"Building",estimate:hero.estimate},journeyMap:{progress:null,summary:map.summary,stops:map.stops},groundCovered:ground.filter(Boolean),roadAhead:roadItems,completionCriteria:criteria,strategy:{conclusion:strategy.conclusion,pillars:(data.protocols??[]).slice(0,4).map((item)=>({label:item.title,detail:coach(item.detail)})),constraint:strategy.constraint},turningPoints:turning.filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date)),confidence:{value:number(data.confidence),label:stripConfidence(data.confidenceLabel),summary:reasons.length?confidence.summary:"The route is still taking shape. The next objective-specific measurement will make the current position clearer.",reasons,watching:confidence.watching},protocols:(data.protocols??[]).map((item)=>({name:item.title,purpose:coach(item.detail),href:"/profile/protocols"})),transition,provenance:{presentationOnly:true,persisted:false,source:"supporting_goal_dossier"}};}
function confidenceReasons(data){return(data.evidence??[]).slice(0,3).map((item)=>coach(item.detail));}
function coach(value){return String(value??"").replace(/\b(calibration|confidence-limited|evidence gap|unresolved|plausible range)\b/gi,"measurement");}
function stop(state,label,detail){return{state,label,detail};}function chapter(title,body){return{title,body};}function road(type,label,detail){return{type,label,detail};}function criterion(label,status){return{label,status};}function turn(date,label,body){return{date:String(date).slice(0,10),label,body};}
function number(value){const result=Number(value);return Number.isFinite(result)?result:0;}function stripConfidence(value){return String(value??"Building").replace(/\s+Confidence$/i,"");}function formatPercent(value){return Number.isFinite(value)?`${value.toFixed(1)}%`:"Body Fat";}function formatDate(value){const[y,m,d]=String(value).slice(0,10).split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function toDateKey(value){const match=String(value??"").match(/^\d{4}-\d{2}-\d{2}/);return match?.[0]??"";}
