"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MobileLabDiagnostics from "../components/dev/MobileLabDiagnostics";

export default function MobileDiagnosticsScreen() {
  const [tapCount, setTapCount] = useState(0);
  const [capabilities, setCapabilities] = useState(createCapabilitySnapshot());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCapabilities(createCapabilitySnapshot());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="app-surface min-h-screen px-4 pt-52 pb-40">
      <MobileLabDiagnostics
        labPanelSelector="main.app-surface"
        primaryButtonSelector="[data-testid='mobile-diagnostics-tap-test']"
        title="Mobile route diag"
      />
      <div className="mx-auto max-w-[430px] space-y-4">
        <div className="rounded-[22px] bg-[var(--surface-elevated)] p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">
            Lab Diagnostics
          </p>
          <h1 className="mt-2 text-2xl font-black text-[var(--text-primary)]">
            Mobile tap and mic check
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            This page avoids the narrative lab UI so remote mobile issues can be isolated.
          </p>
        </div>

        <button
          className="min-h-14 w-full rounded-[18px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white"
          data-testid="mobile-diagnostics-tap-test"
          onClick={() => setTapCount((count) => count + 1)}
          type="button"
        >
          Tap test: {tapCount}
        </button>

        <div className="rounded-[18px] bg-[var(--surface-muted)] p-4">
          <h2 className="text-base font-black text-[var(--text-primary)]">
            Mic support
          </h2>
          <dl className="mt-3 grid gap-2 text-xs font-bold text-[var(--text-secondary)]">
            {Object.entries(capabilities).map(([key, value]) => (
              <div className="flex justify-between gap-3" key={key}>
                <dt>{key}</dt>
                <dd className="text-right text-[var(--text-primary)]">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <Link
          className="block min-h-12 rounded-[16px] bg-[var(--surface-muted)] px-4 py-3 text-center text-sm font-extrabold text-[var(--text-primary)]"
          href="/lab/narrative-engine?safeLab=1"
        >
          Open narrative lab in safe mode
        </Link>
      </div>
    </main>
  );
}

function createCapabilitySnapshot() {
  if (typeof window === "undefined") {
    return {
      getUserMedia: false,
      host: "",
      isSecureContext: false,
      mediaDevices: false,
      mediaRecorder: false,
      origin: "",
      protocol: "",
      speechRecognition: false,
      webkitSpeechRecognition: false,
    };
  }

  return {
    getUserMedia: Boolean(window.navigator?.mediaDevices?.getUserMedia),
    host: window.location.host,
    isSecureContext: Boolean(window.isSecureContext),
    mediaDevices: Boolean(window.navigator?.mediaDevices),
    mediaRecorder: typeof window.MediaRecorder !== "undefined",
    origin: window.location.origin,
    protocol: window.location.protocol,
    speechRecognition: Boolean(window.SpeechRecognition),
    webkitSpeechRecognition: Boolean(window.webkitSpeechRecognition),
  };
}
