import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const linkCapture = vi.hoisted(() => ({ links: [] }));

vi.mock("next/link", () => ({
  default: ({ children, href, prefetch }) => {
    linkCapture.links.push({ href, prefetch });
    return <a href={href}>{children}</a>;
  },
}));

import EvidenceHubIndex from "../components/progress/EvidenceHubIndex";
import ProgressHubScreen from "./ProgressHubScreen";

const streams = [
  ["training", "/progress/training"],
  ["nutrition", "/progress/nutrition"],
  ["weight", "/progress/weight"],
  ["photos", "/progress/photos"],
  ["dexa", "/progress/dexa"],
  ["activity", "/progress/activity"],
  ["energy", "/progress/energy"],
  ["recovery", "/progress/recovery"],
  ["health-metrics", "/progress/health-metrics"],
].map(([id, href]) => ({ id, href, title: id, metric: "Available" }));

describe("Progress evidence prefetch policy", () => {
  beforeEach(() => {
    linkCapture.links.length = 0;
  });

  it("renders every heavy evidence destination without scheduling automatic prefetch", () => {
    renderToStaticMarkup(<EvidenceHubIndex streams={streams} />);

    expect(linkCapture.links.map(({ href }) => href)).toEqual(streams.map(({ href }) => href));
    expect(linkCapture.links.filter(({ prefetch }) => prefetch !== false)).toEqual([]);
  });

  it("keeps duplicate heavy destinations non-prefetching while preserving their click target", () => {
    const duplicateDestinationStreams = [
      { ...streams[0] },
      { ...streams[0] },
    ];

    renderToStaticMarkup(<EvidenceHubIndex streams={duplicateDestinationStreams} />);

    expect(linkCapture.links).toEqual([
      { href: "/progress/training", prefetch: false },
      { href: "/progress/training", prefetch: false },
    ]);
  });

  it("does not prefetch the adjacent heavy Home or Profile destination", () => {
    renderToStaticMarkup(<ProgressHubScreen report={{ title: "Evidence Hub", streams: [] }} />);
    expect(linkCapture.links).toEqual([{ href: "/", prefetch: false }]);

    linkCapture.links.length = 0;
    renderToStaticMarkup(<ProgressHubScreen from="you" report={{ title: "Evidence Hub", streams: [] }} />);
    expect(linkCapture.links).toEqual([{ href: "/profile", prefetch: false }]);
  });
});
