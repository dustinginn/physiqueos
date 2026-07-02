export default function ProfileAvatar({
  src,
  alt = "",
  initials,
  size = "md",
  className = "",
}) {
  const sizes = {
    sm: "h-12 w-12 text-[14px]",
    md: "h-16 w-16 text-[18px]",
    lg: "h-20 w-20 text-[22px]",
  };

  return (
    <div
      className={`
        flex
        shrink-0
        items-center
        justify-center
        overflow-hidden
        rounded-full
        bg-[#E5E7EB]
        font-semibold
        text-[#64748B]
        shadow-[0_8px_20px_rgba(15,23,42,0.08)]
        ${sizes[size] ?? sizes.md}
        ${className}
      `}
    >
      {src ? (
        <span
          aria-label={alt}
          className="h-full w-full bg-cover bg-center"
          role={alt ? "img" : "presentation"}
          style={{ backgroundImage: `url(${src})` }}
        />
      ) : (
        initials
      )}
    </div>
  );
}
