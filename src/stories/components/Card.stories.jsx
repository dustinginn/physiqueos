import Card from "../../components/ui/Card";

const meta = {
  title: "Components/Card",
  component: Card,
};

export default meta;

export const Default = {
  render: () => (
    <div className="bg-[#F7F8FA] p-6">
      <Card>
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#4F46E5]">
          Trajectory
        </p>
        <p className="mt-3 text-[20px] font-semibold text-[#0B1020]">
          Ahead of schedule.
        </p>
        <p className="mt-2 text-[14px] text-[#64748B]">
          You are projected to reach your goal on track.
        </p>
      </Card>
    </div>
  ),
};
