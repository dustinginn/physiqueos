"use client";

import { useState } from "react";

export default function EvidenceImage({ alt, className = "", diagnostic = null, src }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`grid place-items-center bg-[var(--surface-soft)] text-center text-xs font-bold leading-5 text-[var(--text-muted)] ${className}`}
      >
        <span>Photo preview unavailable.{diagnostic && <span className="mt-1 block max-w-full break-words font-medium">{diagnostic.stage}: {diagnostic.unresolvedSourceIds?.join(", ") || diagnostic.canonicalViewId} · {diagnostic.repository}</span>}</span>
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
