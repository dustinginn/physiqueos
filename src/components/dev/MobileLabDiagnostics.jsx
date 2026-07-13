"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EMERGENCY_Z_INDEX = 2147483647;

export default function MobileLabDiagnostics({
  labPanelSelector = ".voice-lab-panel",
  primaryButtonSelector = "button",
  safeModeParam = "safeLab",
  title = "Mobile diag",
}) {
  const copyButtonRef = useRef(null);
  const safeModeButtonRef = useRef(null);
  const serializedDiagnosticsRef = useRef("");
  const tapTestButtonRef = useRef(null);
  const [diagnostics, setDiagnostics] = useState(() => createMobileLabDiagnostics());
  const [copyState, setCopyState] = useState("idle");
  const [mounted, setMounted] = useState(false);
  const [nativeTapCounts, setNativeTapCounts] = useState({
    click: 0,
    pointerdown: 0,
    total: 0,
    touchstart: 0,
  });
  const [showJsonFallback, setShowJsonFallback] = useState(false);
  const [safeMode, setSafeMode] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
      const params = new URLSearchParams(window.location.search);
      const shouldEnableSafeMode = params.get(safeModeParam) === "1";

      if (shouldEnableSafeMode) {
        setSafeMode(true);
        applySafeLabMode(true);
      }

      const nextDiagnostics = collectMobileLabDiagnostics({
        eventReached: "mounted",
        labPanelSelector,
        primaryButtonSelector,
      });

      setDiagnostics(nextDiagnostics);
      writeDiagnosticsHash(nextDiagnostics);
    }, 0);

    function updateFromEvent(event, eventReached) {
      const nextDiagnostics = collectMobileLabDiagnostics({
        event,
        eventReached,
        labPanelSelector,
        primaryButtonSelector,
      });

      setDiagnostics(nextDiagnostics);
      writeDiagnosticsHash(nextDiagnostics);
    }

    function handlePointerDown(event) {
      updateFromEvent(event, "document:pointerdown");
    }

    function handleTouchStart(event) {
      updateFromEvent(event, "document:touchstart");
    }

    function handleClick(event) {
      updateFromEvent(event, "document:click");
    }

    document.addEventListener("pointerdown", handlePointerDown, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("click", handleClick, {
      capture: true,
      passive: true,
    });

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("touchstart", handleTouchStart, true);
      document.removeEventListener("click", handleClick, true);
      applySafeLabMode(false);
    };
  }, [labPanelSelector, primaryButtonSelector, safeModeParam]);

  useEffect(() => {
    applySafeLabMode(safeMode);
  }, [safeMode]);

  const serializedDiagnostics = useMemo(
    () => JSON.stringify({ ...diagnostics, nativeTapCounts, safeMode }, null, 2),
    [diagnostics, nativeTapCounts, safeMode]
  );

  useEffect(() => {
    serializedDiagnosticsRef.current = serializedDiagnostics;
  }, [serializedDiagnostics]);

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(serializedDiagnosticsRef.current);
      setCopyState("copied");
      setShowJsonFallback(false);
    } catch {
      setCopyState("copy failed");
      setShowJsonFallback(true);
    }

    window.setTimeout(() => setCopyState("idle"), 1600);
  }

  function toggleSafeMode() {
    setSafeMode((current) => !current);
    window.setTimeout(() => {
      const nextDiagnostics = collectMobileLabDiagnostics({
        eventReached: "safe-mode-toggle",
        labPanelSelector,
        primaryButtonSelector,
      });

      setDiagnostics(nextDiagnostics);
      writeDiagnosticsHash(nextDiagnostics);
    }, 0);
  }

  useEffect(() => {
    const copyButton = copyButtonRef.current;
    const safeModeButton = safeModeButtonRef.current;
    const tapTestButton = tapTestButtonRef.current;
    const cleanups = [];

    function addNativeListener(element, eventName, handler) {
      if (!element) return;
      element.addEventListener(eventName, handler, { passive: true });
      cleanups.push(() => element.removeEventListener(eventName, handler));
    }

    function bumpNativeTapCount(event) {
      setNativeTapCounts((current) => ({
        ...current,
        [event.type]: (current[event.type] ?? 0) + 1,
        total: current.total + 1,
      }));
      const nextDiagnostics = collectMobileLabDiagnostics({
        event,
        eventReached: `emergency:${event.type}`,
        labPanelSelector,
        primaryButtonSelector,
      });

      setDiagnostics(nextDiagnostics);
      writeDiagnosticsHash(nextDiagnostics);
    }

    function handleCopyEvent() {
      copyDiagnostics();
    }

    function handleSafeModeEvent() {
      toggleSafeMode();
    }

    ["pointerdown", "touchstart", "click"].forEach((eventName) => {
      addNativeListener(tapTestButton, eventName, bumpNativeTapCount);
    });
    addNativeListener(copyButton, "click", handleCopyEvent);
    addNativeListener(copyButton, "pointerdown", handleCopyEvent);
    addNativeListener(copyButton, "touchstart", handleCopyEvent);
    addNativeListener(safeModeButton, "click", handleSafeModeEvent);
    addNativeListener(safeModeButton, "pointerdown", handleSafeModeEvent);
    addNativeListener(safeModeButton, "touchstart", handleSafeModeEvent);

    return () => cleanups.forEach((cleanup) => cleanup());
  // Native listeners intentionally bind to the mounted emergency DOM nodes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labPanelSelector, primaryButtonSelector, mounted]);

  const emergencyLayer = (
    <div
      data-testid="mobile-lab-diagnostics"
      style={{
        background: "rgba(2, 6, 23, 0.92)",
        border: "1px solid rgba(148, 163, 184, 0.55)",
        borderRadius: 12,
        contain: "none",
        display: "block",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
        color: "white",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 11,
        isolation: "isolate",
        left: 8,
        lineHeight: 1.35,
        maxWidth: "calc(100vw - 16px)",
        opacity: 1,
        padding: 8,
        pointerEvents: "auto",
        position: "fixed",
        right: 8,
        top: "calc(8px + env(safe-area-inset-top))",
        touchAction: "manipulation",
        transform: "none",
        userSelect: "text",
        visibility: "visible",
        zIndex: EMERGENCY_Z_INDEX,
      }}
    >
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <strong>{title}</strong>
        <span>{safeMode ? "safe mode on" : diagnostics.protocol ?? "pending"}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        {diagnostics.host ?? "unknown host"} · secure{" "}
        {String(diagnostics.isSecureContext)} · {diagnostics.viewport?.width ?? "?"}
        ×{diagnostics.viewport?.height ?? "?"} · {diagnostics.userAgentLabel}
      </div>
      <div style={{ marginTop: 3 }}>
        center: {diagnostics.topmostAtCenter?.description ?? "unknown"} · primary:{" "}
        {diagnostics.topmostAtPrimaryButton?.description ?? "unknown"}
      </div>
      <div style={{ marginTop: 3 }}>
        panel {diagnostics.mainPanelMounted ? "mounted" : "missing"} z{" "}
        {diagnostics.mainPanelZIndex ?? "?"} · overlay above{" "}
        {diagnostics.knownChromeAbovePanel ? "yes" : "no"} · panel PE{" "}
        {diagnostics.mainPanelPointerEvents ?? "?"} · button PE{" "}
        {diagnostics.primaryButtonPointerEvents ?? "?"}
      </div>
      <div style={{ marginTop: 3 }}>
        event: {diagnostics.lastEvent?.eventReached ?? "none"} · target{" "}
        {diagnostics.lastEvent?.target?.description ?? "none"}
      </div>
      <div style={{ marginTop: 3 }}>
        emergency:{" "}
        {diagnostics.emergencyButtonTopmostIsSelf
          ? "topmost"
          : `covered by ${diagnostics.emergencyButtonCoveredBy?.description ?? "unknown"}`}
      </div>
      {!diagnostics.emergencyButtonTopmostIsSelf &&
        diagnostics.emergencyButtonCoveredBy && (
          <div style={{ color: "#fca5a5", marginTop: 3 }}>
            Emergency button is covered by:{" "}
            {diagnostics.emergencyButtonCoveredBy.description}. Tap interception
            is outside React/app layer if this remains covered in safe mode.
          </div>
        )}
      {diagnostics.ngrokInterstitialDetected && (
        <div style={{ color: "#fbbf24", marginTop: 3 }}>
          ngrok interstitial/banner detected. If needed, use a tunnel/session that
          skips the browser warning.
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          data-testid="mobile-diag-tap-test"
          ref={tapTestButtonRef}
          style={emergencyButtonStyle}
          type="button"
        >
          TAP TEST {nativeTapCounts.total}
        </button>
        <button
          data-testid="mobile-diag-copy"
          ref={copyButtonRef}
          style={emergencyButtonStyle}
          type="button"
        >
          {copyState === "copied" ? "Copied" : "Copy mobile diag"}
        </button>
        <button
          data-testid="mobile-diag-safe-mode"
          ref={safeModeButtonRef}
          style={emergencyButtonStyle}
          type="button"
        >
          Toggle safe mode
        </button>
      </div>
      <div
        data-testid="mobile-diag-fallback-text"
        style={{
          background: "rgba(15, 23, 42, 0.86)",
          borderRadius: 8,
          marginTop: 6,
          padding: 5,
          wordBreak: "break-word",
        }}
      >
        diag: {createVisibleDiagnosticSummary(diagnostics, nativeTapCounts)}
      </div>
      {showJsonFallback && (
        <textarea
          aria-label="Mobile diagnostic JSON"
          readOnly
          style={{
            background: "rgba(15, 23, 42, 0.96)",
            border: "1px solid rgba(148, 163, 184, 0.6)",
            borderRadius: 8,
            color: "white",
            fontSize: 10,
            height: 96,
            marginTop: 6,
            padding: 6,
            userSelect: "text",
            width: "100%",
          }}
          value={serializedDiagnostics}
        />
      )}
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(emergencyLayer, document.body);
}

const emergencyButtonStyle = {
  appearance: "none",
  background: "#ffffff",
  border: "0",
  borderRadius: 8,
  color: "#020617",
  cursor: "pointer",
  flex: 1,
  fontSize: 11,
  fontWeight: 800,
  minHeight: 32,
  padding: "6px 8px",
  pointerEvents: "auto",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

export function createMobileLabDiagnostics(overrides = {}) {
  return {
    eventPath: [],
    host: null,
    isSecureContext: null,
    knownChromeAbovePanel: false,
    knownChromeDetails: [],
    lastEvent: null,
    emergencyButtonCoveredBy: null,
    emergencyButtonTopmostIsSelf: null,
    topmostAtEmergencyButton: null,
    mainPanelMounted: false,
    mainPanelPointerEvents: null,
    mainPanelZIndex: null,
    ngrokInterstitialDetected: false,
    origin: null,
    primaryButtonPointerEvents: null,
    protocol: null,
    topmostAtCenter: null,
    topmostAtPrimaryButton: null,
    userAgent: null,
    userAgentLabel: "unknown",
    viewport: null,
    ...overrides,
  };
}

function collectMobileLabDiagnostics({
  event = null,
  eventReached,
  labPanelSelector,
  primaryButtonSelector,
}) {
  const viewport = {
    height: window.innerHeight,
    width: window.innerWidth,
  };
  const centerPoint = {
    x: Math.round(viewport.width / 2),
    y: Math.round(viewport.height / 2),
  };
  const mainPanel = document.querySelector(labPanelSelector);
  const primaryButton = document.querySelector(primaryButtonSelector);
  const emergencyButton = document.querySelector("[data-testid='mobile-diag-copy']");
  const primaryRect = primaryButton?.getBoundingClientRect?.();
  const emergencyRect = emergencyButton?.getBoundingClientRect?.();
  const primaryPoint = primaryRect
    ? {
        x: Math.round(primaryRect.left + primaryRect.width / 2),
        y: Math.round(primaryRect.top + primaryRect.height / 2),
      }
    : null;
  const emergencyPoint = emergencyRect
    ? {
        x: Math.round(emergencyRect.left + emergencyRect.width / 2),
        y: Math.round(emergencyRect.top + emergencyRect.height / 2),
      }
    : null;
  const mainPanelStyle = mainPanel ? window.getComputedStyle(mainPanel) : null;
  const primaryButtonStyle = primaryButton
    ? window.getComputedStyle(primaryButton)
    : null;
  const knownChromeDetails = getKnownChromeDetails();
  const topmostAtEmergencyButton = emergencyPoint
    ? document.elementFromPoint(emergencyPoint.x, emergencyPoint.y)
    : null;
  const emergencyButtonTopmostIsSelf =
    Boolean(emergencyButton) &&
    (topmostAtEmergencyButton === emergencyButton ||
      Boolean(topmostAtEmergencyButton?.contains?.(emergencyButton)) ||
      Boolean(emergencyButton.contains?.(topmostAtEmergencyButton)));

  return createMobileLabDiagnostics({
    eventPath: event?.composedPath
      ? event.composedPath().slice(0, 8).map(describeElementForMobileDiag)
      : [],
    host: window.location.host,
    isSecureContext: Boolean(window.isSecureContext),
    knownChromeAbovePanel: knownChromeDetails.some(
      (item) => Number(item.zIndex) > Number(mainPanelStyle?.zIndex || 0)
    ),
    knownChromeDetails,
    lastEvent: event
      ? {
          eventReached,
          target: describeElementForMobileDiag(event.target),
          timestamp: new Date().toISOString(),
          type: event.type,
        }
      : { eventReached, target: null, timestamp: new Date().toISOString() },
    emergencyButtonCoveredBy:
      emergencyButtonTopmostIsSelf || !topmostAtEmergencyButton
        ? null
        : describeElementForMobileDiag(topmostAtEmergencyButton),
    emergencyButtonTopmostIsSelf,
    mainPanelMounted: Boolean(mainPanel),
    mainPanelPointerEvents: mainPanelStyle?.pointerEvents ?? null,
    mainPanelZIndex: mainPanelStyle?.zIndex ?? null,
    ngrokInterstitialDetected: detectNgrokInterstitial(),
    origin: window.location.origin,
    primaryButtonPointerEvents: primaryButtonStyle?.pointerEvents ?? null,
    protocol: window.location.protocol,
    topmostAtCenter: describeElementForMobileDiag(
      document.elementFromPoint(centerPoint.x, centerPoint.y)
    ),
    topmostAtEmergencyButton: describeElementForMobileDiag(topmostAtEmergencyButton),
    topmostAtPrimaryButton: primaryPoint
      ? describeElementForMobileDiag(
          document.elementFromPoint(primaryPoint.x, primaryPoint.y)
        )
      : null,
    userAgent: window.navigator.userAgent,
    userAgentLabel: getUserAgentShortLabel(window.navigator.userAgent),
    viewport,
  });
}

function getKnownChromeDetails() {
  return [".theme-switch", ".floating-bottom-navigation", "[data-nextjs-dialog-overlay]"]
    .flatMap((selector) =>
      [...document.querySelectorAll(selector)].map((element) => {
        const style = window.getComputedStyle(element);

        return {
          description: describeElementForMobileDiag(element)?.description,
          display: style.display,
          pointerEvents: style.pointerEvents,
          position: style.position,
          selector,
          zIndex: style.zIndex === "auto" ? "0" : style.zIndex,
        };
      })
    );
}

function detectNgrokInterstitial() {
  const bodyText = String(document.body?.innerText ?? "");

  return /ngrok/i.test(bodyText) && /browser warning|visit site|skip-browser-warning|interstitial/i.test(bodyText);
}

function describeElementForMobileDiag(element) {
  if (!element) return null;

  const tag = element.tagName?.toLowerCase?.() ?? "unknown";
  const id = element.id ? `#${element.id}` : "";
  const testId = element.getAttribute?.("data-testid");
  const className = String(element.className ?? "").slice(0, 120);
  const text = String(element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);

  return {
    className,
    description: `${tag}${id}${testId ? `[data-testid="${testId}"]` : ""}`,
    text,
  };
}

function getUserAgentShortLabel(userAgent = "") {
  if (/CriOS|Chrome/i.test(userAgent)) return "Chrome";
  if (/Safari/i.test(userAgent)) return "Safari";
  if (/Firefox/i.test(userAgent)) return "Firefox";

  return "browser";
}

function applySafeLabMode(enabled) {
  document.documentElement.classList.toggle("safe-lab-mode", enabled);
}

function createVisibleDiagnosticSummary(diagnostics, nativeTapCounts) {
  return [
    diagnostics.host ?? "host?",
    `secure=${String(diagnostics.isSecureContext)}`,
    `tap=${nativeTapCounts.total}`,
    `emergency=${diagnostics.emergencyButtonTopmostIsSelf ? "top" : "covered"}`,
    `event=${diagnostics.lastEvent?.eventReached ?? "none"}`,
  ].join(" | ");
}

function writeDiagnosticsHash(diagnostics) {
  try {
    const summary = {
      coveredBy: diagnostics.emergencyButtonCoveredBy?.description ?? null,
      emergencyTop: diagnostics.emergencyButtonTopmostIsSelf,
      host: diagnostics.host,
      secure: diagnostics.isSecureContext,
      topCenter: diagnostics.topmostAtCenter?.description ?? null,
    };
    const encoded = encodeURIComponent(JSON.stringify(summary));

    window.history.replaceState(null, "", `#diag=${encoded.slice(0, 1200)}`);
  } catch {
    // Hash diagnostics are best-effort only.
  }
}
