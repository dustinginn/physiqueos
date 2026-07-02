import { Calendar, Clock3, TrendingUp } from "lucide-react";
import Card from "../ui/Card";
import ConfidenceRing from "../ui/ConfidenceRing";
import IconBadge from "../ui/IconBadge";
import SectionTitle from "../ui/SectionTitle";

export default function TrajectoryCard({
  label = "Trajectory",
  title = "Ahead of schedule.",
  description = "You're projected to reach your goal on track.",
  confidence = 94,
  confidenceLabel = "Confidence",
  projectedFinish = "July 18",
  daysRemaining = "18 days",
}) {
  return (
    <Card
      as="section"
      padding="sm"
      className="
        min-h-[154px]
      "
    >
      <SectionTitle title={label} />

      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_98px] items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <IconBadge
              icon={TrendingUp}
              color="plain"
              size="sm"
              className="-ml-2 -mt-1 h-6 w-6 text-[#3BC35B]"
            />

            <h2
              className="
                max-w-full
                text-[17px]
                font-semibold
                leading-[1.15]
                text-[#0B1020]
              "
            >
              {title}
            </h2>
          </div>

          <p
            className="
              mt-1.5
              max-w-[180px]
              text-[12px]
              leading-[1.28]
              text-[#64748B]
            "
          >
            {description}
          </p>
        </div>

        <ConfidenceRing
          label={confidenceLabel}
          value={confidence}
          size={98}
        />
      </div>

      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex min-w-0 items-center gap-2">
          <IconBadge icon={Calendar} color="evidence" size="sm" className="h-7 w-7" />
          <div>
            <p className="text-[11px] font-medium text-[#64748B]">
              Projected Finish
            </p>

            <p className="mt-0.5 text-[15px] font-bold leading-none text-[#0B1020]">
              {projectedFinish}
            </p>
          </div>
        </div>

        <div className="mx-2.5 h-8 w-px bg-[#E5E7EB]" />

        <div className="flex min-w-0 items-center gap-2">
          <IconBadge icon={Clock3} color="effort" size="sm" className="h-7 w-7" />
          <div>
            <p className="text-[11px] font-medium text-[#64748B]">
              Days Remaining
            </p>

            <p className="mt-0.5 text-[15px] font-bold leading-none text-[#0B1020]">
              {daysRemaining}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
