module.exports=[571902,a=>{"use strict";let b=(0,a.i(421108).default)("x",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]);a.s(["X",0,b],571902)},873234,a=>{"use strict";var b=a.i(539790),c=a.i(707777);a.s(["default",0,function({alt:a,className:d="",diagnostic:e=null,src:f}){let[g,h]=(0,c.useState)(!1);return!f||g?(0,b.jsx)("div",{className:`grid place-items-center bg-[var(--surface-soft)] text-center text-xs font-bold leading-5 text-[var(--text-muted)] ${d}`,children:(0,b.jsxs)("span",{children:["Photo preview unavailable.",e&&(0,b.jsxs)("span",{className:"mt-1 block max-w-full break-words font-medium",children:[e.stage,": ",e.unresolvedSourceIds?.join(", ")||e.canonicalViewId," · ",e.repository]})]})}):(0,b.jsx)("img",{alt:a,className:d,onError:()=>h(!0),src:f})}])},541816,a=>{"use strict";let b=(0,a.i(421108).default)("chevron-right",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]]);a.s(["ChevronRight",0,b],541816)},297304,a=>{"use strict";let b=(0,a.i(421108).default)("sparkles",[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]]);a.s(["Sparkles",0,b],297304)},850972,a=>{"use strict";var b=a.i(539790);a.s(["default",0,function({children:a,className:c="",padding:d="md",as:e="div",variant:f="elevated",...g}){let h={none:"",sm:"p-3.5",md:"p-4",lg:"p-5"},i={accent:"bg-[var(--surface-accent)]",elevated:"bg-[var(--surface-elevated)]",inset:"bg-[var(--surface-inset)]",soft:"bg-[var(--surface-soft)]",success:"bg-[var(--surface-success)]",surface:"bg-[var(--surface)]",warning:"bg-[var(--surface-warning)]"};return(0,b.jsx)(e,{...g,className:`
        rounded-[14px]
        border
        border-[var(--divider)]
        text-[var(--text-primary)]
        shadow-[var(--shadow-card)]
        ${i[f]??i.elevated}
        ${h[d]??h.md}
        ${c}
      `,children:a})}])},487347,a=>{"use strict";let b=(0,a.i(421108).default)("arrow-left",[["path",{d:"m12 19-7-7 7-7",key:"1l729n"}],["path",{d:"M19 12H5",key:"x3x0zl"}]]);a.s(["ArrowLeft",0,b],487347)},434528,a=>{"use strict";var b=a.i(539790);a.s(["default",0,function({icon:a,color:c="primary",size:d="md",className:e="",appearanceClassName:f=""}){let g={primary:"bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]",success:"bg-[color-mix(in_srgb,var(--chart-1)_16%,transparent)] text-[var(--chart-1)]",evidence:"bg-[color-mix(in_srgb,var(--chart-2)_16%,transparent)] text-[var(--chart-2)]",effort:"bg-[color-mix(in_srgb,var(--chart-3)_16%,transparent)] text-[var(--chart-3)]",warning:"bg-[color-mix(in_srgb,var(--chart-3)_16%,transparent)] text-[var(--chart-3)]",danger:"bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[var(--destructive)]",muted:"bg-[var(--surface-muted)] text-[var(--text-primary)]",surface:"bg-[var(--surface)] text-[var(--primary)]",plain:"bg-transparent text-[var(--text-primary)]"},h={xs:"h-7 w-7",sm:"h-8 w-8",md:"h-10 w-10",lg:"h-12 w-12"},i={xs:14,sm:16,md:18,lg:22},j=f||g[c]||g.primary,k=h[d]??h.md,l=i[d]??i.md;return(0,b.jsx)("span",{className:`
        inline-flex
        shrink-0
        items-center
        justify-center
        rounded-[10px]
        ${j}
        ${k}
        ${e}
      `,children:(0,b.jsx)(a,{size:l,strokeWidth:2.3,"aria-hidden":"true"})})}])},514264,a=>{"use strict";var b=a.i(539790),c=a.i(541816),d=a.i(128097),e=a.i(434528);a.s(["default",0,function({children:a,icon:f,endIcon:g=c.ChevronRight,href:h,disabled:i=!1,onClick:j,type:k="button",className:l="","aria-label":m}){let n=(0,b.jsxs)(b.Fragment,{children:[(0,b.jsxs)("span",{className:"flex min-w-0 items-center gap-3",children:[f&&(0,b.jsx)(e.default,{icon:f,color:"surface",size:"sm"}),(0,b.jsx)("span",{className:"min-w-0 text-[17px] font-semibold leading-tight text-white",children:a})]}),g&&(0,b.jsx)(g,{"aria-hidden":"true",className:"shrink-0 text-white transition-transform duration-200 ease-out group-hover:translate-x-1",size:22,strokeWidth:2.4})]}),o=`
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
  `;return h?(0,b.jsx)(d.default,{"aria-label":m,className:o,href:h,children:n}):(0,b.jsx)("button",{"aria-label":m,className:o,disabled:i,onClick:j,type:k,children:n})}])}];

//# sourceMappingURL=_tmp_windows-deploy-4758bd37_01y82qc._.js.map