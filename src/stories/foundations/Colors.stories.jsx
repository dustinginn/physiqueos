const meta = {
  title: "Foundations/Colors",
};

export default meta;

export const Palette = () => (
  <div className="space-y-6 bg-zinc-950 p-10 text-white">

    <div>
      <h2 className="mb-4 text-2xl font-bold">
        PhysiqueOS Color Palette
      </h2>
    </div>

    <div className="grid grid-cols-2 gap-6">

      <div className="rounded-3xl bg-zinc-950 p-8">
        Background
      </div>

      <div className="rounded-3xl bg-zinc-900 p-8">
        Card
      </div>

      <div className="rounded-3xl bg-emerald-500 p-8 text-black">
        Primary
      </div>

      <div className="rounded-3xl bg-amber-400 p-8 text-black">
        Warning
      </div>

      <div className="rounded-3xl bg-rose-500 p-8">
        Danger
      </div>

    </div>

  </div>
);
