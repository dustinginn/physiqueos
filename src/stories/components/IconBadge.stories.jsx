import { Activity, Calendar, Scale, Target } from "lucide-react";
import IconBadge from "../../components/ui/IconBadge";

const meta = {
  title: "Components/IconBadge",
  component: IconBadge,
};

export default meta;

export const Colors = {
  render: () => (
    <div className="flex gap-3 bg-[#F7F8FA] p-6">
      <IconBadge icon={Target} color="primary" />
      <IconBadge icon={Activity} color="success" />
      <IconBadge icon={Calendar} color="warning" />
      <IconBadge icon={Scale} color="muted" />
      <IconBadge icon={Activity} color="plain" />
    </div>
  ),
};
