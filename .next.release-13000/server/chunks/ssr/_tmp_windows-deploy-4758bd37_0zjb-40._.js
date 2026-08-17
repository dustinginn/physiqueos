module.exports=[434528,a=>{"use strict";var b=a.i(539790);a.s(["default",0,function({icon:a,color:c="primary",size:d="md",className:e="",appearanceClassName:f=""}){let g={primary:"bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]",success:"bg-[color-mix(in_srgb,var(--chart-1)_16%,transparent)] text-[var(--chart-1)]",evidence:"bg-[color-mix(in_srgb,var(--chart-2)_16%,transparent)] text-[var(--chart-2)]",effort:"bg-[color-mix(in_srgb,var(--chart-3)_16%,transparent)] text-[var(--chart-3)]",warning:"bg-[color-mix(in_srgb,var(--chart-3)_16%,transparent)] text-[var(--chart-3)]",danger:"bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[var(--destructive)]",muted:"bg-[var(--surface-muted)] text-[var(--text-primary)]",surface:"bg-[var(--surface)] text-[var(--primary)]",plain:"bg-transparent text-[var(--text-primary)]"},h={xs:"h-7 w-7",sm:"h-8 w-8",md:"h-10 w-10",lg:"h-12 w-12"},i={xs:14,sm:16,md:18,lg:22},j=f||g[c]||g.primary,k=h[d]??h.md,l=i[d]??i.md;return(0,b.jsx)("span",{className:`
        inline-flex
        shrink-0
        items-center
        justify-center
        rounded-[10px]
        ${j}
        ${k}
        ${e}
      `,children:(0,b.jsx)(a,{size:l,strokeWidth:2.3,"aria-hidden":"true"})})}])},541816,a=>{"use strict";let b=(0,a.i(421108).default)("chevron-right",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]]);a.s(["ChevronRight",0,b],541816)},514264,a=>{"use strict";var b=a.i(539790),c=a.i(541816),d=a.i(128097),e=a.i(434528);a.s(["default",0,function({children:a,icon:f,endIcon:g=c.ChevronRight,href:h,disabled:i=!1,onClick:j,type:k="button",className:l="","aria-label":m}){let n=(0,b.jsxs)(b.Fragment,{children:[(0,b.jsxs)("span",{className:"flex min-w-0 items-center gap-3",children:[f&&(0,b.jsx)(e.default,{icon:f,color:"surface",size:"sm"}),(0,b.jsx)("span",{className:"min-w-0 text-[17px] font-semibold leading-tight text-white",children:a})]}),g&&(0,b.jsx)(g,{"aria-hidden":"true",className:"shrink-0 text-white transition-transform duration-200 ease-out group-hover:translate-x-1",size:22,strokeWidth:2.4})]}),o=`
    group
    flex
    min-h-12
    w-full
    items-center
    justify-between
    gap-4
    rounded-[14px]
    bg-[var(--primary)]
    bg-gradient-to-r
    from-[var(--primary)]
    to-[color-mix(in_srgb,var(--primary)_84%,#ffffff)]
    px-4
    py-3
    text-left
    shadow-[0_12px_28px_rgba(79,70,229,0.22)]
    transition
    duration-200
    ease-out
    hover:brightness-105
    focus-visible:outline
    focus-visible:outline-2
    focus-visible:outline-offset-2
    focus-visible:outline-[var(--primary)]
    active:scale-[0.99]
    disabled:cursor-not-allowed
    disabled:opacity-50
    ${l}
  `;return h?(0,b.jsx)(d.default,{"aria-label":m,className:o,href:h,children:n}):(0,b.jsx)("button",{"aria-label":m,className:o,disabled:i,onClick:j,type:k,children:n})}])},483121,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0});var d={callServer:function(){return f.callServer},createServerReference:function(){return h.createServerReference},findSourceMapURL:function(){return g.findSourceMapURL}};for(var e in d)Object.defineProperty(c,e,{enumerable:!0,get:d[e]});let f=a.r(683514),g=a.r(36760),h=a.r(851275)},529702,a=>{"use strict";var b=a.i(539790),c=a.i(707777),d=a.i(744533),e=a.i(514264),f=a.i(128097),g=a.i(483121);let h=(0,g.createServerReference)("40e8b2c584180852e04c73f6feb3a275c2b6229209",g.callServer,void 0,g.findSourceMapURL,"activateProductionGoalTransition");function i({label:a,value:c}){return(0,b.jsxs)("div",{children:[(0,b.jsx)("dt",{className:"text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]",children:a}),(0,b.jsx)("dd",{className:"mt-1 font-medium",children:c})]})}a.s(["default",0,function({review:a}){let g=(0,d.useRouter)(),[j,k]=(0,c.useTransition)(),[l,m]=(0,c.useState)(null);return(0,b.jsx)("main",{className:"min-h-screen bg-[var(--background)] px-5 py-8 text-[var(--foreground)]",children:(0,b.jsxs)("div",{className:"mx-auto max-w-2xl space-y-6",children:[(0,b.jsxs)("div",{children:[(0,b.jsx)("p",{className:"text-sm font-semibold text-[var(--primary)]",children:"Final review"}),(0,b.jsx)("h1",{className:"mt-2 text-3xl font-bold",children:"Activate Build Lean Mass"}),(0,b.jsx)("p",{className:"mt-3 text-[var(--muted-foreground)]",children:"This will complete Visible Abs and atomically activate the accepted goal, protocols, commitments, reminders, and coaching cadence."})]}),(0,b.jsx)("section",{className:"rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5",children:(0,b.jsxs)("dl",{className:"grid gap-4 sm:grid-cols-2",children:[(0,b.jsx)(i,{label:"Opening phase",value:a.summary.openingPhase}),(0,b.jsx)(i,{label:"Guardrail",value:a.summary.guardrail}),(0,b.jsx)(i,{label:"Coaching cadence",value:a.summary.coachingCadence}),(0,b.jsx)(i,{label:"Protocols prepared",value:a.summary.protocolsPrepared}),(0,b.jsx)(i,{label:"Commitments",value:a.summary.commitmentsToCreate}),(0,b.jsx)(i,{label:"Reminder intents",value:a.summary.reminderIntentsToCreate})]})}),l&&(0,b.jsx)("p",{role:"alert",className:"rounded-xl bg-red-50 p-4 text-sm text-red-800",children:l}),(0,b.jsx)(e.default,{disabled:j,endIcon:null,onClick:function(){m(null),k(async()=>{let b=await h({transitionId:a.token.transitionId,finalReviewToken:a.token.id,founderConfirmed:!0});if(!b.ok)return void m(b.error);let c=new URLSearchParams({status:b.status,pending:String(b.pendingExternalEffectCount)});g.replace(`/goals/transition/success?${c}`)})},children:j?"Activating…":"Confirm and activate"}),(0,b.jsx)(f.default,{className:"inline-flex min-h-11 items-center font-semibold text-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",href:"/goals/transition/protocols?section=review",children:"Back to protocol review"}),(0,b.jsx)("p",{className:"text-xs text-[var(--muted-foreground)]",children:"The review token expires shortly and can be used only once."})]})})}],529702)}];

//# sourceMappingURL=_tmp_windows-deploy-4758bd37_0zjb-40._.js.map