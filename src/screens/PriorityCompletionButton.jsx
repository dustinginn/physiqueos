"use client";

import { useFormStatus } from "react-dom";
import ActionButton from "../components/ui/ActionButton";

export default function PriorityCompletionButton() {
  const { pending } = useFormStatus();
  return (
    <ActionButton disabled={pending} type="submit">
      {pending ? "Completing…" : "Mark Complete"}
    </ActionButton>
  );
}
