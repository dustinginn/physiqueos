import { useState } from "react";
import FloatingSheet from "./FloatingSheet";

const meta = {
  component: FloatingSheet,
  title: "UI/FloatingSheet",
};

export default meta;

export function Default() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">Open sheet</button>
      <FloatingSheet
        description="A centered, accessible detail surface."
        onOpenChange={setOpen}
        open={open}
        title="Training details"
      >
        <p className="p-2">Sheet content</p>
      </FloatingSheet>
    </>
  );
}
