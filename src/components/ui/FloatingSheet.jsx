"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

export default function FloatingSheet({ children, description, onOpenChange, open, title }) {
  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby="floating-sheet-description"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(78dvh,42rem)] w-[calc(100%-2rem)] max-w-[393px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[24px] border border-[var(--divider)] bg-[var(--surface-elevated)] shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="training-analysis-floating-sheet"
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--border-strong)]" />
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--divider)] px-4 pb-4 pt-2">
            <div>
              <DialogPrimitive.Title className="text-lg font-extrabold text-[var(--text-primary)]">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-xs font-semibold text-[var(--text-muted)]" id="floating-sheet-description">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label={`Close ${title}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)]" type="button">
              <X aria-hidden size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-3 py-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
