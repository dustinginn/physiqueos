"use client";

import { useState } from "react";
import ProfileAvatar from "./ProfileAvatar";

export default function PageHeader({
  greeting = "Good morning,",
  name,
  subtitle,
  avatar,
  actions,
  className = "",
}) {
  const [resolvedGreeting] = useState(() => getTimeAwareGreeting(new Date()) || greeting);

  return (
    <header className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium leading-tight text-[#64748B]">
          {resolvedGreeting}
        </p>

        <h1 className="mt-0.5 truncate text-[34px] font-bold leading-none text-[#0B1020]">
          {name}
          <span className="text-[#4F46E5]">.</span>
        </h1>

        {subtitle && (
          <p className="mt-2 max-w-[260px] text-[13px] leading-6 text-[#64748B]">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}

        {avatar && (
          <ProfileAvatar
            alt={avatar.alt}
            initials={avatar.initials}
            size={avatar.size}
            src={avatar.src}
          />
        )}
      </div>
    </header>
  );
}

function getTimeAwareGreeting(now) {
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) return "Good morning,";
  if (hour >= 12 && hour < 17) return "Good afternoon,";
  return "Good evening,";
}
