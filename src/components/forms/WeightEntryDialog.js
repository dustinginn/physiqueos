"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

export default function WeightEntryDialog({
  open,
  onOpenChange,
  onSave,
}) {
  const [weight, setWeight] = useState("");

  function handleSave() {
    if (!weight) return;

    onSave(Number(weight));

    setWeight("");

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>

        <DialogHeader>
          <DialogTitle>
            Morning Weigh-In
          </DialogTitle>
        </DialogHeader>

        <input
          type="number"
          step="0.1"
          placeholder="171.4"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
        />

        <Button
          className="mt-6 w-full"
          onClick={handleSave}
        >
          Save Weight
        </Button>

      </DialogContent>
    </Dialog>
  );
}