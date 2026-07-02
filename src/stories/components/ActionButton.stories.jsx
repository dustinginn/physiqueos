import { Apple, Scale } from "lucide-react";
import ActionButton from "../../components/ui/ActionButton";

const meta = {
  title: "Components/ActionButton",
  component: ActionButton,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[361px] bg-[#F7F8FA] p-4">
      <ActionButton icon={Scale}>Log Morning Weight</ActionButton>
    </div>
  ),
};

export const AlternateAction = {
  render: () => (
    <div className="w-[361px] bg-[#F7F8FA] p-4">
      <ActionButton icon={Apple}>Hit Protein Target</ActionButton>
    </div>
  ),
};
