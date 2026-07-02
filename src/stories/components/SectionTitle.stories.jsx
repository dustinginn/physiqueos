import { ChevronRight } from "lucide-react";
import SectionTitle from "../../components/ui/SectionTitle";

const meta = {
  title: "Components/SectionTitle",
  component: SectionTitle,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[320px] bg-white p-6">
      <SectionTitle title="Your Goals" />
    </div>
  ),
};

export const WithAction = {
  render: () => (
    <div className="w-[320px] bg-white p-6">
      <SectionTitle
        title="Your Goals"
        action={
          <button className="flex items-center gap-1 text-[16px] font-medium text-[#4F46E5]">
            View all
            <ChevronRight size={18} />
          </button>
        }
      />
    </div>
  ),
};
