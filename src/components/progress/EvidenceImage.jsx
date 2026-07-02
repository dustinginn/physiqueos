"use client";

import { useState } from "react";

export default function EvidenceImage({ alt, className = "", src }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`grid place-items-center bg-[var(--surface-soft)] text-center text-xs font-bold leading-5 text-[var(--text-muted)] ${className}`}
      >
        Original source stored.
        <br />
        Preview unavailable.
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      src={src}
    />
  );
}
