import ProfileAvatar from "./ProfileAvatar";

export default function PageHeader({
  greeting = "Good morning,",
  name,
  subtitle,
  avatar,
  actions,
  className = "",
}) {
  return (
    <header className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium leading-tight text-[#64748B]">
          {greeting}
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
