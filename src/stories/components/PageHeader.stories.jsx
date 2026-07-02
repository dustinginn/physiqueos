import { Bell } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";

const meta = {
  title: "Components/PageHeader",
  component: PageHeader,
};

export default meta;

const avatar = {
  alt: "Dustin profile photo",
  initials: "D",
  size: "md",
  src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80",
};

export const HomeGreeting = {
  render: () => (
    <div className="w-[393px] bg-[#F7F8FA] p-4">
      <PageHeader avatar={avatar} greeting="Good morning," name="Dustin" />
    </div>
  ),
};

export const WithSubtitleAndAction = {
  render: () => (
    <div className="w-[393px] bg-[#F7F8FA] p-4">
      <PageHeader
        actions={
          <button
            aria-label="Notifications"
            className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#E5E7EB] bg-white text-[#0B1020]"
            type="button"
          >
            <Bell size={20} />
          </button>
        }
        avatar={avatar}
        greeting="Welcome back,"
        name="Dustin"
        subtitle="Your prediction improved after the latest weigh-in."
      />
    </div>
  ),
};
