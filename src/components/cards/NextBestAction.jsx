import { BarChart3, Camera, CheckCircle2, ClipboardList, Dumbbell, Scale, Syringe } from "lucide-react";
import ActionButton from "../ui/ActionButton";

const iconMap = {
  activity: Dumbbell,
  analysis: BarChart3,
  camera: Camera,
  check: CheckCircle2,
  scale: Scale,
  syringe: Syringe,
  target: ClipboardList,
};

export default function NextBestAction({
  href,
  icon = "scale",
  title = "Log Morning Weight",
  onClick,
}) {
  const Icon = iconMap[icon] ?? Scale;

  return (
    <ActionButton
      aria-label={title}
      href={href}
      icon={Icon}
      onClick={onClick}
    >
      {title}
    </ActionButton>
  );
}
