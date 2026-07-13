"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { useRef, useState } from "react";

export default function OperatingPlanDrawer({ children, description, preview, title }) {
  const [open, setOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);

  function startDrag(event) {
    dragStart.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event) {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, event.clientY - dragStart.current));
  }
  function endDrag() {
    if (dragY > 90) setOpen(false);
    dragStart.current = null;
    setDragging(false);
    setDragY(0);
  }

  return <DialogPrimitive.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setDragY(0); }}>
    <DialogPrimitive.Trigger asChild><button className="w-full rounded-[12px] bg-[var(--surface-muted)] p-3 text-left"><div className="flex items-center justify-between"><div><p className="text-sm font-extrabold text-[var(--text-primary)]">{title}</p><p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">{description}</p></div><span className="text-xs font-extrabold text-[var(--primary)]">View</span></div>{preview && <div className="mt-3 whitespace-pre-line text-xs font-semibold leading-5 text-[var(--text-muted)]">{preview}</div>}</button></DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-testid="operating-plan-drawer-overlay" className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content aria-describedby={`${title}-drawer-description`} data-testid="operating-plan-bottom-drawer" className="fixed left-1/2 top-1/2 z-50 mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-[calc(100%-1rem)] max-w-[393px] flex-col overflow-hidden rounded-[24px] bg-[var(--surface-elevated)] shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom duration-300" style={{ transform: `translate(-50%, calc(-50% + ${dragY}px))`, transition: dragging ? "none" : "transform 220ms ease-out" }}>
        <header data-testid="operating-plan-drawer-header" className="sticky top-0 z-10 shrink-0 border-b border-[var(--divider)] bg-[var(--surface-elevated)] px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button aria-label="Drag down to dismiss" className="mx-auto block h-7 w-20 touch-none" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} type="button"><span className="mx-auto block h-1.5 w-10 rounded-full bg-[var(--divider)]" /></button>
          <div className="flex items-start justify-between gap-4"><div><DialogPrimitive.Title className="text-lg font-extrabold text-[var(--text-primary)]">{title}</DialogPrimitive.Title><DialogPrimitive.Description id={`${title}-drawer-description`} className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">{description}</DialogPrimitive.Description></div><DialogPrimitive.Close aria-label={`Close ${title}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--surface-muted)]" type="button"><X size={18}/></DialogPrimitive.Close></div>
        </header>
        <div data-testid="operating-plan-drawer-body" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"><div className="space-y-2">{children}</div></div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
