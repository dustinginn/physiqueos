export default function DesignOverlay({
  opacity = 0.5,
}) {
  return (
    <img
      src="/mockup-home.png"
      alt="Home Screen Mockup"
      draggable={false}
      className="
        pointer-events-none
        absolute
        top-0
        left-1/2
        w-[393px]
        h-auto
        -translate-x-1/2
        select-none
      "
      style={{
        opacity,
      }}
    />
  );
}