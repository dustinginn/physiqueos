"use client";

import {
  ArrowLeft,
  Brain,
  Camera,
  Keyboard,
  FlaskConical,
  Mic,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import MobileLabDiagnostics from "../components/dev/MobileLabDiagnostics";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import { getFounderStateSummary } from "../domain/lab/narrativeEngine";
import { voiceWorkoutContextFixtures } from "../domain/lab/voiceWorkoutContextFixtures";
import { isVoiceCompletionPhrase } from "../domain/services/VoiceClarificationService";

export default function NarrativeEngineLabScreen({ baseBriefing }) {
  const [run, setRun] = useState(null);
  const [activeInputMethod, setActiveInputMethod] = useState(null);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const founderState = useMemo(
    () => getFounderStateSummary(baseBriefing),
    [baseBriefing]
  );

  async function submitEvidence(formData) {
    setError("");
    setIsProcessing(true);

    try {
      const response = await fetch("/api/lab/narrative-engine", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error ?? "Evidence processing failed.");

      setRun(payload);
      return payload;
    } catch (submissionError) {
      setError(submissionError.message);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="app-surface min-h-screen">
      <MobileLabDiagnostics
        labPanelSelector="main.app-surface, .voice-lab-panel"
        primaryButtonSelector="button"
        title="Narrative lab mobile diag"
      />
      <div className="mx-auto w-full max-w-[430px] px-4 pt-5 pb-28">
        <Header />

        <div className="mt-4 space-y-4">
          <FounderStateCard state={founderState} />
          <EvidenceIntakeCard
            activeInputMethod={activeInputMethod}
            error={error}
            isProcessing={isProcessing}
            onInputMethodChange={setActiveInputMethod}
            onSubmit={submitEvidence}
            run={run}
          />

          {run ? (
            <PipelinePreview preview={run.pipelinePreview} />
          ) : (
            <Card className="border-dashed border-[var(--divider)] text-center">
              <p className="text-sm font-semibold leading-6 text-[var(--text-muted)]">
                Log one new piece of evidence to see what today&apos;s Daily Briefing would become.
              </p>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <Card className="space-y-3">
      <Link
        className="inline-flex items-center gap-2 text-xs font-extrabold text-[var(--text-muted)]"
        href="/lab"
      >
        <ArrowLeft size={14} />
        Founder Alpha Lab
      </Link>
      <div className="flex items-start gap-3">
        <IconBadge color="primary" icon={Brain} size="sm" />
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--primary)]">
            Narrative Engine Lab
          </p>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight text-[var(--text-primary)]">
            What would today&apos;s briefing become?
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            Start from the current Founder Alpha state, log one new evidence item, and let the engine choose the story.
          </p>
        </div>
      </div>
    </Card>
  );
}

function FounderStateCard({ state }) {
  return (
    <LabCard icon={FlaskConical} title="Current Founder Alpha">
      <div className="rounded-[18px] bg-[var(--surface-muted)] p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
          Loaded from production state
        </p>
        <h2 className="mt-1 text-lg font-extrabold text-[var(--text-primary)]">
          {state.goal}
        </h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
          {state.currentStory}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip>Confidence {state.confidence}%</Chip>
          {state.knownEvidence.map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
        </div>
      </div>
    </LabCard>
  );
}

function EvidenceIntakeCard({
  activeInputMethod,
  error,
  isProcessing,
  onInputMethodChange,
  onSubmit,
  run,
}) {
  return (
    <LabCard icon={Camera} title="Log Evidence">
      <div>
        <h2 className="text-xl font-black text-[var(--text-primary)]">
          Log Evidence
        </h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
          Choose how you&apos;d like to provide evidence.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {intakeMethods.map((method) => {
          const Icon = method.icon;
          const active = activeInputMethod === method.id;

          return (
            <button
              className={`min-h-24 rounded-[18px] border p-3 text-left transition ${
                active
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface-muted))]"
                  : "border-[var(--divider)] bg-[var(--surface-muted)] hover:border-[var(--primary)]"
              }`}
              key={method.id}
              onClick={() => onInputMethodChange(method.id)}
              type="button"
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-full ${
                  active
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--surface-elevated)] text-[var(--primary)]"
                }`}
              >
                <Icon size={18} />
              </span>
              <span className="mt-3 block text-sm font-extrabold text-[var(--text-primary)]">
                {method.label}
              </span>
            </button>
          );
        })}
      </div>

      {!activeInputMethod && (
        <div className="rounded-[16px] bg-[var(--surface-muted)] p-3">
          <p className="text-xs font-bold leading-5 text-[var(--text-secondary)]">
            Uploads, typed notes, and speech all enter one canonical intake pipeline.
          </p>
        </div>
      )}

      {activeInputMethod === "upload" && (
        <UploadAnythingSimulator
          error={error}
          isProcessing={isProcessing}
          onSubmit={onSubmit}
        />
      )}
      {activeInputMethod === "type" && (
        <TypedEvidenceSimulator
          error={error}
          isProcessing={isProcessing}
          onSubmit={onSubmit}
        />
      )}
      {activeInputMethod === "voice" && (
        <MicSimulatorCard
          error={error}
          isProcessing={isProcessing}
          onClose={() => onInputMethodChange(null)}
          onSubmit={onSubmit}
          run={run}
        />
      )}
    </LabCard>
  );
}

function UploadAnythingSimulator({ error, isProcessing, onSubmit }) {
  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("evidenceType", "auto");
    formData.set("inputMethod", "upload");
    onSubmit(formData);
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="rounded-[16px] bg-[var(--surface-muted)] p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Upload
        </p>
        <p className="mt-1 text-sm font-bold leading-5 text-[var(--text-secondary)]">
          Add screenshots, PDFs, photos, or mixed evidence. The interpreter determines what each artifact represents.
        </p>
      </div>
      <EvidenceFormFields evidenceType="auto" inputMethod="upload" />
      <SubmitEvidenceButton isProcessing={isProcessing} />
      <FormError error={error} />
    </form>
  );
}

function TypedEvidenceSimulator({ error, isProcessing, onSubmit }) {
  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("evidenceType", "auto");
    formData.set("inputMethod", "type");
    onSubmit(formData);
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="rounded-[16px] bg-[var(--surface-muted)] p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Type
        </p>
        <p className="mt-1 text-sm font-bold leading-5 text-[var(--text-secondary)]">
          Type what happened. The same intake pipeline creates canonical evidence.
        </p>
      </div>
      <TextAreaField
        helper="Add evidence exactly as it might be typed into PhysiqueOS."
        label="Typed evidence"
        name="evidenceNote"
        placeholder="Yesterday I did spider curls 4 sets of 13 at 30 lb, then EZ bar curls..."
      />
      <TextField label="Evidence date" name="measuredAt" type="date" />
      <SubmitEvidenceButton isProcessing={isProcessing} />
      <FormError error={error} />
    </form>
  );
}

function SubmitEvidenceButton({ isProcessing }) {
  return (
    <button
      className="min-h-12 w-full rounded-[16px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:opacity-60"
      disabled={isProcessing}
      type="submit"
    >
      {isProcessing ? "Processing evidence..." : "Run Intake Pipeline"}
    </button>
  );
}

function FormError({ error }) {
  if (!error) return null;

  return (
    <p className="rounded-[14px] bg-[color-mix(in_srgb,var(--chart-3)_12%,var(--surface-muted))] p-3 text-sm font-bold text-[var(--chart-3)]">
      {error}
    </p>
  );
}

/*
function LegacyLogEvidenceCard({
  activeEvidenceType,
  activeInputMethod,
  error,
  isProcessing,
  onInputMethodChange,
  onEvidenceTypeChange,
  onSubmit,
}) {
  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("evidenceType", activeEvidenceType);
    formData.set("inputMethod", activeInputMethod);
    onSubmit(formData);
  }

  function selectInput({ evidenceType, inputMethod }) {
    onEvidenceTypeChange(evidenceType);
    onInputMethodChange(inputMethod);
  }

  const activeEvidence =
    labEvidenceTypes.find((item) => item.id === activeEvidenceType) ??
    labEvidenceTypes[0];

  return (
    <LabCard icon={Camera} title="Log Evidence">
      <button
        className={`flex w-full items-center gap-3 rounded-[18px] border p-4 text-left transition ${
          activeEvidenceType === "auto"
            ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface-muted))]"
            : "border-[var(--divider)] bg-[var(--surface-muted)] hover:border-[var(--primary)]"
        }`}
        onClick={() => selectInput({ evidenceType: "auto", inputMethod: "upload" })}
        type="button"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] text-[var(--primary)]">
          <FileUp size={19} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold text-[var(--text-primary)]">
            Upload Anything
          </span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--text-secondary)]">
            Provide evidence first. The interpreter decides what it is.
          </span>
        </span>
      </button>

      <div className="grid gap-2">
        {labEvidenceTypes.map((item) => {
          const Icon = iconMap[item.icon] ?? Camera;

          return (
            <div
              className={`rounded-[16px] border p-3 transition ${
                activeEvidenceType === item.id
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface-muted))]"
                  : "border-[var(--divider)] bg-[var(--surface-muted)] hover:border-[var(--primary)]"
              }`}
              key={item.id}
            >
              <div className="flex items-center gap-2">
                <Icon size={18} className="text-[var(--primary)]" />
                <span className="text-sm font-extrabold text-[var(--text-primary)]">
                  {item.label}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {inputMethods.map((method) => {
                  const MethodIcon = method.icon;
                  const active =
                    activeEvidenceType === item.id &&
                    activeInputMethod === method.id;

                  return (
                    <button
                      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[12px] px-2 text-xs font-extrabold transition ${
                        active
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
                      }`}
                      key={`${item.id}-${method.id}`}
                      onClick={() =>
                        selectInput({
                          evidenceType: item.id,
                          inputMethod: method.id,
                        })
                      }
                      type="button"
                    >
                      <MethodIcon size={14} />
                      {method.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <div className="rounded-[16px] bg-[var(--surface-muted)] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Selected input
          </p>
          <p className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">
            {activeEvidenceType === "auto"
              ? "Upload Anything"
              : activeEvidence.label}{" "}
            · {inputMethods.find((item) => item.id === activeInputMethod)?.label}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
            Interpreter → Evidence Engine → Goal / Confidence Engine → Coaching Engine
          </p>
        </div>
        <EvidenceFormFields
          evidenceType={activeEvidenceType}
          inputMethod={activeInputMethod}
        />
        {error && (
          <p className="rounded-[14px] bg-[color-mix(in_srgb,var(--chart-3)_12%,var(--surface-muted))] p-3 text-sm font-bold text-[var(--chart-3)]">
            {error}
          </p>
        )}
        <button
          className="min-h-12 w-full rounded-[16px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:opacity-60"
          disabled={isProcessing}
          type="submit"
        >
          {isProcessing ? "Processing evidence..." : "Run Intelligence Pipeline"}
        </button>
      </form>
    </LabCard>
  );
}

*/

const voiceTranscriptFixtures = [
  {
    label: "Morning weigh-in",
    transcript: "I weighed 168.2 this morning.",
  },
  {
    label: "Nutrition note",
    transcript: "I had Greek yogurt, blueberries and two scoops of whey.",
  },
  {
    label: "Ambiguous workout",
    transcript: "I worked out.",
  },
  {
    label: "Strength workout",
    transcript:
      "I did spider curls, four sets of thirteen with thirty pound dumbbells, then EZ bar curls.",
  },
  {
    label: "Missed protocol",
    transcript: "I forgot to take Retatrutide yesterday.",
  },
  {
    label: "Symptom note",
    transcript: "My left shoulder has been bothering me all week.",
  },
  {
    label: "Goal update",
    transcript: "My goal is visible abs by September.",
  },
  {
    label: "Mixed morning evidence",
    transcript:
      "This morning I weighed 168.2, had Greek yogurt, then walked for thirty minutes.",
  },
];

const voiceFlowStates = [
  { id: "ready", label: "Ready" },
  { id: "starting", label: "Starting" },
  { id: "listening", label: "Listening" },
  { id: "transcribing", label: "Transcribing" },
  { id: "interpreting", label: "Interpreting" },
  { id: "clarifying", label: "Clarifying" },
  { id: "review", label: "Review" },
  { id: "editing", label: "Edit" },
  { id: "saved", label: "Saved" },
];

function MicSimulatorCard({ error, isProcessing, onClose, onSubmit, run }) {
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const liveRecognitionRef = useRef(null);
  const liveTranscriptRef = useRef("");
  const browserTranscriptSegmentsRef = useRef({ final: "", interim: "" });
  const shouldCaptureSpeechRef = useRef(false);
  const selectedTranscriptionProviderRef = useRef("not_started");
  const listeningAppendModeRef = useRef(false);
  const previousVoiceStateBeforeListeningRef = useRef("ready");
  const voiceEventTimelineRef = useRef([]);
  const recognitionStateRef = useRef("idle");
  const recordingStateRef = useRef("idle");
  const transcriptStateRef = useRef("");
  const latestTranscriptBeforeStopRef = useRef("");
  const transcriptReadByStopRef = useRef("");
  const transcriptPassedToInterpreterRef = useRef("");
  const recordingStartedAtRef = useRef(null);
  const durationTimerRef = useRef(null);
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [continuation, setContinuation] = useState("");
  const [voiceState, setVoiceState] = useState("ready");
  const [micStatus, setMicStatus] = useState("Tap the microphone to begin.");
  const [speechSupported, setSpeechSupported] = useState(true);
  const [micError, setMicError] = useState("");
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [transcriptionMetadata, setTranscriptionMetadata] = useState({
    audioProvider: null,
    recordingDurationMs: 0,
    transcriptionProvider: "Not started",
    status: "idle",
  });
  const [voiceDiagnostics, setVoiceDiagnostics] = useState(createVoiceProviderDiagnostics());
  const [voiceRuntimeDebug, setVoiceRuntimeDebug] = useState(
    createVoiceRuntimeDebugSnapshot()
  );
  const [mobileTapDiagnostics, setMobileTapDiagnostics] = useState(
    createMobileTapDiagnostics()
  );
  const [clarificationHistory, setClarificationHistory] = useState([]);
  const [expansionTurns, setExpansionTurns] = useState([]);
  const [resolvedClarificationIds, setResolvedClarificationIds] = useState([]);
  const [selectedExpansionTopic, setSelectedExpansionTopic] = useState(null);
  const [activeWorkoutContextId, setActiveWorkoutContextId] = useState("none");
  const activeWorkoutContext = voiceWorkoutContextFixtures.find(
    (fixture) => fixture.id === activeWorkoutContextId
  )?.workout ?? null;
  const voicePackage =
    run?.pipelinePreview?.interpreter?.structuredEvidenceJson?.source_modality ===
    "voice"
      ? run.pipelinePreview.interpreter.structuredEvidenceJson
      : null;
  const evidenceObjects = voicePackage?.evidence_objects ?? [];
  const clarificationPlan = voicePackage?.voice_conversation?.clarification_plan;
  const nextQuestion = clarificationPlan?.nextQuestion;
  const voiceDebugPayload = createVoiceDebugPayload({
    clarificationHistory,
    clarificationPlan,
    error,
    evidenceObjects,
    liveTranscript,
    micError,
    micStatus,
    recordingDurationMs,
    resolvedClarificationIds,
    selectedExpansionTopic,
    speechSupported,
    transcript,
    transcriptionMetadata,
    voiceDiagnostics,
    mobileTapDiagnostics,
    voiceRuntimeDebug,
    voicePackage,
    voiceState,
    expansionTurns,
  });

  useEffect(() => {
    transcriptStateRef.current = transcript;
    updateRuntimeDebugSnapshot();
  }, [transcript]);

  // The audio pipeline cleanup should run only when the voice card unmounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAudioPipeline(), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const snapshot = getBrowserProviderSnapshot();

      setVoiceDiagnostics((current) =>
        createVoiceProviderDiagnostics({
          ...current,
          ...snapshot,
          micSupportReason: getMicSupportReason(snapshot),
          micSupportStatus: getMicSupportStatus(snapshot),
        })
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handlePointerDown(event) {
      const x = Math.round(event.clientX ?? 0);
      const y = Math.round(event.clientY ?? 0);
      const topmostElement =
        typeof document !== "undefined"
          ? document.elementFromPoint(event.clientX, event.clientY)
          : null;
      const target = describeElementForTapDiagnostics(event.target);
      const topmost = describeElementForTapDiagnostics(topmostElement);
      const diagnostic = {
        coordinates: { x, y },
        pointerType: event.pointerType ?? "unknown",
        target,
        timestamp: new Date().toISOString(),
        topmost,
        topmostMatchesTarget:
          topmostElement === event.target ||
          Boolean(topmostElement?.contains?.(event.target)),
      };

      setMobileTapDiagnostics(diagnostic);
      setVoiceDiagnostics((current) => ({
        ...current,
        lastTapTarget: target,
        lastTapTopmostElement: topmost,
        lastTapTopmostMatchesTarget: diagnostic.topmostMatchesTarget,
      }));
    }

    document.addEventListener("pointerdown", handlePointerDown, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  function getSpeechRecognition() {
    if (typeof window === "undefined") return null;

    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }

  function getBrowserProviderSnapshot() {
    if (typeof window === "undefined") return {};

    return {
      getUserMediaAvailable: Boolean(window.navigator?.mediaDevices?.getUserMedia),
      host: window.location?.host ?? null,
      isSecureContext: Boolean(window.isSecureContext),
      mediaDevicesAvailable: Boolean(window.navigator?.mediaDevices),
      mediaRecorderAvailable: typeof window.MediaRecorder !== "undefined",
      origin: window.location?.origin ?? null,
      protocol: window.location?.protocol ?? null,
      speechRecognitionAvailable: Boolean(window.SpeechRecognition),
      userAgent: window.navigator?.userAgent ?? null,
      webkitSpeechRecognitionAvailable: Boolean(window.webkitSpeechRecognition),
    };
  }

  function updateVoiceDiagnostics(update) {
    setVoiceDiagnostics((current) => ({
      ...current,
      ...update,
    }));
  }

  function updateRuntimeDebugSnapshot(extra = {}) {
    setVoiceRuntimeDebug({
      currentRecognitionState: recognitionStateRef.current,
      currentRecordingState: recordingStateRef.current,
      currentTranscriptRef: liveTranscriptRef.current,
      currentTranscriptReactState: transcriptStateRef.current,
      eventTimeline: voiceEventTimelineRef.current,
      finalTranscript: browserTranscriptSegmentsRef.current.final,
      interimTranscript: browserTranscriptSegmentsRef.current.interim,
      latestTranscriptBeforeStop: latestTranscriptBeforeStopRef.current,
      transcriptLength: mergeVoiceTranscript({
        transcript: browserTranscriptSegmentsRef.current.final,
        update: browserTranscriptSegmentsRef.current.interim,
      }).length,
      transcriptPassedToVoiceInterpreter: transcriptPassedToInterpreterRef.current,
      transcriptReadByStopHandler: transcriptReadByStopRef.current,
      ...extra,
    });
  }

  function appendVoiceTimelineEvent(eventName, detail = {}) {
    const timestamp = new Date().toISOString();
    const timelineEvent = {
      event: eventName,
      timestamp,
      recognitionState: recognitionStateRef.current,
      recordingState: recordingStateRef.current,
      transcriptRef: liveTranscriptRef.current,
      transcriptReactState: transcriptStateRef.current,
      finalTranscript: browserTranscriptSegmentsRef.current.final,
      interimTranscript: browserTranscriptSegmentsRef.current.interim,
      ...detail,
    };

    voiceEventTimelineRef.current = [
      ...voiceEventTimelineRef.current,
      timelineEvent,
    ];
    updateRuntimeDebugSnapshot();
    return timelineEvent;
  }

  function appendRecognitionEvent(eventName, detail = {}) {
    const timestamp = new Date().toISOString();

    appendVoiceTimelineEvent(eventName, detail);

    setVoiceDiagnostics((current) => ({
      ...current,
      recognitionEvents: [
        ...(current.recognitionEvents ?? []),
        {
          event: eventName,
          timestamp,
          ...detail,
        },
      ],
      recognitionEndTimestamp:
        eventName === "onend" ? timestamp : current.recognitionEndTimestamp,
      recognitionErrorCode:
        eventName === "onerror"
          ? detail.error ?? current.recognitionErrorCode
          : current.recognitionErrorCode,
      recognitionErrorMessage:
        eventName === "onerror"
          ? detail.message ?? current.recognitionErrorMessage
          : current.recognitionErrorMessage,
      recognitionStartTimestamp:
        eventName === "onstart" ? timestamp : current.recognitionStartTimestamp,
      recognitionStatus: detail.status ?? eventName,
    }));
  }

  function playListeningCue() {
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return;

      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.16);
      window.setTimeout(() => audioContext.close(), 220);
    } catch {
      // Visual listening feedback remains available when audio cues are blocked.
    }
  }

  function vibrateListeningCue() {
    try {
      navigator.vibrate?.(35);
    } catch {
      // Haptics are best-effort and browser/device dependent.
    }
  }

  function stopLiveTranscript({ preserveCaptureFlag = false } = {}) {
    if (!preserveCaptureFlag) shouldCaptureSpeechRef.current = false;

    try {
      liveRecognitionRef.current?.stop();
    } catch {
      // SpeechRecognition stop can throw after permission denial or auto-stop.
    }

    liveRecognitionRef.current = null;
  }

  function stopAudioPipeline() {
    stopLiveTranscript();
    window.clearInterval(durationTimerRef.current);
    durationTimerRef.current = null;

    try {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // MediaRecorder can throw if capture has already stopped.
    }

    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  async function startListening({ append = true } = {}) {
    stopAudioPipeline();
    const SpeechRecognition = getSpeechRecognition();
    const providerSnapshot = getBrowserProviderSnapshot();

    voiceEventTimelineRef.current = [];
    listeningAppendModeRef.current = append;
    previousVoiceStateBeforeListeningRef.current = voiceState;
    recognitionStateRef.current = "starting";
    recordingStateRef.current = "starting";
    latestTranscriptBeforeStopRef.current = "";
    transcriptReadByStopRef.current = "";
    transcriptPassedToInterpreterRef.current = "";
    setVoiceState("starting");
    setMicError("");
    setMicStatus("Requesting microphone access...");
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    browserTranscriptSegmentsRef.current = { final: "", interim: "" };
    shouldCaptureSpeechRef.current = true;
    selectedTranscriptionProviderRef.current = SpeechRecognition
      ? "browser_speech"
      : "typed_fallback";
    audioChunksRef.current = [];
    setRecordingDurationMs(0);
    setVoiceDiagnostics(
      createVoiceProviderDiagnostics({
        ...providerSnapshot,
        micSupportReason: getMicSupportReason(providerSnapshot),
        micSupportStatus: getMicSupportStatus(providerSnapshot),
        recordingProvider: SpeechRecognition ? "Browser SpeechRecognition" : null,
        selectedTranscriptionProvider: SpeechRecognition
          ? "Browser SpeechRecognition"
          : "Typed fallback",
        status: SpeechRecognition ? "selecting_browser_provider" : "selecting_fallback",
      })
    );
    appendVoiceTimelineEvent("provider_selected", {
      appendMode: append,
      previousVoiceState: previousVoiceStateBeforeListeningRef.current,
      selectedTranscriptionProvider: SpeechRecognition
        ? "Browser SpeechRecognition"
        : "Typed fallback",
      speechRecognitionAvailable: providerSnapshot.speechRecognitionAvailable,
      webkitSpeechRecognitionAvailable:
        providerSnapshot.webkitSpeechRecognitionAvailable,
    });
    setTranscriptionMetadata({
      audioProvider: SpeechRecognition ? "Browser SpeechRecognition" : "MediaRecorder",
      recordingDurationMs: 0,
      transcriptionProvider: SpeechRecognition
        ? "Browser SpeechRecognition"
        : "Pending",
      status: "requesting_permission",
    });

    if (SpeechRecognition) {
      await startAudioRecordingForServerTranscription();
      recordingStateRef.current =
        mediaRecorderRef.current?.state === "recording"
          ? "browser_speech_with_audio_recording"
          : "browser_speech_only";
      appendVoiceTimelineEvent("browser_speech_primary_path_selected", {
        audioRecordingAvailable: mediaRecorderRef.current?.state === "recording",
      });
      startBrowserSpeechCapture({ append, reset: true });
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setSpeechSupported(false);
      setMicError(getMicUnavailableMessage(providerSnapshot));
      setMicStatus("Type instead");
      setVoiceState("editing");
      setTranscriptionMetadata({
        audioProvider: "Unavailable",
        recordingDurationMs: 0,
        transcriptionProvider: "Type instead",
        status: "audio_capture_unavailable",
      });
      updateVoiceDiagnostics({
        fallbackReason: getMicSupportReason(providerSnapshot),
        fallbackTriggered: true,
        status: "fallback",
      });
      recognitionStateRef.current = "fallback";
      recordingStateRef.current = "unavailable";
      appendVoiceTimelineEvent("fallback_triggered", {
        reason: getMicSupportReason(providerSnapshot),
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      startLiveTranscript({ append, reset: true });
      recordingStateRef.current = "media_recorder_created";
      appendVoiceTimelineEvent("media_recorder_created");

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) audioChunksRef.current.push(event.data);
        appendVoiceTimelineEvent("media_recorder_data", {
          bytes: event.data?.size ?? 0,
        });
      };
      recorder.onstart = () => {
        recordingStateRef.current = "recording";
        appendVoiceTimelineEvent("media_recorder_start");
        recordingStartedAtRef.current = Date.now();
        durationTimerRef.current = window.setInterval(() => {
          setRecordingDurationMs(Date.now() - recordingStartedAtRef.current);
        }, 250);
        setVoiceState("listening");
        setMicStatus("Recording");
        setTranscriptionMetadata({
          audioProvider: `MediaRecorder${mimeType ? ` (${mimeType})` : ""}`,
          recordingDurationMs: 0,
          transcriptionProvider: getSpeechRecognition()
            ? "Browser SpeechRecognition"
            : "Post-recording transcript required",
          status: "recording",
        });
        playListeningCue();
        vibrateListeningCue();
      };
      recorder.onerror = () => {
        recordingStateRef.current = "error";
        appendVoiceTimelineEvent("media_recorder_error");
        setMicError("Audio recording stopped unexpectedly. Type the evidence instead.");
        setMicStatus("Type instead");
        setVoiceState("editing");
        setTranscriptionMetadata((current) => ({
          ...current,
          status: "recording_error",
        }));
      };
      recorder.start();
    } catch (captureError) {
      recognitionStateRef.current = "fallback";
      recordingStateRef.current = "error";
      appendVoiceTimelineEvent("capture_error", {
        error: captureError?.name ?? "capture_error",
        message: captureError?.message ?? null,
      });
      setSpeechSupported(false);
      setMicError(
        captureError?.name === "NotAllowedError"
          ? "Microphone permission was not granted. Type the evidence instead."
          : getMicUnavailableMessage(getBrowserProviderSnapshot(), captureError)
      );
      setMicStatus("Type instead");
      setVoiceState("editing");
      setTranscriptionMetadata({
        audioProvider: "MediaRecorder",
        recordingDurationMs: 0,
        transcriptionProvider: "Type instead",
        status: "permission_or_capture_failed",
      });
      updateVoiceDiagnostics({
        fallbackReason: getMicSupportReason(getBrowserProviderSnapshot(), captureError),
        fallbackTriggered: true,
        recognitionErrorCode: captureError?.name ?? "capture_failed",
        recognitionErrorMessage: captureError?.message ?? null,
        status: "fallback",
      });
      stopAudioPipeline();
    }
  }

  async function startAudioRecordingForServerTranscription() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      appendVoiceTimelineEvent("audio_recording_unavailable", {
        reason: "MediaRecorder or getUserMedia unavailable.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      appendVoiceTimelineEvent("audio_recording_created", {
        mimeType: mimeType || "browser_default",
      });

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) audioChunksRef.current.push(event.data);
        appendVoiceTimelineEvent("audio_recording_data", {
          bytes: event.data?.size ?? 0,
        });
      };
      recorder.onstart = () => {
        recordingStateRef.current = "browser_speech_with_audio_recording";
        appendVoiceTimelineEvent("audio_recording_start");
        setTranscriptionMetadata((current) => ({
          ...current,
          audioProvider: `Browser SpeechRecognition + MediaRecorder${
            mimeType ? ` (${mimeType})` : ""
          }`,
          status: "browser_provider_listening_with_audio_backup",
        }));
      };
      recorder.onerror = () => {
        recordingStateRef.current = "browser_speech_audio_recording_error";
        appendVoiceTimelineEvent("audio_recording_error");
      };
      recorder.start();
    } catch (captureError) {
      appendVoiceTimelineEvent("audio_recording_capture_error", {
        error: captureError?.name ?? "capture_error",
        message: captureError?.message ?? null,
      });
    }
  }

  function startBrowserSpeechCapture({ append = true, reset = false } = {}) {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setMicError("Speech recognition is unavailable in this browser. Type the evidence instead.");
      setMicStatus("Type instead");
      setVoiceState("editing");
      setTranscriptionMetadata({
        audioProvider: "Unavailable",
        recordingDurationMs: 0,
        transcriptionProvider: "Type instead",
        status: "browser_provider_unavailable",
      });
      updateVoiceDiagnostics({
        fallbackReason: "SpeechRecognition is unavailable.",
        fallbackTriggered: true,
        recognitionCreated: false,
        status: "fallback",
      });
      recognitionStateRef.current = "fallback";
      appendVoiceTimelineEvent("fallback_triggered", {
        reason: "SpeechRecognition is unavailable.",
      });
      return;
    }

    setSpeechSupported(true);
    shouldCaptureSpeechRef.current = true;
    selectedTranscriptionProviderRef.current = "browser_speech";
    recognitionStateRef.current = "constructing";
    if (reset) browserTranscriptSegmentsRef.current = { final: "", interim: "" };

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    liveRecognitionRef.current = recognition;
    appendVoiceTimelineEvent("SpeechRecognition constructed", {
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
      lang: recognition.lang,
    });
    updateVoiceDiagnostics({
      recognitionCreated: true,
      recordingProvider: "Browser SpeechRecognition",
      selectedTranscriptionProvider: "Browser SpeechRecognition",
      status: "recognition_created",
    });

    recognition.onstart = () => {
      recognitionStateRef.current = "listening";
      appendRecognitionEvent("onstart", { status: "started" });
      recordingStartedAtRef.current = Date.now();
      durationTimerRef.current = window.setInterval(() => {
        setRecordingDurationMs(Date.now() - recordingStartedAtRef.current);
      }, 250);
      setVoiceState("listening");
      setMicStatus("Listening");
      setTranscriptionMetadata({
        audioProvider: "Browser SpeechRecognition",
        recordingDurationMs: 0,
        transcriptionProvider: "Browser SpeechRecognition",
        status: "browser_provider_listening",
      });
      updateVoiceDiagnostics({
        recognitionStarted: true,
        status: "started",
      });
      playListeningCue();
      vibrateListeningCue();
    };
    recognition.onaudiostart = () => {
      recognitionStateRef.current = "audio_started";
      appendRecognitionEvent("onaudiostart", { status: "audio_started" });
    };
    recognition.onsoundstart = () => {
      recognitionStateRef.current = "sound_started";
      appendRecognitionEvent("onsoundstart", { status: "sound_started" });
    };
    recognition.onspeechstart = () => {
      recognitionStateRef.current = "speech_started";
      appendRecognitionEvent("onspeechstart", { status: "speech_started" });
    };
    recognition.onresult = (event) => {
      recognitionStateRef.current = "receiving_results";
      appendRecognitionEvent("onresult", {
        resultCount: event.results?.length ?? 0,
        resultIndex: event.resultIndex,
        status: "result_received",
      });
      applySpeechRecognitionResult(event, { append });
    };
    recognition.onspeechend = () => {
      recognitionStateRef.current = "speech_ended";
      appendRecognitionEvent("onspeechend", { status: "speech_ended" });
    };
    recognition.onsoundend = () => {
      recognitionStateRef.current = "sound_ended";
      appendRecognitionEvent("onsoundend", { status: "sound_ended" });
    };
    recognition.onaudioend = () => {
      recognitionStateRef.current = "audio_ended";
      appendRecognitionEvent("onaudioend", { status: "audio_ended" });
    };
    recognition.onerror = (event) => {
      const providerError = event?.error ?? "unknown";
      const isTerminalError =
        providerError === "not-allowed" ||
        providerError === "service-not-allowed" ||
        providerError === "audio-capture";

      recognitionStateRef.current = isTerminalError ? "error" : "non_terminal_error";
      appendRecognitionEvent("onerror", {
        error: providerError,
        message: event?.message ?? null,
        status: isTerminalError ? "terminal_error" : "non_terminal_error",
      });
      setTranscriptionMetadata((current) => ({
        ...current,
        providerError,
        status: isTerminalError
          ? "browser_provider_terminal_error"
          : "browser_provider_waiting_for_speech",
      }));

      if (isTerminalError) {
        setSpeechSupported(false);
        stopLiveTranscript();
      }
    };
    recognition.onend = () => {
      recognitionStateRef.current = "stopped";
      appendRecognitionEvent("onend", { status: "ended" });
      liveRecognitionRef.current = null;

      if (shouldCaptureSpeechRef.current) {
        window.setTimeout(() => {
          if (shouldCaptureSpeechRef.current && !liveRecognitionRef.current) {
            recognitionStateRef.current = "restarting";
            appendRecognitionEvent("restart", { status: "restart_attempted" });
            startBrowserSpeechCapture({ append, reset: false });
          }
        }, 250);
      }
    };

    try {
      recognitionStateRef.current = "start_requested";
      appendVoiceTimelineEvent("recognition_start_requested");
      recognition.start();
      updateVoiceDiagnostics({
        recognitionStartTimestamp: new Date().toISOString(),
        status: "start_requested",
      });
    } catch (startError) {
      setSpeechSupported(false);
      setMicError("Speech recognition could not start. Type the evidence instead.");
      setMicStatus("Type instead");
      setVoiceState("editing");
      setTranscriptionMetadata({
        audioProvider: "Browser SpeechRecognition",
        recordingDurationMs: 0,
        transcriptionProvider: "Type instead",
        status: "browser_provider_start_failed",
      });
      updateVoiceDiagnostics({
        fallbackReason: startError?.message ?? "SpeechRecognition start failed.",
        fallbackTriggered: true,
        recognitionErrorCode: startError?.name ?? "start_failed",
        recognitionErrorMessage: startError?.message ?? null,
        status: "fallback",
      });
      stopLiveTranscript();
    }
  }

  function applySpeechRecognitionResult(event, { append = true } = {}) {
    const nextSegments = {
      ...browserTranscriptSegmentsRef.current,
      interim: "",
    };

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const segment = event.results[index][0]?.transcript ?? "";

      if (event.results[index].isFinal) {
        nextSegments.final = mergeVoiceTranscript({
          transcript: nextSegments.final,
          update: segment,
        });
      } else {
        nextSegments.interim = mergeVoiceTranscript({
          transcript: nextSegments.interim,
          update: segment,
        });
      }
    }

    browserTranscriptSegmentsRef.current = nextSegments;
    const nextLiveTranscript = mergeVoiceTranscript({
      transcript: nextSegments.final,
      update: nextSegments.interim,
    });

    liveTranscriptRef.current = nextLiveTranscript;
    setLiveTranscript(nextLiveTranscript);
    appendVoiceTimelineEvent("transcript_updated", {
      currentTranscript: nextLiveTranscript,
      finalTranscript: nextSegments.final,
      finalTranscriptLength: nextSegments.final.length,
      interimTranscript: nextSegments.interim,
      transcriptLength: nextLiveTranscript.length,
    });
    updateVoiceDiagnostics({
      finalTranscript: nextSegments.final,
      finalTranscriptLength: nextSegments.final.length,
      interimTranscript: nextSegments.interim,
      status: "result_received",
    });

    if (append && nextLiveTranscript) {
      setTranscriptionMetadata((current) => ({
        ...current,
        status: "recording_with_live_preview",
      }));
    }
  }

  function startLiveTranscript({ append = true, reset = false } = {}) {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setTranscriptionMetadata((current) => ({
        ...current,
        transcriptionProvider: "Provider not available",
        status: "browser_provider_unavailable",
      }));
      return;
    }

    setSpeechSupported(true);
    shouldCaptureSpeechRef.current = true;
    if (reset) browserTranscriptSegmentsRef.current = { final: "", interim: "" };

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    liveRecognitionRef.current = recognition;

    recognition.onstart = () => {
      setTranscriptionMetadata((current) => ({
        ...current,
        transcriptionProvider: "Browser SpeechRecognition",
        status:
          current.status === "recording_with_live_preview"
            ? current.status
            : "browser_provider_listening",
      }));
    };
    recognition.onresult = (event) => {
      applySpeechRecognitionResult(event, { append });
    };
    recognition.onerror = (event) => {
      const providerError = event?.error ?? "unknown";
      const isPermissionError =
        providerError === "not-allowed" || providerError === "service-not-allowed";

      if (isPermissionError) setSpeechSupported(false);
      setTranscriptionMetadata((current) => ({
        ...current,
        transcriptionProvider: isPermissionError
          ? "Provider not available"
          : "Browser SpeechRecognition",
        providerError,
        status: isPermissionError
          ? "browser_provider_permission_denied"
          : "browser_provider_waiting_for_speech",
      }));
      if (isPermissionError) stopLiveTranscript();
    };
    recognition.onend = () => {
      liveRecognitionRef.current = null;

      if (shouldCaptureSpeechRef.current && mediaRecorderRef.current?.state === "recording") {
        window.setTimeout(() => {
          if (
            shouldCaptureSpeechRef.current &&
            mediaRecorderRef.current?.state === "recording" &&
            !liveRecognitionRef.current
          ) {
            startLiveTranscript({ append, reset: false });
          }
        }, 250);
      }
    };

    try {
      recognition.start();
    } catch {
      setSpeechSupported(false);
      setTranscriptionMetadata((current) => ({
        ...current,
        transcriptionProvider: "Provider not available",
        status: "browser_provider_start_failed",
      }));
      stopLiveTranscript();
    }
  }

  function getPreferredAudioMimeType() {
    if (typeof MediaRecorder === "undefined") return "";

    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
    ];

    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
  }

  async function runTranscript(
    nextTranscript = transcript,
    { nextResolvedClarificationIds = resolvedClarificationIds } = {}
  ) {
    if (!nextTranscript.trim()) return;

    transcriptPassedToInterpreterRef.current = nextTranscript;
    appendVoiceTimelineEvent("Voice Interpreter invoked", {
      transcriptLength: nextTranscript.length,
      transcriptPassedToVoiceInterpreter: nextTranscript,
    });
    stopAudioPipeline();
    setVoiceState("interpreting");
    const formData = new FormData();
    formData.set("evidenceType", "auto");
    formData.set("inputMethod", "voice");
    formData.set("evidenceNote", nextTranscript);
    formData.set("measuredAt", new Date().toISOString().slice(0, 10));
    formData.set("activeWorkoutContextId", activeWorkoutContextId);
    if (activeWorkoutContext) {
      formData.set("activeWorkoutContext", JSON.stringify(activeWorkoutContext));
    }
    nextResolvedClarificationIds.forEach((id) => {
      formData.append("resolvedClarificationIds", id);
    });

    const payload = await onSubmit(formData);
    if (!payload) {
      setVoiceState("editing");
      return;
    }
    appendVoiceTimelineEvent("Voice Interpreter completed", {
      evidenceObjectCount:
        payload?.pipelinePreview?.interpreter?.structuredEvidenceJson
          ?.evidence_objects?.length ?? 0,
    });

    const plan =
      payload?.pipelinePreview?.interpreter?.structuredEvidenceJson?.voice_conversation
        ?.clarification_plan;

    setVoiceState(hasVisibleVoiceClarification(plan) ? "clarifying" : "review");
  }

  function stopRecording() {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state !== "recording") {
        appendVoiceTimelineEvent("stopRecording skipped", {
          recorderState: recorder?.state ?? "none",
        });
        resolve();
        return;
      }

      recorder.onstop = () => {
        recordingStateRef.current = "stopped";
        appendVoiceTimelineEvent("media_recorder_stop");
        resolve();
      };
      recorder.stop();
    });
  }

  async function transcribeRecordedAudio() {
    stopLiveTranscript();
    window.clearInterval(durationTimerRef.current);
    durationTimerRef.current = null;

    const durationMs = recordingStartedAtRef.current
      ? Date.now() - recordingStartedAtRef.current
      : recordingDurationMs;
    const chunks = audioChunksRef.current;
    const usingBrowserSpeech =
      selectedTranscriptionProviderRef.current === "browser_speech";
    const mimeType = chunks[0]?.type || getPreferredAudioMimeType() || "audio/webm";
    const audioBlob = chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null;
    const browserTranscript = mergeVoiceTranscript({
      transcript: browserTranscriptSegmentsRef.current.final,
      update: browserTranscriptSegmentsRef.current.interim,
    });
    const livePreviewTranscript = (
      browserTranscript || liveTranscriptRef.current
    ).trim();
    transcriptReadByStopRef.current = livePreviewTranscript;
    appendVoiceTimelineEvent("transcript_read_after_stop", {
      browserTranscript,
      livePreviewTranscript,
      transcriptLength: livePreviewTranscript.length,
    });

    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setRecordingDurationMs(durationMs);

    const serverTranscript = audioBlob
      ? await transcribeAudioWithServer(audioBlob, {
          browserTranscript: livePreviewTranscript,
          durationMs,
        })
      : null;

    if (serverTranscript?.transcript) {
      const cleanedServerTranscript = serverTranscript.transcript.trim();

      setTranscriptionMetadata({
        audioProvider: usingBrowserSpeech
          ? "Browser SpeechRecognition + MediaRecorder"
          : `MediaRecorder${mimeType ? ` (${mimeType})` : ""}`,
        audioBytes: audioBlob?.size ?? 0,
        model: serverTranscript.model ?? null,
        recordingDurationMs: durationMs,
        transcriptionLatencyMs: serverTranscript.latencyMs ?? null,
        transcriptionProvider: serverTranscript.providerLabel,
        status: "transcribed_from_server_audio",
      });
      updateVoiceDiagnostics({
        fallbackTriggered: false,
        finalTranscript: cleanedServerTranscript,
        finalTranscriptLength: cleanedServerTranscript.length,
        interimTranscript: "",
        status: "server_transcribed",
      });
      appendVoiceTimelineEvent("server_transcription_succeeded", {
        latencyMs: serverTranscript.latencyMs ?? null,
        model: serverTranscript.model ?? null,
        provider: serverTranscript.provider,
        transcriptLength: cleanedServerTranscript.length,
      });
      return cleanedServerTranscript;
    }

    if (livePreviewTranscript) {
      setTranscriptionMetadata({
        audioProvider: usingBrowserSpeech
          ? "Browser SpeechRecognition"
          : `MediaRecorder${mimeType ? ` (${mimeType})` : ""}`,
        audioBytes: audioBlob?.size ?? 0,
        recordingDurationMs: durationMs,
        transcriptionProvider: "Browser SpeechRecognition",
        status: "transcribed_from_live_preview",
      });
      updateVoiceDiagnostics({
        fallbackTriggered: false,
        finalTranscript: browserTranscriptSegmentsRef.current.final,
        finalTranscriptLength: livePreviewTranscript.length,
        interimTranscript: browserTranscriptSegmentsRef.current.interim,
        status: "transcribed",
      });
      appendVoiceTimelineEvent("transcription_succeeded", {
        transcriptLength: livePreviewTranscript.length,
      });
      return livePreviewTranscript;
    }

    if (listeningAppendModeRef.current && transcriptStateRef.current.trim()) {
      const fallbackReason =
        "Browser SpeechRecognition stopped without returning new continuation transcript text.";

      setTranscriptionMetadata({
        audioProvider: usingBrowserSpeech
          ? "Browser SpeechRecognition"
          : `MediaRecorder${mimeType ? ` (${mimeType})` : ""}`,
        audioBytes: audioBlob?.size ?? 0,
        recordingDurationMs: durationMs,
        transcriptionProvider: "Browser SpeechRecognition",
        status: "no_new_continuation_transcript",
      });
      updateVoiceDiagnostics({
        fallbackReason,
        fallbackTriggered: false,
        finalTranscript: "",
        finalTranscriptLength: 0,
        status: "no_new_speech_captured",
      });
      appendVoiceTimelineEvent("No new speech captured", {
        reason: fallbackReason,
      });
      setMicError("No new speech was captured. Try again or type the detail.");
      setMicStatus("No new speech captured");
      setVoiceState(previousVoiceStateBeforeListeningRef.current);
      return "";
    }

    const fallbackReason = usingBrowserSpeech
      ? "Browser SpeechRecognition stopped without returning transcript text."
      : "No browser or server transcription provider returned transcript text.";

    setTranscriptionMetadata({
      audioProvider: usingBrowserSpeech
        ? "Browser SpeechRecognition"
        : `MediaRecorder${mimeType ? ` (${mimeType})` : ""}`,
      audioBytes: audioBlob?.size ?? 0,
      recordingDurationMs: durationMs,
      transcriptionProvider: "Type instead",
      status: "transcription_unavailable",
    });
    updateVoiceDiagnostics({
      fallbackReason,
      fallbackTriggered: true,
      finalTranscript: "",
      finalTranscriptLength: 0,
      status: "fallback",
    });
    recognitionStateRef.current = "fallback";
    appendVoiceTimelineEvent("Fallback triggered", {
      reason: fallbackReason,
    });
    setMicError(
      "Audio was recorded, but transcript capture is unavailable in this browser. Type the transcript to continue."
    );
    setMicStatus("Type instead");
    setVoiceState("editing");
    return "";
  }

  async function transcribeAudioWithServer(audioBlob, { browserTranscript, durationMs }) {
    appendVoiceTimelineEvent("server_transcription_requested", {
      audioBytes: audioBlob.size,
      browserTranscriptLength: browserTranscript.length,
      durationMs,
    });

    try {
      const formData = new FormData();

      formData.set("audio", audioBlob, "voice-evidence.webm");
      formData.set("browserTranscript", browserTranscript);
      formData.set("durationMs", String(durationMs));

      const response = await fetch("/api/lab/voice-transcription", {
        body: formData,
        method: "POST",
      });
      const payload = await response.json();

      appendVoiceTimelineEvent("server_transcription_completed", {
        latencyMs: payload.latencyMs ?? null,
        model: payload.model ?? null,
        provider: payload.provider,
        reason: payload.reason ?? null,
        status: response.ok ? payload.status : "error",
        transcriptLength: payload.transcript?.length ?? 0,
      });

      if (!response.ok || !payload.transcript) return null;

      return {
        latencyMs: payload.latencyMs ?? null,
        model: payload.model ?? null,
        provider: payload.provider,
        providerLabel: payload.providerLabel ?? "Server transcription",
        transcript: payload.transcript,
      };
    } catch (serverError) {
      appendVoiceTimelineEvent("server_transcription_error", {
        message: serverError?.message ?? "Server transcription failed.",
      });
      return null;
    }
  }

  function applyFixture(fixture) {
    setTranscript(fixture.transcript);
    setLiveTranscript("");
    setVoiceState("review");
    setContinuation("");
    setClarificationHistory([]);
    setExpansionTurns([]);
    setResolvedClarificationIds([]);
    setSelectedExpansionTopic(null);
    runTranscript(fixture.transcript);
  }

  function keepSpeaking(value = continuation, { appendToTranscript = true } = {}) {
    const nextContinuation = value.trim();
    if (!nextContinuation) return;

    if (isVoiceCompletionPhrase(nextContinuation)) {
      completeVoiceInteraction({
        response: nextContinuation,
        source: "spoken_or_typed",
      });
      return;
    }

    const scopedContinuation = applySelectedExpansionTopicContext({
      selectedExpansionTopic,
      update: nextContinuation,
    });
    const nextTranscript = appendToTranscript
      ? mergeVoiceTranscript({ transcript, update: scopedContinuation })
      : transcript;
    const activeQuestionId = getResolvedClarificationId(nextQuestion);

    const nextResolvedClarificationIds = activeQuestionId
      ? [...new Set([...resolvedClarificationIds, activeQuestionId])]
      : resolvedClarificationIds;

    if (activeQuestionId) setResolvedClarificationIds(nextResolvedClarificationIds);
    setClarificationHistory((history) => [
      ...history,
      {
        clarificationId: activeQuestionId,
        isNarrativeExpansion: Boolean(nextQuestion?.isNarrativeExpansion),
        response: nextContinuation,
        state: voiceState,
        targetEvidenceObjectId: nextQuestion?.targetEvidenceObjectId ?? null,
      },
    ]);
    setExpansionTurns((turns) => [
      ...turns,
      createExpansionTurn({
        nextQuestion,
        response: nextContinuation,
        selectedExpansionTopic,
        transcriptBefore: transcript,
        transcriptAfter: nextTranscript,
        source: "spoken_or_typed",
      }),
    ]);
    setTranscript(nextTranscript);
    setContinuation("");
    setSelectedExpansionTopic(null);
    runTranscript(nextTranscript, { nextResolvedClarificationIds });
  }

  function submitStructuredClarificationResponse(value = "") {
    const response = String(value ?? "").trim();
    if (!response || !nextQuestion) return;

    if (isVoiceCompletionPhrase(response)) {
      completeVoiceInteraction({
        response,
        source: "quick_response",
        structured: true,
      });
      return;
    }

    const selectedTopic = getExpansionTopicFromQuickResponse({
      question: nextQuestion,
      response,
    });

    if (selectedTopic) {
      const activeQuestionIds = getResolvedClarificationIds(nextQuestion);
      const nextResolvedClarificationIds = [
        ...new Set([
          ...resolvedClarificationIds,
          ...activeQuestionIds,
          "mixed:evidence:umbrella",
        ]),
      ];

      setResolvedClarificationIds(nextResolvedClarificationIds);
      setSelectedExpansionTopic(selectedTopic);
      setClarificationHistory((history) => [
        ...history,
        {
          clarificationId: activeQuestionIds[0] ?? null,
          evidenceType: nextQuestion.evidence_type ?? null,
          isNarrativeExpansion: Boolean(nextQuestion.isNarrativeExpansion),
          response,
          selectedExpansionTopic: selectedTopic,
          state: voiceState,
          structured: true,
          targetEvidenceObjectId: nextQuestion.targetEvidenceObjectId ?? null,
        },
      ]);
      setExpansionTurns((turns) => [
        ...turns,
        createExpansionTurn({
          nextQuestion,
          response,
          resolution: {
            mixedTopicSelectionPromptUsed: true,
            quickResponseResolutionApplied: true,
            resolvedTargetKeys: ["mixed:evidence:umbrella"],
            selectedExpansionTopic: selectedTopic,
            stableQueueTargetKey: "mixed:evidence:umbrella",
            topicScopedContextApplied: true,
          },
          resolvedClarificationIds: [
            ...activeQuestionIds,
            "mixed:evidence:umbrella",
          ],
          source: "quick_response",
          transcriptAfter: transcript,
          transcriptBefore: transcript,
        }),
      ]);
      appendVoiceTimelineEvent("mixed_topic_selected", {
        response,
        selectedExpansionTopic: selectedTopic,
      });
      return;
    }

    if (nextQuestion?.evidence_type === "mixed" && /^keep speaking$/i.test(response)) {
      setSelectedExpansionTopic(null);
      startListening({ append: true });
      return;
    }

    const structuredResolution = createStructuredQuickResponseResolution({
      question: nextQuestion,
      response,
      transcript,
    });
    const activeQuestionIds = getResolvedClarificationIds(nextQuestion);
    const nextResolvedClarificationIds = [
      ...new Set([
        ...resolvedClarificationIds,
        ...activeQuestionIds,
        ...structuredResolution.resolvedTargetKeys,
      ]),
    ];
    const nextTranscript = structuredResolution.transcriptUpdate
      ? mergeVoiceTranscript({
          transcript,
          update: structuredResolution.transcriptUpdate,
        })
      : transcript;
    setResolvedClarificationIds(nextResolvedClarificationIds);
    setClarificationHistory((history) => [
      ...history,
      {
        clarificationId: activeQuestionIds[0] ?? null,
        evidenceType: nextQuestion.evidence_type ?? null,
        isNarrativeExpansion: Boolean(nextQuestion.isNarrativeExpansion),
        response,
        state: voiceState,
        structured: true,
        stableQueueTargetKey: structuredResolution.stableQueueTargetKey,
        targetEvidenceObjectId: nextQuestion.targetEvidenceObjectId ?? null,
      },
    ]);
    setExpansionTurns((turns) => [
      ...turns,
      createExpansionTurn({
        nextQuestion,
        response,
        resolution: structuredResolution,
        resolvedClarificationIds: [
          ...activeQuestionIds,
          ...structuredResolution.resolvedTargetKeys,
        ],
        transcriptBefore: transcript,
        transcriptAfter: nextTranscript,
        source: "quick_response",
      }),
    ]);
    appendVoiceTimelineEvent("structured_clarification_response", {
      clarificationId: activeQuestionIds[0] ?? null,
      evidenceType: nextQuestion.evidence_type ?? null,
      response,
      resolution: structuredResolution,
      targetEvidenceObjectId: nextQuestion.targetEvidenceObjectId ?? null,
      transcriptAfter: nextTranscript,
    });
    setTranscript(nextTranscript);
    setContinuation("");
    setSelectedExpansionTopic(null);
    runTranscript(nextTranscript, { nextResolvedClarificationIds });
  }

  function completeVoiceInteraction({
    response,
    source,
    structured = false,
  }) {
    const activeQuestionIds = getResolvedClarificationIds(nextQuestion);
    const nextResolvedClarificationIds = [
      ...new Set([...resolvedClarificationIds, ...activeQuestionIds]),
    ];

    if (activeQuestionIds.length > 0) {
      setResolvedClarificationIds(nextResolvedClarificationIds);
    }
    setClarificationHistory((history) => [
      ...history,
      {
        clarificationId: activeQuestionIds[0] ?? null,
        evidenceType: nextQuestion?.evidence_type ?? null,
        isNarrativeExpansion: Boolean(nextQuestion?.isNarrativeExpansion),
        response,
        state: voiceState,
        structured,
        targetEvidenceObjectId: nextQuestion?.targetEvidenceObjectId ?? null,
      },
    ]);
    setExpansionTurns((turns) => [
      ...turns,
      createExpansionTurn({
        nextQuestion,
        response,
        transcriptBefore: transcript,
        transcriptAfter: transcript,
        endedInteraction: true,
        resolvedClarificationIds: activeQuestionIds,
        source,
      }),
    ]);
    appendVoiceTimelineEvent("narrative_expansion_completed", {
      clarificationIds: activeQuestionIds,
      completionPhrase: response,
      source,
    });
    setContinuation("");
    setSelectedExpansionTopic(null);
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    browserTranscriptSegmentsRef.current = { final: "", interim: "" };
    setVoiceState(evidenceObjects.length > 0 ? "saved" : "review");
  }

  function handleTypedFallback() {
    keepSpeaking(continuation);
  }

  function stopAndInterpret() {
    stopAndTranscribe();
  }

  async function stopAndTranscribe() {
    setVoiceState("transcribing");
    setMicStatus("Transcribing recording...");
    const latestTranscript = mergeVoiceTranscript({
      transcript: browserTranscriptSegmentsRef.current.final,
      update: browserTranscriptSegmentsRef.current.interim,
    }) || liveTranscriptRef.current;

    latestTranscriptBeforeStopRef.current = latestTranscript;
    appendVoiceTimelineEvent("Stop button pressed", {
      latestTranscriptBeforeStop: latestTranscript,
      latestTranscriptBeforeStopLength: latestTranscript.length,
    });
    shouldCaptureSpeechRef.current = false;
    await stopRecording();
    const nextTranscript = await transcribeRecordedAudio();

    if (!nextTranscript.trim()) return;

    if (isVoiceCompletionPhrase(nextTranscript)) {
      completeVoiceInteraction({
        response: nextTranscript,
        source: "spoken_completion",
      });
      return;
    }

    const mergedTranscript = mergeVoiceTranscript({
      transcript,
      update: nextTranscript,
    });

    setTranscript(mergedTranscript);
    await runTranscript(mergedTranscript);
  }

  function cancelListening() {
    stopAudioPipeline();
    setLiveTranscript("");
    setMicStatus("Tap the microphone to begin.");
    setVoiceState(transcript.trim() ? "review" : "ready");
  }

  return (
    <div className="voice-lab-panel fixed inset-0 z-[100] overflow-y-auto bg-[var(--surface)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] touch-manipulation flex-col px-4 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <button
            className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-muted)] px-3 py-2 text-xs font-extrabold text-[var(--text-secondary)]"
            onClick={() => {
              stopAudioPipeline();
              onClose?.();
            }}
            type="button"
          >
            <ArrowLeft size={14} />
            Log Evidence
          </button>
          {voiceState !== "ready" && (
            <span className="rounded-full bg-[var(--surface-muted)] px-3 py-2 text-xs font-extrabold text-[var(--text-muted)]">
              {formatDuration(recordingDurationMs)}
            </span>
          )}
        </div>

        {voiceState !== "ready" && (
          <VoiceProviderDebugLine
            diagnostics={voiceDiagnostics}
            metadata={transcriptionMetadata}
            runtimeDebug={voiceRuntimeDebug}
          />
        )}

        <ActiveWorkoutContextCard
          activeWorkoutContext={activeWorkoutContext}
          activeWorkoutContextId={activeWorkoutContextId}
          disabled={isProcessing || ["listening", "transcribing", "interpreting"].includes(voiceState)}
          onChange={(nextId) => {
            setActiveWorkoutContextId(nextId);
            setTranscript("");
            setVoiceState("ready");
          }}
        />

        <div className="flex flex-1 flex-col justify-center py-8">
          {voiceState === "ready" && (
            <VoiceReadyState
              diagnostics={voiceDiagnostics}
              onStart={() => startListening({ append: false })}
              onType={() => setVoiceState("editing")}
            />
          )}

          {voiceState === "starting" && <VoiceStartingState />}

          {voiceState === "listening" && (
            <div className="space-y-5">
              <VoiceListeningOrb />
              <VoiceWaveform />
              <TranscriptPreview
                liveTranscript={liveTranscript}
                transcript={transcript}
              />
              {micError && (
                <TypedVoiceFallback
                  continuation={continuation}
                  isProcessing={isProcessing}
                  micError={micError}
                  onChange={setContinuation}
                  onSubmit={handleTypedFallback}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="min-h-14 rounded-[18px] bg-[var(--surface-muted)] px-4 text-sm font-extrabold text-[var(--text-primary)]"
                  onClick={cancelListening}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-14 rounded-[18px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:opacity-60"
                  disabled={isProcessing}
                  onClick={stopAndInterpret}
                  type="button"
                >
                  Stop
                </button>
              </div>
            </div>
          )}

          {voiceState === "transcribing" && (
            <VoiceTransitionState
              detail={`Recording duration ${formatDuration(recordingDurationMs)}.`}
              title="Transcript received"
            />
          )}

          {voiceState === "interpreting" && <VoiceInterpretingProgress />}

          {voiceState === "editing" && !voicePackage && (
            <TypedVoiceFallback
              continuation={continuation}
              isProcessing={isProcessing}
              micError={micError}
              onChange={setContinuation}
              onSubmit={handleTypedFallback}
            />
          )}

          {voicePackage &&
            ["clarifying", "review", "editing", "saved"].includes(voiceState) && (
              <VoiceReviewPanel
                continuation={continuation}
                evidenceObjects={evidenceObjects}
                workoutAttachment={voicePackage?.voice_conversation?.workout_attachment}
                workoutAttachmentConflict={voicePackage?.voice_conversation?.workout_attachment_conflict}
                isProcessing={isProcessing}
                micError={micError}
                micStatus={micStatus}
                nextQuestion={nextQuestion}
                onAccept={() => setVoiceState("saved")}
                onChangeContinuation={setContinuation}
                onEdit={() => setVoiceState("editing")}
                onKeepSpeaking={() => startListening({ append: true })}
                onSubmitContinuation={() => keepSpeaking()}
                onSubmitQuickResponse={submitStructuredClarificationResponse}
                voiceState={voiceState}
              />
            )}

          <FormError error={error} />
        </div>

        <DeveloperInspector
          debugPayload={voiceDebugPayload}
          fixtures={voiceTranscriptFixtures}
          onApplyFixture={applyFixture}
        />
      </div>
    </div>
  );
}

function VoiceReadyState({ diagnostics = {}, onStart, onType }) {
  const supportMessage = getMicReadinessMessage(diagnostics);

  return (
    <div className="mx-auto w-full max-w-sm text-center">
      <button
        aria-label="Start voice capture"
        className="relative mx-auto grid h-36 w-36 touch-manipulation place-items-center rounded-full bg-[var(--primary)] text-white shadow-[0_0_0_16px_color-mix(in_srgb,var(--primary)_8%,transparent)] transition hover:scale-[1.02]"
        onClick={onStart}
        type="button"
      >
        <span className="absolute h-36 w-36 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]" />
        <Mic className="relative" size={52} />
      </button>
      <h2 className="mt-8 text-2xl font-black tracking-tight text-[var(--text-primary)]">
        Tap the microphone to begin.
      </h2>
      <p className="mx-auto mt-3 max-w-[280px] text-sm font-semibold leading-6 text-[var(--text-secondary)]">
        Speak naturally. Stop when finished, then review what will be saved.
      </p>
      <button
        className="mt-4 min-h-12 rounded-[16px] bg-[var(--surface-muted)] px-5 text-sm font-extrabold text-[var(--text-primary)]"
        onClick={onType}
        type="button"
      >
        Type details
      </button>
      {supportMessage && (
        <p
          className="mx-auto mt-4 max-w-[320px] rounded-[14px] bg-[var(--surface-muted)] px-3 py-2 text-left text-[11px] font-bold leading-5 text-[var(--text-secondary)]"
          data-testid="voice-mobile-mic-diagnostic"
        >
          {supportMessage}
        </p>
      )}
    </div>
  );
}

function VoiceProviderDebugLine({ diagnostics = {}, metadata = {}, runtimeDebug = {} }) {
  const provider =
    diagnostics.selectedTranscriptionProvider ??
    metadata.transcriptionProvider ??
    "Pending";
  const recordingProvider =
    diagnostics.recordingProvider ?? metadata.audioProvider ?? "Pending";
  const status = diagnostics.status ?? metadata.status ?? "Pending";

  return (
    <div className="mt-4 rounded-[14px] bg-[var(--surface-muted)] px-3 py-2 text-[11px] font-bold leading-5 text-[var(--text-secondary)]">
      Provider: {provider} / {recordingProvider} /{" "}
      {diagnostics.fallbackTriggered ? "Fallback" : "No fallback"}
      <br />
      Status: {status}
      <br />
      Recognition: {runtimeDebug.currentRecognitionState ?? "Idle"}
      <br />
      Recording: {runtimeDebug.currentRecordingState ?? "Idle"}
      <br />
      Transcript length: {runtimeDebug.transcriptLength ?? 0}
      <br />
      Current transcript: {runtimeDebug.currentTranscriptRef || "None"}
      <br />
      Latest final transcript: {runtimeDebug.finalTranscript || "None"}
      {diagnostics.lastTapTarget && (
        <>
          <br />
          Last tap: {diagnostics.lastTapTarget.description ?? "Unknown"} / top{" "}
          {diagnostics.lastTapTopmostElement?.description ?? "Unknown"} / clear{" "}
          {diagnostics.lastTapTopmostMatchesTarget ? "yes" : "no"}
        </>
      )}
    </div>
  );
}

function VoiceStartingState() {
  return (
    <div className="mx-auto w-full max-w-sm text-center">
      <div className="mx-auto h-2 w-28 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--primary)]" />
      </div>
      <h2 className="mt-6 text-2xl font-black tracking-tight text-[var(--text-primary)]">
        Preparing microphone
      </h2>
      <p className="mx-auto mt-3 max-w-[280px] text-sm font-semibold leading-6 text-[var(--text-secondary)]">
        Grant microphone permission to start recording.
      </p>
    </div>
  );
}

function VoiceListeningOrb() {
  return (
    <div className="flex justify-center">
      <div className="relative grid h-32 w-32 place-items-center">
        <span className="absolute h-32 w-32 animate-ping rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]" />
        <span className="absolute h-24 w-24 rounded-full bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" />
        <div className="relative grid h-24 w-24 place-items-center rounded-full bg-[var(--primary)] text-white shadow-[0_0_0_12px_color-mix(in_srgb,var(--primary)_8%,transparent)]">
          <Mic size={38} />
        </div>
      </div>
    </div>
  );
}

function VoiceTransitionState({ detail, title }) {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[24px] bg-[var(--surface-muted)] p-5 text-center">
      <div className="mx-auto h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--primary)]" />
      </div>
      <h2 className="mt-5 text-xl font-black text-[var(--text-primary)]">
        {title}
      </h2>
      {detail && (
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
          {detail}
        </p>
      )}
    </div>
  );
}

function VoiceReviewPanel({
  continuation,
  evidenceObjects,
  workoutAttachment,
  workoutAttachmentConflict,
  isProcessing,
  micError,
  micStatus,
  nextQuestion,
  onAccept,
  onChangeContinuation,
  onEdit,
  onKeepSpeaking,
  onSubmitContinuation,
  onSubmitQuickResponse,
  voiceState,
}) {
  const isClarifying = voiceState === "clarifying" && nextQuestion;

  return (
    <div className="space-y-4">
      {workoutAttachmentConflict && (
        <div className="rounded-[18px] bg-[color-mix(in_srgb,var(--chart-3)_12%,var(--surface-muted))] p-4">
          <p className="text-sm font-black text-[var(--chart-3)]">Workout target conflict</p>
          <p className="mt-1 text-xs font-bold leading-5 text-[var(--text-secondary)]">
            {workoutAttachmentConflict.message}
          </p>
        </div>
      )}
      {workoutAttachment?.updatedTrainingSessionCount === 1 && (
        <WorkoutAttachmentReview
          evidenceObject={evidenceObjects.find((object) => object.id === workoutAttachment.targetWorkoutId)}
          workoutAttachment={workoutAttachment}
        />
      )}
      {micError && (
        <div className="rounded-[18px] bg-[var(--surface-muted)] p-3">
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            {micStatus || "Voice status"}
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-[var(--text-secondary)]">
            {micError}
          </p>
        </div>
      )}

      {isClarifying ? (
        <VoiceClarificationCard
          key={nextQuestion.id}
          nextQuestion={nextQuestion}
          onKeepSpeaking={onKeepSpeaking}
          onSubmitQuickResponse={onSubmitQuickResponse}
        />
      ) : (
        <VoiceEvidenceReview evidenceObjects={evidenceObjects} />
      )}

      {voiceState === "editing" && (
        <TypedVoiceFallback
          continuation={continuation}
          isProcessing={isProcessing}
          micError="Type the change or additional detail."
          onChange={onChangeContinuation}
          onSubmit={onSubmitContinuation}
        />
      )}

      {isClarifying && (
        <div className="grid grid-cols-2 gap-3">
          <button
            className="min-h-12 rounded-[16px] bg-[var(--surface-muted)] px-4 text-sm font-extrabold text-[var(--text-primary)]"
            onClick={onEdit}
            type="button"
          >
            Type instead
          </button>
          <button
            className="min-h-12 rounded-[16px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white"
            onClick={onKeepSpeaking}
            type="button"
          >
            Keep speaking
          </button>
        </div>
      )}

      {!isClarifying && voiceState !== "saved" && (
        <div className="grid grid-cols-3 gap-2">
          <button
            className="min-h-12 rounded-[16px] bg-[var(--primary)] px-3 text-xs font-extrabold text-white disabled:opacity-60"
            disabled={evidenceObjects.length === 0}
            onClick={onAccept}
            type="button"
          >
            Looks good
          </button>
          <button
            className="min-h-12 rounded-[16px] bg-[var(--surface-muted)] px-3 text-xs font-extrabold text-[var(--text-primary)]"
            onClick={onEdit}
            type="button"
          >
            Edit
          </button>
          <button
            className="min-h-12 rounded-[16px] bg-[var(--surface-muted)] px-3 text-xs font-extrabold text-[var(--text-primary)]"
            onClick={onKeepSpeaking}
            type="button"
          >
            Keep talking
          </button>
        </div>
      )}

      {voiceState === "saved" && (
        <div className="rounded-[22px] bg-[color-mix(in_srgb,var(--chart-2)_12%,var(--surface-muted))] p-5 text-center">
          <p className="text-xl font-black text-[var(--chart-2)]">
            Evidence recorded.
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            Return to Log Evidence when ready.
          </p>
        </div>
      )}
    </div>
  );
}

function ActiveWorkoutContextCard({
  activeWorkoutContext,
  activeWorkoutContextId,
  disabled,
  onChange,
}) {
  return (
    <div className="mt-4 rounded-[20px] border border-[var(--divider)] bg-[var(--surface-muted)] p-4">
      <label className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]" htmlFor="active-workout-context">
        Active Workout Context
      </label>
      <select
        className="mt-2 min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-sm font-extrabold text-[var(--text-primary)]"
        disabled={disabled}
        id="active-workout-context"
        onChange={(event) => onChange(event.target.value)}
        value={activeWorkoutContextId}
      >
        {voiceWorkoutContextFixtures.map((fixture) => (
          <option key={fixture.id} value={fixture.id}>{fixture.label}</option>
        ))}
      </select>
      {activeWorkoutContext ? (
        <div className="mt-3 text-xs font-bold leading-5 text-[var(--text-secondary)]">
          <p className="text-sm font-black text-[var(--text-primary)]">Voice input will enrich this workout.</p>
          <p>{activeWorkoutContext.metadata.activity_type} · {activeWorkoutContext.observed_at}</p>
          <p>{Math.round(activeWorkoutContext.metadata.duration_seconds / 60)} minutes · {activeWorkoutContext.metadata.active_calories} active calories</p>
          <p>Source: {activeWorkoutContext.source.integration} · ID: {activeWorkoutContext.id}</p>
          <p>Existing exercises: {activeWorkoutContext.exercises.length || "none"}</p>
          {activeWorkoutContext.exercises.length === 0 && (
            <p className="mt-2 text-[var(--primary)]">Add exercise details to this strength workout?</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs font-bold text-[var(--text-secondary)]">Standalone Voice Simulator behavior is active.</p>
      )}
    </div>
  );
}

function WorkoutAttachmentReview({ evidenceObject, workoutAttachment }) {
  if (!evidenceObject) return null;
  return (
    <div className="rounded-[22px] bg-[color-mix(in_srgb,var(--chart-2)_10%,var(--surface-muted))] p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--chart-2)]">Updated existing workout</p>
      <h2 className="mt-2 text-xl font-black text-[var(--text-primary)]">{evidenceObject.metadata.activity_type}</h2>
      <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">Source: Apple Watch + Voice</p>
      <p className="text-sm font-bold text-[var(--text-secondary)]">Existing workout data preserved: {Math.round(evidenceObject.metadata.duration_seconds / 60)} minutes · {evidenceObject.metadata.active_calories} active calories</p>
      <p className="mt-3 text-xs font-extrabold text-[var(--text-primary)]">Added by voice</p>
      <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">{workoutAttachment.exercisesAdded.join(", ") || workoutAttachment.exercisesUpdated.join(", ") || "No exercise changes"}</p>
    </div>
  );
}

function hasVisibleVoiceClarification(plan) {
  const question = plan?.nextQuestion ?? plan?.currentActiveClarification ?? null;
  const unresolvedQueue = plan?.evidenceClarificationQueue?.some(
    (item) => item.status !== "resolved" && item.status !== "skipped"
  );

  return Boolean(
    plan?.status === "clarifying" &&
      question?.question &&
      (unresolvedQueue || question.queueTargetKey || question.id)
  );
}

function VoiceClarificationCard({ nextQuestion, onKeepSpeaking, onSubmitQuickResponse }) {
  const [selectedResponse, setSelectedResponse] = useState({
    questionId: null,
    response: null,
  });
  const activeSelectedResponse =
    selectedResponse.questionId === nextQuestion.id
      ? selectedResponse.response
      : null;

  return (
    <div className="rounded-[24px] bg-[var(--surface-muted)] p-5">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
        Clarification
      </p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-[var(--text-primary)]">
        {nextQuestion.question}
      </h2>
      <div className="mt-5 grid gap-2">
        {(nextQuestion.quickResponses ?? []).map((response) => (
          <button
            className={`min-h-12 rounded-[16px] px-4 text-left text-sm font-extrabold ${
              activeSelectedResponse === response
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--surface-elevated)] text-[var(--text-primary)]"
            }`}
            disabled={Boolean(activeSelectedResponse)}
            key={`${nextQuestion.id}-${response}`}
            onClick={() => {
              setSelectedResponse({
                questionId: nextQuestion.id,
                response,
              });
              onSubmitQuickResponse(response);
            }}
            type="button"
          >
            {response}
          </button>
        ))}
      </div>
      <button
        className="mt-3 min-h-12 w-full rounded-[16px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white"
        onClick={onKeepSpeaking}
        type="button"
      >
        Keep speaking
      </button>
    </div>
  );
}

function VoiceEvidenceReview({ evidenceObjects }) {
  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">
          Review
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--text-primary)]">
          Evidence captured
        </h2>
      </div>
      {evidenceObjects.length === 0 ? (
        <div className="rounded-[22px] bg-[var(--surface-muted)] p-5 text-center">
          <p className="text-sm font-bold text-[var(--text-secondary)]">
            More detail is needed before saving.
          </p>
        </div>
      ) : (
        evidenceObjects.map((evidenceObject, index) => (
          <VoiceEvidenceReviewCard
            evidenceObject={evidenceObject}
            index={index}
            key={getEvidenceSelectionKey(evidenceObject, index)}
          />
        ))
      )}
    </div>
  );
}

function VoiceEvidenceReviewCard({ evidenceObject, index }) {
  if (evidenceObject.evidence_type === "training") {
    const focus = cleanDisplayText(evidenceObject.metadata?.workout_focus);

    return (
      <div className="rounded-[22px] bg-[var(--surface-muted)] p-4">
        <p className="text-base font-black text-[var(--text-primary)]">
          Training Session
        </p>
        <p className="mt-1 text-sm font-bold leading-6 text-[var(--text-secondary)]">
          {focus ?? formatEvidenceObjectTitle(evidenceObject)}
        </p>
        <div className="mt-3 space-y-2">
          {(evidenceObject.exercises ?? []).map((exercise, exerciseIndex) => (
            <div
              className="rounded-[16px] bg-[var(--surface-elevated)] p-3"
              key={`${getEvidenceSelectionKey(evidenceObject, index)}-${exercise.id ?? exerciseIndex}`}
            >
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                {exercise.name}
              </p>
              <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                {formatExerciseSetSummary(exercise.sets)}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[22px] bg-[var(--surface-muted)] p-4">
      <p className="text-base font-black text-[var(--text-primary)]">
        {formatEvidenceObjectTitle(evidenceObject)}
      </p>
      <p className="mt-1 text-sm font-bold leading-6 text-[var(--text-secondary)]">
        {formatEvidenceObjectSubtitle(evidenceObject)}
      </p>
    </div>
  );
}

function VoiceWaveform() {
  const bars = [18, 32, 24, 44, 30, 52, 26, 38, 20];

  return (
    <div className="flex min-h-16 items-end justify-center gap-1.5 rounded-[18px] bg-[var(--surface-muted)] p-4">
      {bars.map((height, index) => (
        <span
          className="w-2 animate-pulse rounded-full bg-[var(--primary)]"
          key={`${height}-${index}`}
          style={{
            animationDelay: `${index * 90}ms`,
            height,
          }}
        />
      ))}
    </div>
  );
}

function formatDuration(durationMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function TranscriptPreview({ liveTranscript, transcript }) {
  const visibleTranscript = [transcript, liveTranscript].filter(Boolean).join(" ");

  return (
    <div className="rounded-[18px] bg-[var(--surface-muted)] p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Transcript
      </p>
      <p className="mt-2 min-h-12 text-sm font-bold leading-6 text-[var(--text-primary)]">
        {visibleTranscript || "Start speaking. The transcript will appear here."}
      </p>
    </div>
  );
}

function TypedVoiceFallback({
  continuation,
  isProcessing,
  micError,
  onChange,
  onSubmit,
}) {
  return (
    <div className="space-y-2 rounded-[18px] bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-bold leading-5 text-[var(--text-secondary)]">
        {micError || "Speech recognition is unavailable in this browser."}
      </p>
      <TextAreaField
        helper="Type the evidence here. It will be reviewed the same way as spoken evidence."
        label="Type instead"
        name="voiceTypedFallback"
        placeholder="I weighed 168.2 this morning..."
        value={continuation}
        onChange={onChange}
      />
      <button
        className="min-h-11 w-full rounded-[14px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:opacity-60"
        disabled={isProcessing || !continuation.trim()}
        onClick={onSubmit}
        type="button"
      >
        Send transcript
      </button>
    </div>
  );
}

function getVoiceStateHeading(voiceState) {
  if (voiceState === "ready") return "Voice";
  if (voiceState === "starting") return "Preparing microphone";
  if (voiceState === "listening") return "Listening";

  return voiceFlowStates.find((state) => state.id === voiceState)?.label ?? "Voice";
}

function VoiceInterpretingProgress() {
  const steps = [
    "Transcript received",
    "Detecting evidence",
    "Reconciling evidence",
    "Preparing review",
  ];

  return (
    <div className="rounded-[18px] bg-[var(--surface-muted)] p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Voice intake
      </p>
      <div className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <div
            className="flex items-center gap-3 rounded-[14px] bg-[var(--surface-elevated)] p-3"
            key={step}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-black text-white">
              {index + 1}
            </span>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeveloperInspector({ debugPayload, fixtures = [], onApplyFixture }) {
  const [copyLabel, setCopyLabel] = useState("Copy Debug JSON");

  async function copyDebugJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(debugPayload, null, 2));
      setCopyLabel("Copied");
    } catch {
      setCopyLabel("Copy failed");
    }

    window.setTimeout(() => setCopyLabel("Copy Debug JSON"), 1800);
  }

  return (
    <details className="rounded-[18px] border border-dashed border-[var(--divider)] bg-[var(--surface)] p-3">
      <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-primary)]">
        Developer tools
      </summary>
      <div className="mt-3 space-y-3">
        {fixtures.length > 0 && (
          <div className="rounded-[14px] bg-[var(--surface-muted)] p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Developer fixtures
            </p>
            <div className="mt-2 grid gap-2">
              {fixtures.map((fixture) => (
                <button
                  className="rounded-[12px] bg-[var(--surface-elevated)] px-3 py-2 text-left text-xs font-extrabold text-[var(--text-primary)]"
                  key={fixture.label}
                  onClick={() => onApplyFixture?.(fixture)}
                  type="button"
                >
                  {fixture.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          className="min-h-10 rounded-[14px] bg-[var(--surface-muted)] px-3 text-xs font-extrabold text-[var(--text-primary)]"
          onClick={copyDebugJson}
          type="button"
        >
          {copyLabel}
        </button>
        <pre className="max-h-80 overflow-auto rounded-[14px] bg-[var(--surface-muted)] p-3 text-[11px] font-bold leading-5 text-[var(--text-secondary)]">
          {JSON.stringify(debugPayload, null, 2)}
        </pre>
      </div>
    </details>
  );
}

function createVoiceProviderDiagnostics(overrides = {}) {
  return {
    getUserMediaAvailable: null,
    host: null,
    userAgent: null,
    isSecureContext: null,
    mediaDevicesAvailable: null,
    mediaRecorderAvailable: null,
    micSupportReason: null,
    micSupportStatus: null,
    origin: null,
    protocol: null,
    speechRecognitionAvailable: null,
    webkitSpeechRecognitionAvailable: null,
    selectedTranscriptionProvider: "Not started",
    recordingProvider: "Not started",
    recognitionCreated: false,
    recognitionStarted: false,
    recognitionStartTimestamp: null,
    recognitionEndTimestamp: null,
    recognitionEvents: [],
    recognitionErrorCode: null,
    recognitionErrorMessage: null,
    interimTranscript: "",
    finalTranscript: "",
    finalTranscriptLength: 0,
    fallbackTriggered: false,
    fallbackReason: null,
    lastTapTarget: null,
    lastTapTopmostElement: null,
    lastTapTopmostMatchesTarget: null,
    status: "idle",
    ...overrides,
  };
}

function createMobileTapDiagnostics(overrides = {}) {
  return {
    coordinates: null,
    pointerType: null,
    target: null,
    timestamp: null,
    topmost: null,
    topmostMatchesTarget: null,
    ...overrides,
  };
}

function getMicSupportStatus(snapshot = {}) {
  if (snapshot.speechRecognitionAvailable || snapshot.webkitSpeechRecognitionAvailable) {
    return "browser_speech_available";
  }

  if (snapshot.getUserMediaAvailable && snapshot.mediaRecorderAvailable) {
    return "server_transcription_audio_available";
  }

  return "unsupported";
}

function getMicSupportReason(snapshot = {}, error = null) {
  if (error?.name === "NotAllowedError") {
    return "Microphone permission was denied by the browser.";
  }

  if (error?.message) {
    return error.message;
  }

  if (!snapshot.isSecureContext) {
    return "Microphone capture requires a secure HTTPS origin on mobile. A phone using a computer LAN IP is not treated as localhost.";
  }

  if (!snapshot.mediaDevicesAvailable || !snapshot.getUserMediaAvailable) {
    return "navigator.mediaDevices.getUserMedia is unavailable in this browser context.";
  }

  if (!snapshot.mediaRecorderAvailable) {
    return "MediaRecorder is unavailable, so server transcription cannot receive audio.";
  }

  if (!snapshot.speechRecognitionAvailable && !snapshot.webkitSpeechRecognitionAvailable) {
    return "Browser speech preview is unavailable, but secure audio recording can use server transcription.";
  }

  return "Microphone and browser speech APIs are available.";
}

function getMicUnavailableMessage(snapshot = {}, error = null) {
  return `${getMicSupportReason(snapshot, error)} Type the evidence instead.`;
}

function getMicReadinessMessage(diagnostics = {}) {
  if (diagnostics.micSupportStatus === "unsupported") {
    return `Mic unavailable: ${diagnostics.micSupportReason}`;
  }

  if (diagnostics.micSupportStatus === "server_transcription_audio_available") {
    return "Mic available over secure audio capture. Browser live preview may be unavailable; server transcription will run after Stop.";
  }

  if (diagnostics.isSecureContext === false) {
    return `Mic unavailable: ${getMicSupportReason(diagnostics)}`;
  }

  return null;
}

function describeElementForTapDiagnostics(element) {
  if (!element) return null;

  const tag = element.tagName?.toLowerCase?.() ?? "unknown";
  const id = element.id ? `#${element.id}` : "";
  const testId = element.getAttribute?.("data-testid");
  const ariaLabel = element.getAttribute?.("aria-label");
  const text = String(element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return {
    ariaLabel,
    className: String(element.className ?? "").slice(0, 160),
    description: `${tag}${id}${testId ? `[data-testid="${testId}"]` : ""}`,
    text,
  };
}

function createVoiceRuntimeDebugSnapshot(overrides = {}) {
  return {
    currentRecognitionState: "idle",
    currentRecordingState: "idle",
    currentTranscriptRef: "",
    currentTranscriptReactState: "",
    eventTimeline: [],
    finalTranscript: "",
    interimTranscript: "",
    latestTranscriptBeforeStop: "",
    transcriptLength: 0,
    transcriptPassedToVoiceInterpreter: "",
    transcriptReadByStopHandler: "",
    ...overrides,
  };
}

function createVoiceDebugPayload({
  clarificationHistory,
  clarificationPlan,
  error,
  evidenceObjects,
  expansionTurns = [],
  liveTranscript,
  mobileTapDiagnostics,
  micError,
  micStatus,
  recordingDurationMs,
  resolvedClarificationIds,
  selectedExpansionTopic,
  speechSupported,
  transcript,
  transcriptionMetadata,
  voiceDiagnostics,
  voiceRuntimeDebug,
  voicePackage,
  voiceState,
}) {
  return {
    rawTranscript: transcript,
    finalTranscript: transcript,
    originalTranscript: expansionTurns[0]?.transcriptBefore ?? transcript,
    followUpTranscripts: expansionTurns.map((turn) => turn.response),
    cumulativeNarrative: transcript,
    repeatedFollowUpFragments:
      voicePackage?.voice_conversation?.repeated_follow_up_fragments ??
      getRepeatedFollowUpFragments(expansionTurns),
    dedupedNarrative:
      voicePackage?.voice_conversation?.deduped_narrative ?? transcript,
    repetitionDedupingApplied:
      voicePackage?.voice_conversation?.repetition_deduping_applied ??
      getRepeatedFollowUpFragments(expansionTurns).length > 0,
    expansionTurns,
    previousEvidenceObjects:
      expansionTurns.at(-1)?.previousEvidenceObjects ?? [],
    updatedEvidenceObjects: evidenceObjects,
    expansionPromptShown: clarificationPlan?.nextQuestion?.isNarrativeExpansion
      ? clarificationPlan.nextQuestion.question
      : null,
    userEndedInteraction:
      expansionTurns.some((turn) => turn.endedInteraction) ||
      voiceState === "saved" ||
      Boolean(
        voicePackage?.voice_conversation
          ?.completion_phrase_detected_in_original_transcript?.detected
      ),
    noFurtherExpansionReason:
      clarificationPlan?.nextQuestion
        ? null
        : evidenceObjects.length > 0
          ? "Current evidence is ready for review."
          : "No canonical evidence is available yet.",
    resolvedTranscript:
      voicePackage?.voice_conversation?.resolved_transcript ?? transcript,
    conversationalResolution:
      voicePackage?.voice_conversation?.conversational_resolution ?? null,
    workoutAttachment:
      voicePackage?.voice_conversation?.workout_attachment ?? null,
    workoutAttachmentConflict:
      voicePackage?.voice_conversation?.workout_attachment_conflict ?? null,
    targetBeforeEnrichment:
      voicePackage?.voice_conversation?.target_before_enrichment ?? null,
    voiceTrainingInterpretation:
      voicePackage?.voice_conversation?.voice_training_interpretation ?? null,
    updatedWorkoutTarget:
      voicePackage?.voice_conversation?.updated_workout_target ?? null,
    rejectedValues:
      voicePackage?.voice_conversation?.conversational_resolution?.rejected_values ??
      [],
    acceptedValues:
      voicePackage?.voice_conversation?.conversational_resolution?.accepted_values ??
      [],
    resolvedFacts:
      voicePackage?.voice_conversation?.conversational_resolution ?? null,
    detectedPrimaryIntent:
      voicePackage?.voice_conversation?.detected_primary_intent ?? null,
    intentConfidence: voicePackage?.voice_conversation?.intent_confidence ?? null,
    entityResolution:
      voicePackage?.voice_conversation?.entity_resolution ?? null,
    detectedEvidenceIntents:
      voicePackage?.voice_conversation?.detected_evidence_intents ?? [],
    interpreterOutputs:
      voicePackage?.voice_conversation?.interpreter_outputs ?? [],
    mergedEvidenceObjects:
      voicePackage?.voice_conversation?.merged_evidence_objects ??
      evidenceObjects,
    clarificationCandidates:
      clarificationPlan?.clarificationCandidates ??
      clarificationPlan?.opportunities ??
      [],
    evidenceClarificationQueue:
      clarificationPlan?.evidenceClarificationQueue ?? [],
    currentQueueIndex: clarificationPlan?.currentQueueIndex ?? -1,
    currentQueueTarget:
      voiceState === "saved" ? null : clarificationPlan?.currentQueueTarget ?? null,
    resolvedQueueTargets: clarificationPlan?.resolvedQueueTargets ?? [],
    skippedQueueTargets: clarificationPlan?.skippedQueueTargets ?? [],
    whyNextTargetWasChosen: clarificationPlan?.whyNextTargetWasChosen ?? null,
    whyOtherTargetsWereSkipped: clarificationPlan?.whyOtherTargetsWereSkipped ?? [],
    discardedClarifications:
      clarificationPlan?.discardedClarifications ?? [],
    currentClarificationTarget:
      voiceState === "saved"
        ? null
        : clarificationPlan?.currentClarificationTarget ??
      (clarificationPlan?.nextQuestion
        ? {
            evidence_type: clarificationPlan.nextQuestion.evidence_type,
            questionId: clarificationPlan.nextQuestion.id,
            targetEvidenceObjectId:
              clarificationPlan.nextQuestion.targetEvidenceObjectId ?? null,
          }
        : null),
    conversationStateTransitions:
      voicePackage?.voice_conversation?.conversation_state_transitions ??
      voicePackage?.voice_conversation?.states ??
      [],
    goodBetterBestLevel: clarificationPlan?.goodBetterBestLevel ?? null,
    evidenceLifetime:
      voicePackage?.voice_conversation?.evidence_lifetime ?? [],
    clarificationReason:
      clarificationPlan?.nextQuestion?.clarificationReason ?? null,
    clarificationScore:
      clarificationPlan?.nextQuestion?.clarificationScore ?? null,
    whyHigherPriorityQuestionsWereSkipped:
      clarificationPlan?.whyHigherPriorityQuestionsWereSkipped ?? [],
    clauseSegmentation:
      voicePackage?.voice_conversation?.clause_segmentation ?? null,
    clausesConsumedByInterpreter:
      voicePackage?.voice_conversation?.clause_segmentation
        ?.clausesConsumedByInterpreter ?? {},
    unconsumedClauses:
      voicePackage?.voice_conversation?.clause_segmentation
        ?.unconsumedClauses ?? [],
    nutritionClauseContamination:
      voicePackage?.voice_conversation?.clause_segmentation
        ?.nutritionClauseContamination ?? [],
    numericAmbiguities:
      voicePackage?.voice_conversation?.numeric_ambiguities ??
      voicePackage?.voice_conversation?.numeric_resilience?.numericAmbiguities ??
      [],
    suspiciousNumericValues:
      voicePackage?.voice_conversation?.suspicious_numeric_values ??
      voicePackage?.voice_conversation?.numeric_resilience
        ?.suspiciousNumericValues ??
      [],
    domainPlausibilityChecks:
      voicePackage?.voice_conversation?.domain_plausibility_checks ??
      voicePackage?.voice_conversation?.numeric_resilience
        ?.domainPlausibilityChecks ??
      [],
    acceptedNumericCorrections:
      voicePackage?.voice_conversation?.accepted_numeric_corrections ??
      voicePackage?.voice_conversation?.numeric_resilience
        ?.acceptedNumericCorrections ??
      [],
    rejectedNumericValues:
      voicePackage?.voice_conversation?.rejected_numeric_values ??
      voicePackage?.voice_conversation?.numeric_resilience?.rejectedNumericValues ??
      [],
    activePromptContextApplied:
      voicePackage?.voice_conversation?.active_prompt_context_applied ??
      voicePackage?.voice_conversation?.numeric_resilience
        ?.activePromptContextApplied ??
      [],
    transcriptionConfidenceNotes:
      voicePackage?.voice_conversation?.transcription_confidence_notes ??
      voicePackage?.voice_conversation?.numeric_resilience
        ?.transcriptionConfidenceNotes ??
      [],
    inferredExerciseDetailsFromNearbyClause:
      evidenceObjects
        .flatMap(
          (object) =>
            object.voice_interpretation
              ?.inferred_exercise_details_from_nearby_clause ?? []
        )
        .filter(Boolean),
    nearestExerciseBackfillApplied:
      evidenceObjects.some(
        (object) =>
          object.voice_interpretation?.nearest_exercise_backfill_applied
      ),
    nutritionMacrosExtractedFromMealContext:
      evidenceObjects
        .map(
          (object) =>
            object.voice_interpretation
              ?.nutrition_macros_extracted_from_meal_context ??
            object.metadata?.nutrition_macros_extracted_from_meal_context
        )
        .filter(Boolean)[0] ?? [],
    nutritionPromptSuppressedBecauseMacrosKnown:
      evidenceObjects.some(
        (object) =>
          object.voice_interpretation
            ?.nutrition_prompt_suppressed_because_macros_known ||
          object.metadata?.nutrition_prompt_suppressed_because_macros_known
      ),
    nutritionPromptSuppressedBecauseFoodKnown:
      evidenceObjects.some(
        (object) =>
          object.voice_interpretation
            ?.nutrition_prompt_suppressed_because_food_known ||
          object.voice_interpretation
            ?.nutritionPromptSuppressedBecauseFoodKnown ||
          object.metadata?.nutrition_prompt_suppressed_because_food_known ||
          object.metadata?.nutritionPromptSuppressedBecauseFoodKnown
      ),
    completionPhraseDetectedInOriginalTranscript:
      voicePackage?.voice_conversation
        ?.completion_phrase_detected_in_original_transcript ?? null,
    exerciseParseFailed:
      evidenceObjects
        .flatMap(
          (object) => object.voice_interpretation?.exercise_parse_failed ?? []
        )
        .filter(Boolean),
    parserPatternMatched:
      evidenceObjects
        .map((object) => object.voice_interpretation?.parser_pattern_matched)
        .filter(Boolean)[0] ?? null,
    clauseSplitStrategy:
      evidenceObjects
        .map((object) => object.voice_interpretation?.clause_split_strategy)
        .filter(Boolean)[0] ?? null,
    rawExerciseClauses:
      evidenceObjects
        .flatMap(
          (object) => object.voice_interpretation?.raw_exercise_clauses ?? []
        )
        .filter(Boolean),
    parsedExerciseClauses:
      evidenceObjects
        .flatMap(
          (object) => object.voice_interpretation?.parsed_exercise_clauses ?? []
        )
        .filter(Boolean),
    matchedParserPatterns:
      evidenceObjects
        .flatMap(
          (object) => object.voice_interpretation?.matched_parser_patterns ?? []
        )
        .filter(Boolean),
    exerciseOntologyMatch:
      evidenceObjects
        .map((object) => object.voice_interpretation?.exercise_ontology_match)
        .filter(Boolean)[0] ?? null,
    exerciseOntologyMatches:
      evidenceObjects
        .flatMap(
          (object) => object.voice_interpretation?.exercise_ontology_matches ?? []
        )
        .filter(Boolean),
    correctionResolutionByClause:
      evidenceObjects
        .flatMap(
          (object) =>
            object.voice_interpretation?.correction_resolution_by_clause ?? []
        )
        .filter(Boolean),
    droppedOrOverwrittenExercises:
      evidenceObjects
        .flatMap(
          (object) =>
            object.voice_interpretation?.dropped_or_overwritten_exercises ?? []
        )
        .filter(Boolean),
    droppedClauses:
      evidenceObjects
        .flatMap((object) => object.voice_interpretation?.dropped_clauses ?? [])
        .filter(Boolean),
    unmatchedClauses:
      evidenceObjects
        .flatMap((object) => object.voice_interpretation?.unmatched_clauses ?? [])
        .filter(Boolean),
    liveTranscript,
    conversationState: voiceState,
    runtimeTimeline: voiceRuntimeDebug.eventTimeline ?? [],
    runtimeVoiceState: {
      currentRecognitionState: voiceRuntimeDebug.currentRecognitionState,
      currentRecordingState: voiceRuntimeDebug.currentRecordingState,
      currentTranscriptRef: voiceRuntimeDebug.currentTranscriptRef,
      currentTranscriptReactState: voiceRuntimeDebug.currentTranscriptReactState,
      transcriptLength: voiceRuntimeDebug.transcriptLength,
      latestTranscriptBeforeStop: voiceRuntimeDebug.latestTranscriptBeforeStop,
      transcriptReadByStopHandler: voiceRuntimeDebug.transcriptReadByStopHandler,
      transcriptPassedToVoiceInterpreter:
        voiceRuntimeDebug.transcriptPassedToVoiceInterpreter,
      finalTranscript: voiceRuntimeDebug.finalTranscript,
      interimTranscript: voiceRuntimeDebug.interimTranscript,
      fallbackReason: voiceDiagnostics.fallbackReason,
      fallbackTriggered: voiceDiagnostics.fallbackTriggered,
    },
    audioPipeline: {
      audioProvider: transcriptionMetadata.audioProvider,
      recordingDurationMs,
      recordingSucceeded:
        transcriptionMetadata.status === "recording" ||
        Number(transcriptionMetadata.audioBytes) > 0,
      transcriptDeliveredToVoiceInterpreter: Boolean(transcript && voicePackage),
      transcriptionProvider: transcriptionMetadata.transcriptionProvider,
      transcriptionSucceeded: Boolean(transcript),
      transcriptionStatus: transcriptionMetadata.status,
      providerMetadata: transcriptionMetadata,
      providerDiagnostics: voiceDiagnostics,
      userAgent: voiceDiagnostics.userAgent,
      isSecureContext: voiceDiagnostics.isSecureContext,
      origin: voiceDiagnostics.origin,
      protocol: voiceDiagnostics.protocol,
      host: voiceDiagnostics.host,
      mediaDevicesAvailable: voiceDiagnostics.mediaDevicesAvailable,
      getUserMediaAvailable: voiceDiagnostics.getUserMediaAvailable,
      mediaRecorderAvailable: voiceDiagnostics.mediaRecorderAvailable,
      micSupportStatus: voiceDiagnostics.micSupportStatus,
      micSupportReason: voiceDiagnostics.micSupportReason,
      speechRecognitionAvailable: voiceDiagnostics.speechRecognitionAvailable,
      webkitSpeechRecognitionAvailable:
        voiceDiagnostics.webkitSpeechRecognitionAvailable,
      selectedTranscriptionProvider:
        voiceDiagnostics.selectedTranscriptionProvider,
      recordingProvider: voiceDiagnostics.recordingProvider,
      recognitionCreated: voiceDiagnostics.recognitionCreated,
      recognitionStarted: voiceDiagnostics.recognitionStarted,
      recognitionStartTimestamp: voiceDiagnostics.recognitionStartTimestamp,
      recognitionEndTimestamp: voiceDiagnostics.recognitionEndTimestamp,
      recognitionEvents: voiceDiagnostics.recognitionEvents,
      recognitionErrorCode: voiceDiagnostics.recognitionErrorCode,
      recognitionErrorMessage: voiceDiagnostics.recognitionErrorMessage,
      interimTranscript: voiceDiagnostics.interimTranscript,
      finalTranscriptFromProvider: voiceDiagnostics.finalTranscript,
      finalTranscriptLength: voiceDiagnostics.finalTranscriptLength,
      fallbackTriggered: voiceDiagnostics.fallbackTriggered,
      fallbackReason: voiceDiagnostics.fallbackReason,
      liveTranscriptPreviewSupported: speechSupported,
      status: micStatus,
      error: micError || null,
    },
    mobileTapDiagnostics,
    lastTapTarget: mobileTapDiagnostics?.target ?? null,
    lastTapTopmostElement: mobileTapDiagnostics?.topmost ?? null,
    lastTapTopmostMatchesTarget:
      mobileTapDiagnostics?.topmostMatchesTarget ?? null,
    canonicalEvidenceCreated: evidenceObjects.length > 0,
    detectedIntents:
      voicePackage?.detected_evidence_objects ??
      evidenceObjects.map((object) => ({
        evidence_type: object.evidence_type,
        id: object.id,
      })),
    clarificationRanking: clarificationPlan?.opportunities ?? [],
    clarificationHistory,
    clarificationState:
      voiceState === "saved" ? "saved" : clarificationPlan?.status ?? null,
    currentActiveClarification:
      voiceState === "saved" ? null : clarificationPlan?.nextQuestion ?? null,
    quickResponseResolutionApplied:
      expansionTurns.some((turn) => turn.source === "quick_response"),
    stableQueueTargetKey:
      clarificationPlan?.currentQueueTarget?.queueTargetKey ??
      expansionTurns.at(-1)?.resolution?.stableQueueTargetKey ??
      null,
    queueTargetResolvedByQuickResponse:
      expansionTurns
        .filter((turn) => turn.source === "quick_response")
        .flatMap((turn) => turn.resolution?.resolvedTargetKeys ?? [])
        .filter(Boolean),
    promptRegeneratedAfterResolution: Boolean(
      clarificationPlan?.currentQueueTarget?.queueTargetKey &&
        resolvedClarificationIds.includes(
          clarificationPlan.currentQueueTarget.queueTargetKey
        )
    ),
    mixedEvidenceUmbrellaPromptUsed:
      clarificationPlan?.mixedEvidenceUmbrellaPromptUsed ??
      Boolean(clarificationPlan?.nextQuestion?.mixedEvidenceUmbrellaPromptUsed),
    promptCoveredEvidenceTypes:
      clarificationPlan?.promptCoveredEvidenceTypes ??
      clarificationPlan?.nextQuestion?.promptCoveredEvidenceTypes ??
      [],
    mixedTopicSelectionPromptUsed:
      expansionTurns.some((turn) => turn.resolution?.mixedTopicSelectionPromptUsed) ||
      Boolean(clarificationPlan?.nextQuestion?.isMixedEvidenceUmbrella),
    availableExpansionTopics:
      clarificationPlan?.nextQuestion?.isMixedEvidenceUmbrella
        ? (clarificationPlan.nextQuestion.quickResponses ?? []).filter((response) =>
            /^(injury|workout|lunch|meal)$/i.test(response)
          )
        : [],
    selectedExpansionTopic:
      selectedExpansionTopic ??
      expansionTurns.find((turn) => turn.resolution?.selectedExpansionTopic)
        ?.resolution?.selectedExpansionTopic ??
      null,
    topicScopedContextApplied:
      expansionTurns.some((turn) => turn.selectedExpansionTopic),
    skipIntentDetected:
      expansionTurns.some((turn) => turn.endedInteraction) ||
      isVoiceCompletionPhrase(expansionTurns.at(-1)?.response ?? ""),
    skipPhraseMatched:
      expansionTurns.find((turn) => isVoiceCompletionPhrase(turn.response))
        ?.response ?? null,
    unknownFieldResolved:
      evidenceObjects
        .filter((object) => object.metadata?.trigger_context === "unknown")
        .map((object) => ({
          evidence_type: object.evidence_type,
          field: "trigger_context",
          value: "unknown",
        })),
    promptTargetMismatchResolved:
      expansionTurns.some((turn) => turn.resolution?.mismatchDetected),
    inferredSymptomDurationFromToday:
      evidenceObjects.some(
        (object) => object.metadata?.duration_inferred_from_today
      ),
    nutritionFoodClauseCleaned:
      evidenceObjects.some(
        (object) => object.voice_interpretation?.nutrition_food_clause_cleaned
      ),
    exerciseHeadingBackfillApplied:
      evidenceObjects.some(
        (object) => object.voice_interpretation?.exercise_heading_backfill_applied
      ),
    effortPhraseMapped:
      evidenceObjects.some((object) => object.voice_interpretation?.effort_phrase_mapped),
    effortPhraseSource:
      evidenceObjects
        .map((object) => object.voice_interpretation?.effort_phrase_source)
        .filter(Boolean)[0] ?? null,
    pronounExerciseBackfillApplied:
      evidenceObjects.some(
        (object) => object.voice_interpretation?.pronoun_exercise_backfill_applied
      ),
    macroContextProtectedFromActivity:
      voicePackage?.voice_conversation?.macro_context_protected_from_activity ??
      evidenceObjects.some(
        (object) => object.voice_interpretation?.macro_context_protected_from_activity
      ),
    falseActivityFromWalkedHomeSuppressed:
      voicePackage?.voice_conversation?.false_activity_from_walked_home_suppressed ??
      evidenceObjects.some(
        (object) =>
          object.voice_interpretation?.false_activity_from_walked_home_suppressed
      ),
    quickResponseMismatchDetected:
      expansionTurns.some((turn) => turn.resolution?.mismatchDetected),
    parserRecoveryAttempted:
      expansionTurns.some((turn) => turn.resolution?.parserRecoveryAttempted) ||
      evidenceObjects.some(
        (object) => (object.voice_interpretation?.exercise_parse_failed ?? []).length > 0
      ),
    parserRecoverySucceeded:
      expansionTurns.some((turn) => turn.resolution?.parserRecoverySucceeded) ||
      evidenceObjects.some(
        (object) =>
          object.evidence_type === "training" &&
          (object.exercises ?? []).length > 0 &&
          (object.voice_interpretation?.raw_exercise_clauses ?? []).length > 0
      ),
    bodyWeightIntentSuppressedByContext:
      /\bi\s+already\s+gave\s+you\s+the\s+weight\b/i.test(transcript),
    resolvedClarificationIds,
    userResponses: clarificationHistory.map((item) => item.response),
    pendingEvidence: evidenceObjects.map((object) => ({
      id: object.id,
      evidence_type: object.evidence_type,
      title: formatEvidenceObjectTitle(object),
    })),
    canonicalEvidenceObjects: evidenceObjects,
    confidence: {
      extraction: voicePackage?.quality?.extraction_confidence ?? null,
      interpretation: voicePackage?.quality?.interpreter_confidence ?? null,
    },
    provenance: voicePackage?.provenance ?? null,
    reconciliationOutput: voicePackage?.reconciliation ?? null,
    repositoryWrites: {
      persisted: false,
      reason: "Simulator preview only.",
    },
    validationWarnings: voicePackage?.diagnostics?.warnings ?? [],
    errors: [error, micError].filter(Boolean),
  };
}

function getExpansionTopicFromQuickResponse({ question, response }) {
  if (!question?.isMixedEvidenceUmbrella) return null;

  const normalized = String(response ?? "").trim().toLowerCase();
  if (normalized === "injury") return "health_symptom";
  if (normalized === "workout") return "training";
  if (normalized === "meal" || normalized === "lunch") return "nutrition";

  return null;
}

function applySelectedExpansionTopicContext({ selectedExpansionTopic, update }) {
  const text = String(update ?? "").trim();
  if (!selectedExpansionTopic || !text) return text;

  if (selectedExpansionTopic === "training") return `Workout detail: ${text}`;
  if (selectedExpansionTopic === "nutrition") return `Meal detail: ${text}`;
  if (selectedExpansionTopic === "health_symptom") return `Injury detail: ${text}`;

  return text;
}

function mergeVoiceTranscript({ transcript, update }) {
  const current = String(transcript ?? "").trim();
  const next = String(update ?? "").trim();
  const weightCorrection = next.match(/\bmake that\s+(\d{2,3}(?:\.\d+)?)\b/i);

  if (weightCorrection && /\b(weighed|weight|scale)\b/i.test(current)) {
    return current.replace(
      /(\b(?:weighed|weight(?:\s*was)?|scale(?:\s*was)?)\s*(?:at|was|is)?\s*)\d{2,3}(?:\.\d+)?/i,
      `$1${weightCorrection[1]}`
    );
  }

  if (!current) return next;
  if (!next) return current;

  if (isRepeatedTranscript({ current, next })) return current;

  if (/^(actually|no wait)/i.test(next)) {
    return `${current} ${next}`.trim();
  }

  return `${current} ${next}`.trim();
}

function isRepeatedTranscript({ current, next }) {
  const currentKey = normalizeVoiceTranscriptForDedupe(current);
  const nextKey = normalizeVoiceTranscriptForDedupe(next);

  if (!nextKey) return true;
  if (currentKey === nextKey) return true;

  const currentSentences = currentKey.split(/(?<=[.!?])\s+|\s{2,}/).filter(Boolean);
  return currentSentences.at(-1) === nextKey || currentKey.endsWith(` ${nextKey}`);
}

function normalizeVoiceTranscriptForDedupe(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\bit'?s\b/g, "it is")
    .replace(/\bdoesn'?t\b/g, "does not")
    .replace(/\bno big deal\b/g, "not a big deal")
    .replace(/\bnot that bad\b/g, "mild")
    .replace(/\bdoes not hurt that bad\b/g, "mild")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[.!?,;:]+$/g, "")
    .trim();
}

function getRepeatedFollowUpFragments(expansionTurns = []) {
  return expansionTurns
    .filter(
      (turn) =>
        !turn.endedInteraction &&
        normalizeVoiceTranscriptForDedupe(turn.transcriptBefore) ===
          normalizeVoiceTranscriptForDedupe(turn.transcriptAfter)
    )
    .map((turn) => turn.response)
    .filter(Boolean);
}

function createStructuredQuickResponseResolution({
  question,
  response,
  transcript,
}) {
  const normalizedResponse = String(response ?? "").trim().toLowerCase();
  const stableQueueTargetKey = getQuestionQueueTargetKey(question);
  const topic = question?.topic ?? stableQueueTargetKey?.split(":").at(-1) ?? null;
  const resolvedTargetKeys = [];
  let transcriptUpdate = null;
  let mismatchDetected = false;
  let parserRecoveryAttempted = false;

  if (question?.evidence_type === "training") {
    if (/^hard(?:\s+effort)?$/.test(normalizedResponse)) {
      transcriptUpdate = "Workout effort was hard.";
      if (stableQueueTargetKey !== "training:session:effort") {
        mismatchDetected = topic !== "effort";
        resolvedTargetKeys.push("training:session:effort");
      }
    } else if (/^moderate$/.test(normalizedResponse)) {
      transcriptUpdate = "Workout effort was moderate.";
      if (stableQueueTargetKey !== "training:session:effort") {
        resolvedTargetKeys.push("training:session:effort");
      }
    } else if (/^easy$/.test(normalizedResponse)) {
      transcriptUpdate = "Workout effort was easy.";
      if (stableQueueTargetKey !== "training:session:effort") {
        resolvedTargetKeys.push("training:session:effort");
      }
    } else if (/bodyweight only/.test(normalizedResponse)) {
      transcriptUpdate = "Workout loads were bodyweight only.";
    } else if (/review details/.test(normalizedResponse)) {
      parserRecoveryAttempted = true;
    } else if (/no details/.test(normalizedResponse)) {
      transcriptUpdate = null;
      if (stableQueueTargetKey) resolvedTargetKeys.push(stableQueueTargetKey);
    }
  } else if (question?.evidence_type === "nutrition") {
    if (/^(breakfast|lunch|dinner|snack)$/.test(normalizedResponse)) {
      transcriptUpdate = `Meal was ${normalizedResponse}.`;
      resolvedTargetKeys.push("nutrition:meal:timing");
    } else if (/meal only/.test(normalizedResponse)) {
      transcriptUpdate = null;
      if (stableQueueTargetKey) resolvedTargetKeys.push(stableQueueTargetKey);
    } else if (/^(small|normal|large)$/.test(normalizedResponse)) {
      transcriptUpdate = `Meal portion was ${normalizedResponse}.`;
      resolvedTargetKeys.push("nutrition:meal:portion");
    }
  } else if (question?.evidence_type === "health_symptom") {
    if (/^(mild|moderate|severe)$/.test(normalizedResponse)) {
      transcriptUpdate = `Symptom severity was ${normalizedResponse}.`;
      mismatchDetected = topic !== "severity";
      resolvedTargetKeys.push("health_symptom:symptom:severity");
      if (topic === "duration" && hasSymptomTodayContext(transcript)) {
        resolvedTargetKeys.push("health_symptom:symptom:duration");
      }
    } else if (/^(shoulder|back|knee)$/.test(normalizedResponse)) {
      transcriptUpdate = `Symptom location was ${normalizedResponse}.`;
      resolvedTargetKeys.push("health_symptom:symptom:body_location");
    } else if (isUnknownResponse(normalizedResponse)) {
      transcriptUpdate = "Symptom trigger is unknown.";
      resolvedTargetKeys.push("health_symptom:symptom:trigger_context");
    }
  } else if (question?.evidence_type === "mixed") {
    if (stableQueueTargetKey) resolvedTargetKeys.push(stableQueueTargetKey);
  }

  if (resolvedTargetKeys.length === 0 && stableQueueTargetKey) {
    resolvedTargetKeys.push(stableQueueTargetKey);
  }

  return {
    mismatchDetected,
    parserRecoveryAttempted,
    parserRecoverySucceeded: parserRecoveryAttempted && hasExerciseLikeTranscript(transcript),
    quickResponseResolutionApplied: true,
    resolvedTargetKeys: [...new Set(resolvedTargetKeys)],
    stableQueueTargetKey,
    transcriptUpdate,
  };
}

function isUnknownResponse(value) {
  return /^(i\s+don'?t\s+know|not\s+sure|unsure|no\s+idea|i\s+don'?t\s+know\s+what\s+triggered\s+it)$/i.test(
    String(value ?? "").trim()
  );
}

function hasSymptomTodayContext(transcript = "") {
  return /\b(?:hurt|hurts|bothering|felt off|sore|pain|ache|aching)[^,.]*\btoday\b|\btoday[^,.]*(?:hurt|hurts|bothering|felt off|sore|pain|ache|aching)\b/i.test(
    String(transcript ?? "")
  );
}

function hasExerciseLikeTranscript(transcript = "") {
  return /\b\d+\s+sets?\b/i.test(transcript) &&
    /\b(curl|press|row|squat|deadlift|bench|extension|raise|raises|pulldown|pull-?up|leg|abduction|thrust)\b/i.test(
      transcript
    );
}

function getResolvedClarificationId(question) {
  return question?.queueTargetKey ??
    question?.originalClarificationId ??
    question?.id ??
    null;
}

function getResolvedClarificationIds(question) {
  return [
    question?.id,
    question?.originalClarificationId,
    getQuestionQueueTargetKey(question),
  ].filter(Boolean);
}

function getQuestionQueueTargetKey(question) {
  if (!question) return null;
  if (question.queueTargetKey) return question.queueTargetKey;

  const topic = question.topic ?? inferClarificationTopicFromId(question);

  if (question.evidence_type === "training") return `training:session:${topic}`;
  if (question.evidence_type === "nutrition") return `nutrition:meal:${topic}`;
  if (question.evidence_type === "health_symptom") return `health_symptom:symptom:${topic}`;
  if (question.evidence_type === "morning_weight") return `morning_weight:entry:${topic}`;

  return [question.evidence_type ?? "evidence", "evidence", topic].join(":");
}

function inferClarificationTopicFromId(question = {}) {
  const id = String(question.originalClarificationId ?? question.id ?? "");

  if (/exercises/i.test(id)) return "exercises";
  if (/sets_reps/i.test(id)) return "sets_reps";
  if (/meal_contents|foods/i.test(id)) return "foods";
  if (/portion/i.test(id)) return "portion";
  if (/severity/i.test(id)) return "severity";
  if (/duration/i.test(id)) return "duration";
  if (/distance/i.test(id)) return "distance";
  if (/calories/i.test(id)) return "calories";
  if (/heart_rate/i.test(id)) return "heart_rate";
  if (/pace/i.test(id)) return "pace";
  if (/effort/i.test(id)) return "effort";

  return id.split("_").at(-1) || "details";
}

function createExpansionTurn({
  endedInteraction = false,
  nextQuestion,
  response,
  resolution = null,
  resolvedClarificationIds = [],
  source,
  transcriptAfter,
  transcriptBefore,
}) {
  return {
    endedInteraction,
    prompt: nextQuestion?.question ?? null,
    promptId: nextQuestion?.id ?? null,
    promptType: nextQuestion?.isNarrativeExpansion
      ? "narrative_expansion"
      : "clarification",
    response,
    resolution,
    resolvedClarificationIds,
    stableQueueTargetKey: getQuestionQueueTargetKey(nextQuestion),
    source,
    targetEvidenceObjectId: nextQuestion?.targetEvidenceObjectId ?? null,
    timestamp: new Date().toISOString(),
    transcriptAfter,
    transcriptBefore,
  };
}

const intakeMethods = [
  {
    id: "upload",
    icon: Upload,
    label: "Upload",
  },
  {
    id: "type",
    icon: Keyboard,
    label: "Type",
  },
  {
    id: "voice",
    icon: Mic,
    label: "Speak",
  },
];

function EvidenceFormFields({ evidenceType, inputMethod }) {
  if (evidenceType === "auto") {
    return (
      <div className="space-y-3">
        <FileField
          accept="image/*,application/pdf"
          label="Evidence upload"
          name="anythingUpload"
        />
        <TextAreaField
          helper="Add anything that helps PhysiqueOS understand this evidence. Include workout details, nutrition context, notes, or anything not visible in the uploaded evidence."
          label="Additional Evidence"
          name="evidenceNote"
          placeholder="Add context, details, or anything not visible in the upload."
        />
        <TextField label="Evidence date" name="measuredAt" type="date" />
      </div>
    );
  }

  if (inputMethod === "type" || inputMethod === "voice") {
    return (
      <div className="space-y-3">
        <TextAreaField
          label={inputMethod === "voice" ? "Voice transcript" : "Typed evidence"}
          name="evidenceNote"
          placeholder={getTextPlaceholder(evidenceType, inputMethod)}
        />
        {evidenceType === "weight" && (
          <TextField label="Optional weight value" name="weight" placeholder="167.5" type="number" />
        )}
        <TextField label="Evidence date" name="measuredAt" type="date" />
      </div>
    );
  }

  if (evidenceType === "photos") {
    return (
      <div className="space-y-3">
        <FileField label="Current progress photos" name="photos" />
        <FileField label="Optional previous comparison photos" name="previousPhotos" />
        <div className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
          <p className="text-xs font-extrabold text-[var(--text-primary)]">
            Optional same-morning weight
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
            Use this when the morning workflow includes both a weigh-in and photos.
          </p>
          <div className="mt-3 grid gap-3">
            <TextField label="Morning weight" name="sameMorningWeight" placeholder="166.0" type="number" />
            <TextField label="Weight date" name="sameMorningWeightDate" type="date" />
          </div>
        </div>
        <details className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
          <summary className="cursor-pointer text-xs font-extrabold text-[var(--text-primary)]">
            Optional date overrides
          </summary>
          <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
            PhysiqueOS will use filename dates when available, then upload date.
          </p>
          <div className="mt-3 grid gap-3">
            <TextField label="Current capture date" name="captureDate" type="date" />
            <TextField label="Previous capture date" name="previousCaptureDate" type="date" />
          </div>
        </details>
      </div>
    );
  }

  if (evidenceType === "weight") {
    return (
      <div className="grid gap-3">
        <FileField accept="image/*" label="Scale screenshot or photo" name="evidenceUpload" />
        <TextField label="Morning weight" name="weight" placeholder="166.0" type="number" />
        <TextField label="Measured date" name="measuredAt" type="date" />
      </div>
    );
  }

  if (evidenceType === "dexa") {
    return (
      <div className="grid gap-3">
        <FileField accept="application/pdf" label="DEXA PDFs" name="dexaPdf" />
        <TextField label="Measured date" name="measuredAt" type="date" />
        <TextField label="Body fat %" name="bodyFatPercentage" placeholder="10.7" type="number" />
        <TextField label="Total mass" name="totalMass" placeholder="171.7" type="number" />
        <TextField label="Lean mass" name="leanMass" placeholder="146.2" type="number" />
        <TextField label="Fat mass" name="fatMass" placeholder="18.4" type="number" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FileField
        accept="image/*,application/pdf"
        label={`${getEvidenceLabel(evidenceType)} upload`}
        name="evidenceUpload"
      />
      <TextAreaField
        helper="Add anything that helps PhysiqueOS understand this evidence. Include workout details, nutrition context, notes, or anything not visible in the uploaded evidence."
        label="Additional Evidence"
        name="evidenceNote"
        placeholder={`Add context, details, or anything not visible in this ${getEvidenceLabel(evidenceType).toLowerCase()} evidence.`}
      />
      <TextField label="Evidence date" name="measuredAt" type="date" />
    </div>
  );
}

function getTextPlaceholder(evidenceType, inputMethod) {
  const lead =
    inputMethod === "voice"
      ? "Paste the simulated voice transcript."
      : "Type the evidence exactly as the user might provide it.";

  return `${lead} The interpreter should extract structured ${getEvidenceLabel(
    evidenceType
  ).toLowerCase()} evidence from it.`;
}

function getEvidenceLabel(evidenceType) {
  return evidenceType === "auto" ? "Evidence" : "Evidence";
}

function FileField({ accept = "image/*", label, multiple = true, name }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        accept={accept}
        className="block min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] px-3 py-3 text-sm font-bold text-[var(--text-primary)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--surface-elevated)] file:px-3 file:py-2 file:text-xs file:font-extrabold file:text-[var(--primary)]"
        multiple={multiple}
        name={name}
        type="file"
      />
    </label>
  );
}

function TextField({ defaultValue, label, name, placeholder, type = "text" }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm font-extrabold text-[var(--text-primary)] outline-none"
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        step={type === "number" ? "0.1" : undefined}
        type={type}
      />
    </label>
  );
}

function TextAreaField({ helper, label, name, onChange, placeholder, value }) {
  const controlledProps =
    value !== undefined
      ? {
          value,
          onChange: (event) => onChange?.(event.target.value),
        }
      : {};

  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </span>
      {helper && (
        <span className="mb-2 block text-xs font-semibold leading-5 text-[var(--text-secondary)]">
          {helper}
        </span>
      )}
      <textarea
        className="min-h-28 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] px-3 py-3 text-sm font-bold leading-6 text-[var(--text-primary)] outline-none"
        name={name}
        placeholder={placeholder}
        {...controlledProps}
      />
    </label>
  );
}

function PipelinePreview({ preview }) {
  const evidenceObjects =
    preview?.evidenceEngine?.evidenceObjects ??
    preview?.interpreter?.structuredEvidenceJson?.evidence_objects ??
    preview?.evidencePackage?.evidence_objects ??
    preview?.evidenceObjects ??
    [];
  const evidenceSelections = evidenceObjects.map(
    (evidenceObject, index) => ({
      evidenceObject,
      key: getEvidenceSelectionKey(evidenceObject, index),
    })
  );
  const [selectedEvidenceKey, setSelectedEvidenceKey] = useState(null);
  const effectiveSelectedEvidenceKey = evidenceSelections.some(
    (item) => item.key === selectedEvidenceKey
  )
    ? selectedEvidenceKey
    : evidenceSelections[0]?.key ?? null;
  const selectedEvidence =
    evidenceSelections.find((item) => item.key === effectiveSelectedEvidenceKey)
      ?.evidenceObject ??
    evidenceSelections[0]?.evidenceObject ??
    null;

  if (!preview) {
    return (
      <Card className="border-dashed border-[var(--divider)]">
        <p className="text-sm font-semibold text-[var(--text-muted)]">
          Pipeline preview unavailable for this run.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <PreviewGroupTitle
        subtitle="Raw intelligence pipeline output for validating how evidence moves through each engine."
        title="Engine View"
      />
      <PipelineStageCard defaultOpen title="Interpreter Output">
        <InterpreterPreview interpreter={preview.interpreter} />
      </PipelineStageCard>
      <PipelineStageCard title="Evidence Engine Preview">
        <EvidenceEnginePreview evidenceEngine={preview.evidenceEngine} />
      </PipelineStageCard>
      <PipelineStageCard title="Goal Engine Preview">
        <GoalEnginePreview goalEngine={preview.goalEngine} />
      </PipelineStageCard>
      <PipelineStageCard title="Briefing Preview">
        <BriefingEnginePreview briefing={preview.briefing} />
      </PipelineStageCard>
      <PipelineStageCard title="Coaching Preview">
        <CoachingEnginePreview coaching={preview.coaching} />
      </PipelineStageCard>

      <PreviewGroupTitle
        subtitle="How the processed evidence would start to appear inside the actual PhysiqueOS app."
        title="Application View"
      />
      <PipelineStageCard defaultOpen title="Evidence Page Preview">
        <EvidencePagePreview
          evidenceSelections={evidenceSelections}
          onSelectEvidence={setSelectedEvidenceKey}
          selectedEvidenceKey={effectiveSelectedEvidenceKey}
        />
      </PipelineStageCard>
      <PipelineStageCard defaultOpen title="Evidence Detail Preview">
        <EvidenceDetailPreview evidenceObject={selectedEvidence} />
      </PipelineStageCard>
      <PipelineStageCard title="Goals Page Preview">
        <GoalsPageApplicationPreview
          evidenceObjects={evidenceObjects}
          goalEngine={preview.goalEngine}
        />
      </PipelineStageCard>
      <PipelineStageCard title="Daily Briefing Preview">
        <DailyBriefingApplicationPreview
          briefing={preview.briefing}
          evidenceObjects={evidenceObjects}
        />
      </PipelineStageCard>
      <PipelineStageCard title="Coaching Preview">
        <CoachingApplicationPreview coaching={preview.coaching} />
      </PipelineStageCard>
    </div>
  );
}

function PreviewGroupTitle({ subtitle, title }) {
  return (
    <div className="pt-2">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">
        {title}
      </p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
        {subtitle}
      </p>
    </div>
  );
}

function EvidencePagePreview({
  evidenceSelections = [],
  onSelectEvidence,
  selectedEvidenceKey,
}) {
  const groups = groupEvidenceObjectsForAppSelections(evidenceSelections);

  return (
    <div className="space-y-4">
      {groups.length === 0 && <EmptyPipelineRow />}
      {groups.map((group) => (
        <section
          className="overflow-hidden rounded-[20px] border border-[var(--divider)] bg-[var(--surface)]"
          key={`${group.type}-${group.date}`}
        >
          <div className="border-b border-[var(--divider)] bg-[var(--surface-muted)] px-4 py-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              {group.type}
            </p>
            <p className="mt-1 text-base font-black text-[var(--text-primary)]">
              {group.date}
            </p>
          </div>
          <div className="divide-y divide-[var(--divider)]">
            {group.items.map(({ evidenceObject, key }, index) => {
              const isSelected = selectedEvidenceKey === key;

              return (
                <button
                  className={`w-full p-4 text-left transition ${
                    isSelected
                      ? "bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface-elevated))]"
                      : "bg-[var(--surface)] hover:bg-[var(--surface-muted)]"
                  }`}
                  key={key}
                  onClick={() => onSelectEvidence(key)}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        isSelected ? "bg-[var(--primary)]" : "bg-[var(--text-muted)]"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-[var(--text-primary)]">
                        {formatEvidenceObjectTitle(evidenceObject)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                        {getAppEvidenceRecordTime(evidenceObject)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {getEvidencePageMetrics(evidenceObject).map((metric, index) => (
                          <span
                            className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-extrabold text-[var(--text-primary)]"
                            key={`${evidenceObject.id}-page-${metric}-${index}`}
                          >
                            {metric}
                          </span>
                        ))}
                      </div>
                      <NutritionMealsSummary evidenceObject={evidenceObject} />
                      <StrengthExercisesSummary evidenceObject={evidenceObject} />
                    </div>
                    <span className="text-xs font-extrabold text-[var(--primary)]">
                      View
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function EvidenceDetailPreview({ evidenceObject }) {
  if (!evidenceObject) {
    return <EmptyPipelineRow />;
  }

  const detailRows = getEvidenceDetailRows(evidenceObject);
  const strengthHierarchy = getStrengthTrainingHierarchy(evidenceObject);
  const nutritionMeals = getNutritionMeals(evidenceObject);
  const visibleNutrients = getVisibleNutrients(evidenceObject);
  const sourceRefs = evidenceObject.provenance?.source_artifact_refs ?? [];

  return (
    <div className="space-y-3">
      <div className="rounded-[18px] bg-[var(--surface-muted)] p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Selected evidence
        </p>
        <p className="mt-1 text-lg font-black text-[var(--text-primary)]">
          {formatEvidenceObjectTitle(evidenceObject)}
        </p>
        <p className="mt-1 text-sm font-bold leading-5 text-[var(--text-secondary)]">
          {formatEvidenceObjectSubtitle(evidenceObject)}
        </p>
      </div>

      <div className="grid gap-2">
        {detailRows.map((row, index) => (
          <div
            className="flex items-start justify-between gap-3 rounded-[14px] bg-[var(--surface-muted)] p-3"
            key={`${getEvidenceRenderKey({ evidenceObject, prefix: "detail" })}-${row.label}-${index}`}
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {row.label}
            </p>
            <p className="max-w-[58%] text-right text-sm font-extrabold leading-5 text-[var(--text-primary)]">
              {row.value}
            </p>
          </div>
        ))}
      </div>

      {strengthHierarchy?.exercises?.length > 0 && (
        <StrengthExercisesDetail hierarchy={strengthHierarchy} />
      )}

      {nutritionMeals.length > 0 && (
        <NutritionMealsDetail meals={nutritionMeals} />
      )}

      {visibleNutrients.length > 0 && (
        <VisibleNutrientsDetail nutrients={visibleNutrients} />
      )}

      {isDexaEvidenceObject(evidenceObject) && (
        <DexaScanDetail evidenceObject={evidenceObject} />
      )}

      <div className="rounded-[14px] bg-[var(--surface-muted)] p-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {isDexaEvidenceObject(evidenceObject)
            ? "Original PDF Reference"
            : "Original Screenshot Reference"}
        </p>
        <p className="mt-1 text-sm font-bold leading-5 text-[var(--text-primary)]">
          {sourceRefs.length > 0
            ? sourceRefs.join(", ")
            : isDexaEvidenceObject(evidenceObject)
              ? "No PDF reference available."
              : "No screenshot reference available."}
        </p>
      </div>
    </div>
  );
}

function GoalsPageApplicationPreview({ evidenceObjects = [], goalEngine = {} }) {
  const trainingSummary = createTrainingApplicationSummary(evidenceObjects);
  const activitySummary = createActivityDayApplicationSummary(evidenceObjects);
  const dexaSummary = createDexaApplicationSummary(evidenceObjects);

  return (
    <div className="space-y-3">
      <div className="rounded-[20px] border border-[var(--divider)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Primary goal
            </p>
            <h3 className="mt-1 text-lg font-black text-[var(--text-primary)]">
              Visible Abs at Rest
            </h3>
          </div>
          <span className="rounded-full bg-[color-mix(in_srgb,var(--chart-1)_14%,var(--surface-muted))] px-3 py-1 text-xs font-extrabold text-[var(--chart-1)]">
            On Track
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <GoalPreviewRow
            label="Today's evidence"
            value={
              dexaSummary.dexaCount > 0
                ? dexaSummary.goalEvidence
                : activitySummary.activityDayCount > 0
                ? activitySummary.goalEvidence
                : trainingSummary.goalEvidence
            }
          />
          <GoalPreviewRow
            label="Confidence"
            value={
              dexaSummary.dexaCount > 0
                ? "DEXA should materially increase confidence in body fat, lean mass, and visible-abs status."
                : goalEngine.confidenceChanges?.length
                ? "Training evidence was stored, but confidence should change only after it is compared against history."
                : "No meaningful change today."
            }
          />
          <GoalPreviewRow
            label="Trajectory"
            value={
              dexaSummary.dexaCount > 0
                ? "Recalibrate the trajectory from this scan before changing the plan."
                : "No adjustment required."
            }
          />
        </div>
      </div>

      <div className="rounded-[18px] bg-[var(--surface-muted)] p-4">
        <p className="text-sm font-extrabold text-[var(--text-primary)]">
          Preserve Lean Mass
        </p>
        <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
          {trainingSummary.strengthCompleted
            ? "Strength work was completed and stored as supporting evidence. By itself, this does not prove lean mass was preserved today."
            : dexaSummary.dexaCount > 0
              ? "DEXA directly updates lean-mass confidence and should become the body-composition anchor for future comparisons."
            : "No strength-specific update from this upload."}
        </p>
      </div>
    </div>
  );
}

function GoalPreviewRow({ label, value }) {
  return (
    <div className="rounded-[14px] bg-[var(--surface-muted)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold leading-5 text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function DailyBriefingApplicationPreview({ briefing = {}, evidenceObjects = [] }) {
  const trainingSummary = createTrainingApplicationSummary(evidenceObjects);
  const activitySummary = createActivityDayApplicationSummary(evidenceObjects);
  const dexaSummary = createDexaApplicationSummary(evidenceObjects);
  const isDexaUpload = dexaSummary.dexaCount > 0;
  const isActivityUpload = activitySummary.activityDayCount > 0;
  const isTrainingUpload = trainingSummary.trainingCount > 0;
  const headline = isDexaUpload
    ? "Today's DEXA gives the plan a stronger calibration point."
    : isActivityUpload
    ? "Excellent activity today."
    : isTrainingUpload
      ? "Today's training reinforces your current trajectory."
      : briefing.headline;
  const interpretation = isDexaUpload
    ? `${dexaSummary.summary} This is high-confidence body composition evidence, so it should materially update body-fat, lean-mass, and visible-abs confidence without overstating change beyond what the scan measured.`
    : isActivityUpload
    ? `${activitySummary.activitySentence} This summarizes the full day of movement without creating duplicate workouts or changing body-composition conclusions by itself.`
    : isTrainingUpload
      ? `${trainingSummary.trainingSentence} This supports execution of the current plan, but it does not by itself prove body-fat change, lean-mass preservation, or visual progress.`
      : normalizeListItems(briefing.statements)[0]?.label ?? briefing.headline;
  const keyTakeaways = isDexaUpload
    ? [
        `${dexaSummary.bodyFatPercentage}% body fat measured.`,
        `${dexaSummary.fatMass} lb fat mass and ${dexaSummary.leanMass} lb lean mass captured.`,
        "Regional composition, VAT, RMR, bone metrics, and muscle balance are available for deeper review.",
        "Historical comparison tables were not converted into duplicate scans.",
      ]
    : isActivityUpload
    ? [
        activitySummary.moveGoalExceeded ? "Move goal exceeded." : null,
        activitySummary.exerciseGoalCompleted ? "Exercise goal completed." : null,
        activitySummary.linkedTrainingSessionCount > 0
          ? `${activitySummary.linkedTrainingSessionCount} logged training session${
              activitySummary.linkedTrainingSessionCount === 1 ? "" : "s"
            } linked to the day.`
          : null,
        "No duplicate workouts created from the activity summary.",
      ].filter(Boolean)
    : isTrainingUpload
      ? [
          trainingSummary.strengthCompleted
          ? "Strength workout completed and stored with exercise detail."
          : null,
        trainingSummary.cardioCount > 0
          ? `${trainingSummary.cardioCount} cardio session${
              trainingSummary.cardioCount === 1 ? "" : "s"
            } stored for training history.`
          : null,
        "No course correction is needed from this evidence alone.",
      ].filter(Boolean)
    : normalizeListItems(briefing.statements).map((item) => item.label);

  return (
    <div className="space-y-3">
      <div className="rounded-[22px] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_14%,var(--surface-elevated)),var(--surface))] p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">
          Daily Briefing
        </p>
        <h3 className="mt-2 text-xl font-black leading-tight text-[var(--text-primary)]">
          {headline}
        </h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
          {isTrainingUpload
            ? "This is meaningful execution evidence, not a reason to rewrite the plan."
            : isDexaUpload
              ? "This is a calibration event for body composition, not a daily fluctuation."
            : isActivityUpload
              ? "This is a daily activity summary, not a workout log."
            : "Rendered preview of what the briefing would surface."}
        </p>
      </div>

      <BriefingPreviewSection title="Interpretation">{interpretation}</BriefingPreviewSection>

      <div className="rounded-[18px] bg-[var(--surface-muted)] p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Key Takeaways
        </p>
        <div className="mt-3 space-y-2">
          {keyTakeaways.map((takeaway, index) => (
            <p
              className="rounded-[12px] bg-[var(--surface-elevated)] px-3 py-2 text-sm font-bold leading-5 text-[var(--text-primary)]"
              key={`key-takeaway-${index}-${takeaway}`}
            >
              {takeaway}
            </p>
          ))}
        </div>
      </div>

      <BriefingPreviewSection title="Goal impact">
        {isTrainingUpload
          ? "This supports adherence to the current training plan. It should update training history and goal support, but not visual or body-composition claims."
          : isDexaUpload
            ? "This materially affects the body-fat goal, lean-mass goal, and visible-abs forecast because DEXA is high-confidence body-composition evidence."
          : isActivityUpload
            ? "This supports activity adherence for the day. It should not produce visual, fat-loss, or lean-mass claims without other evidence."
          : "No supported goal impact beyond the generated briefing preview."}
      </BriefingPreviewSection>

      <BriefingPreviewSection title="Coaching">
        {isTrainingUpload
          ? "No changes recommended. Continue following your current plan."
          : isDexaUpload
            ? "Use this scan to recalibrate the model, then decide whether the current protocol still fits the goal timeline."
          : isActivityUpload
            ? "No changes recommended. Keep using ActivityDay as day-level context alongside workouts."
          : briefing.generated
            ? "Use the engine output only where it changes today's decision."
            : "No coaching generated."}
      </BriefingPreviewSection>

      <BriefingPreviewSection title="Action items">
        {isTrainingUpload || isActivityUpload || isDexaUpload
          ? "No new action items."
          : "No action items generated."}
      </BriefingPreviewSection>
    </div>
  );
}

function BriefingPreviewSection({ children, title }) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-muted)] p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {title}
      </p>
      <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-primary)]">
        {children}
      </p>
    </div>
  );
}

function CoachingApplicationPreview({ coaching = {} }) {
  if (!coaching.generated) {
    return (
      <p className="rounded-[14px] bg-[var(--surface-muted)] p-3 text-sm font-bold leading-6 text-[var(--text-secondary)]">
        No coaching generated.
      </p>
    );
  }

  return (
    <div className="rounded-[18px] bg-[var(--surface-muted)] p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Coach
      </p>
      <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-primary)]">
        {coaching.text}
      </p>
      <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
        {coaching.reason}
      </p>
    </div>
  );
}

function StrengthExercisesSummary({ evidenceObject }) {
  const hierarchy = getStrengthTrainingHierarchy(evidenceObject);

  if (!hierarchy?.exercises?.length) return null;

  return (
    <div className="mt-2 space-y-2 border-t border-[var(--divider)] pt-3">
      {hierarchy.exercises.map((exercise) => (
        <div key={`${evidenceObject.id}-${exercise.exercise_id}`}>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            {exercise.name}
          </p>
          <div className="mt-1 space-y-0.5">
            {summarizeExerciseSets(exercise).map((summary, index) => (
              <p
                className="text-xs font-bold leading-5 text-[var(--text-secondary)]"
                key={`${exercise.exercise_id}-${summary}-${index}`}
              >
                {summary}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NutritionMealsSummary({ evidenceObject }) {
  const meals = getNutritionMeals(evidenceObject);

  if (meals.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 border-t border-[var(--divider)] pt-3">
      {meals.slice(0, 3).map((meal) => (
        <div key={`${evidenceObject.id}-${meal.id}`}>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            {meal.name}
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-[var(--text-secondary)]">
            {formatNutritionTotals(meal.totals).join(" · ") || `${meal.foods?.length ?? 0} food item${meal.foods?.length === 1 ? "" : "s"}`}
          </p>
        </div>
      ))}
      {meals.length > 3 && (
        <p className="text-xs font-extrabold text-[var(--primary)]">
          +{meals.length - 3} more meals
        </p>
      )}
    </div>
  );
}

function StrengthExercisesDetail({ hierarchy }) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Exercises
      </p>
      <div className="mt-3 space-y-3">
        {hierarchy.exercises.map((exercise) => (
          <div
            className="rounded-[14px] bg-[var(--surface-elevated)] p-3"
            key={exercise.exercise_id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-[var(--text-primary)]">
                  {exercise.name}
                </p>
              <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                Exercise ID: {exercise.exercise_id}
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                {[
                  exercise.body_region,
                  exercise.primary_muscle_groups?.length
                    ? `Primary: ${exercise.primary_muscle_groups.join(", ")}`
                    : null,
                  exercise.secondary_muscle_groups?.length
                    ? `Secondary: ${exercise.secondary_muscle_groups.join(", ")}`
                    : null,
                  exercise.movement_pattern,
                  exercise.equipment,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
              <p className="text-right text-xs font-extrabold text-[var(--primary)]">
                {getExerciseTotalVolume(exercise)
                  ? `${getExerciseTotalVolume(exercise)} lb volume`
                  : "Volume pending"}
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {exercise.sets.map((set) => (
                <div
                  className="grid grid-cols-4 gap-2 rounded-[12px] bg-[var(--surface-muted)] p-2 text-xs font-bold text-[var(--text-primary)]"
                  key={`${exercise.exercise_id}-set-${set.set_number}`}
                >
                  <span>Set {set.set_number}</span>
                  <span>{set.reps} reps</span>
                  <span>{set.weight} {set.weight_unit}</span>
                  <span>{set.volume} vol</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
              Provenance: {exercise.provenance_ref}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function NutritionMealsDetail({ meals }) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Meals
      </p>
      <div className="mt-3 space-y-3">
        {meals.map((meal) => (
          <div
            className="rounded-[14px] bg-[var(--surface-elevated)] p-3"
            key={meal.id}
          >
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              {meal.name}
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-[var(--text-secondary)]">
              {formatNutritionTotals(meal.totals).join(" · ") || "Meal totals pending"}
            </p>
            {meal.foods?.length > 0 && (
              <div className="mt-3 space-y-2">
                {meal.foods.map((food) => (
                  <div
                    className="rounded-[12px] bg-[var(--surface-muted)] p-2"
                    key={food.id}
                  >
                    <p className="text-xs font-extrabold text-[var(--text-primary)]">
                      {food.canonical_name ?? food.name}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                      {[
                        food.brand,
                        food.serving_size,
                        Number.isFinite(Number(food.servings))
                          ? `${food.servings} serving${Number(food.servings) === 1 ? "" : "s"}`
                          : null,
                      ].filter(Boolean).join(" · ") || "Food details preserved for later review"}
                    </p>
                    {formatNutritionTotals(food.nutrients).length > 0 && (
                      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                        {formatNutritionTotals(food.nutrients).join(" · ")}
                      </p>
                    )}
                    {food.visible_nutrients?.length > 0 && (
                      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                        {food.visible_nutrients
                          .slice(0, 4)
                          .map(formatVisibleNutrient)
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
              Provenance: {meal.provenance_ref}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisibleNutrientsDetail({ nutrients }) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Visible Nutrients
      </p>
      <div className="mt-3 space-y-2">
        {nutrients.map((nutrient, index) => (
          <div
            className="rounded-[12px] bg-[var(--surface-elevated)] p-2"
            key={`${nutrient.name}-${index}`}
          >
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              {nutrient.name}
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
              {formatVisibleNutrient(nutrient)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DexaScanDetail({ evidenceObject }) {
  const regionalEntries = Object.entries(evidenceObject.regionalAssessment ?? {})
    .filter(([, region]) => region)
    .filter(([name]) => name !== "total");
  const balanceEntries = Object.entries(evidenceObject.muscleBalance ?? {}).filter(
    ([, region]) => region
  );

  return (
    <div className="space-y-3">
      <div className="rounded-[18px] bg-[var(--surface-muted)] p-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Regional Composition
        </p>
        <div className="mt-3 space-y-2">
          {regionalEntries.map(([name, region]) => (
            <DexaRegionCard key={name} name={name} region={region} />
          ))}
        </div>
      </div>

      <div className="rounded-[18px] bg-[var(--surface-muted)] p-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Muscle Balance
        </p>
        <div className="mt-3 space-y-2">
          {balanceEntries.map(([name, region]) => (
            <DexaRegionCard key={name} name={formatEvidenceType(name)} region={region} />
          ))}
        </div>
      </div>

      <div className="rounded-[18px] bg-[var(--surface-muted)] p-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Supplemental Metrics
        </p>
        <div className="mt-3 grid gap-2">
          {[
            evidenceObject.restingMetabolicRate?.value != null
              ? `RMR: ${evidenceObject.restingMetabolicRate.value} ${evidenceObject.restingMetabolicRate.unit ?? "kcal/day"}`
              : null,
            formatMassField(evidenceObject.visceralAdiposeTissue?.mass, "VAT Mass"),
            evidenceObject.visceralAdiposeTissue?.volume?.value != null
              ? `${evidenceObject.visceralAdiposeTissue.volume.value} ${evidenceObject.visceralAdiposeTissue.volume.unit ?? "in3"} VAT Volume`
              : null,
            evidenceObject.androidFatPercentage != null
              ? `${evidenceObject.androidFatPercentage}% Android Fat`
              : null,
            evidenceObject.gynoidFatPercentage != null
              ? `${evidenceObject.gynoidFatPercentage}% Gynoid Fat`
              : null,
            evidenceObject.androidGynoidRatio != null
              ? `${evidenceObject.androidGynoidRatio} Android/Gynoid Ratio`
              : null,
            evidenceObject.boneDensity?.totalBMD != null
              ? `${evidenceObject.boneDensity.totalBMD} Total BMD`
              : null,
            evidenceObject.boneDensity?.zScore != null
              ? `${evidenceObject.boneDensity.zScore} Z-score`
              : null,
          ]
            .filter(Boolean)
            .map((metric, index) => (
              <p
                className="rounded-[12px] bg-[var(--surface-elevated)] px-3 py-2 text-sm font-bold leading-5 text-[var(--text-primary)]"
                key={`dexa-supplemental-metric-${index}-${metric}`}
              >
                {metric}
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}

function DexaRegionCard({ name, region }) {
  return (
    <div className="rounded-[14px] bg-[var(--surface-elevated)] p-3">
      <p className="text-sm font-extrabold text-[var(--text-primary)]">
        {formatEvidenceType(name)}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
        {[
          region.bodyFatPercentage != null ? `${region.bodyFatPercentage}% fat` : null,
          formatMassField(region.totalMass, "total"),
          formatMassField(region.fatMass, "fat"),
          formatMassField(region.leanMass, "lean"),
          formatMassField(region.boneMineralContent, "BMC"),
        ]
          .filter(Boolean)
          .join(" - ")}
      </p>
    </div>
  );
}

function AppPreviewList({ items = [], title }) {
  const normalizedItems = normalizeListItems(items);

  return (
    <div>
      <PipelineSectionTitle>{title}</PipelineSectionTitle>
      <div className="mt-2 space-y-2">
        {normalizedItems.length === 0 && <EmptyPipelineRow />}
        {normalizedItems.map((item, index) => (
          <div
            className="rounded-[14px] bg-[var(--surface-muted)] p-3"
            key={`${title}-${item.label}-${item.detail}-${index}`}
          >
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              {item.label}
            </p>
            {item.detail && (
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                {item.detail}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineStageCard({ children, defaultOpen = false, title }) {
  return (
    <details
      className="rounded-[22px] border border-[var(--divider)] bg-[var(--surface)] p-4"
      open={defaultOpen}
    >
      <summary className="cursor-pointer text-base font-extrabold text-[var(--text-primary)]">
        {title}
      </summary>
      <div className="mt-4 space-y-3">{children}</div>
    </details>
  );
}

function InterpreterPreview({ interpreter }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <KeyValue label="Evidence type" value={interpreter.detectedEvidenceType} />
        <KeyValue
          label="Source app"
          value={interpreter.detectedSourceApplication ?? "Unknown"}
        />
        <KeyValue label="Extraction" value={interpreter.extractionConfidence} />
        <KeyValue label="Interpreter" value={interpreter.interpreterConfidence} />
      </div>
      <PipelineDiagnostics diagnostics={interpreter.diagnostics} />
      <JsonBlock label="Structured Evidence JSON" value={interpreter.structuredEvidenceJson} />
      <JsonBlock label="Raw extraction" value={interpreter.rawExtraction} />
      <JsonBlock label="Provenance" value={interpreter.provenance} />
    </>
  );
}

function PipelineDiagnostics({ diagnostics }) {
  if (!diagnostics?.stages?.length) return null;

  return (
    <div className="rounded-[16px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Pipeline diagnostics
      </p>
      <div className="mt-3 space-y-3">
        {diagnostics.stages.map((stage, index) => {
          const stageKey = getDiagnosticStageKey(stage, index);

          return (
            <div
              className="rounded-[14px] bg-[var(--surface-elevated)] p-3"
              key={stageKey}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-extrabold text-[var(--text-primary)]">
                  {stage.label}
                </p>
                <p className="shrink-0 text-xs font-extrabold text-[var(--primary)]">
                  {formatPipelineStageCount(stage)}
                </p>
              </div>
              <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                {stage.evidenceObjectCount} evidence object
                {stage.evidenceObjectCount === 1 ? "" : "s"}
              </p>
              {stage.nutritionDayCount !== undefined && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-[var(--text-secondary)]">
                  <span>{stage.mealCount ?? 0} meals</span>
                  <span>{stage.foodCount ?? 0} foods</span>
                  <span>{stage.nutrientCount ?? 0} nutrients</span>
                  <span>{stage.completeness ?? "unknown"}</span>
                </div>
              )}
              {stage.activityDayCount !== undefined && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-[var(--text-secondary)]">
                  <span>
                    {stage.activityDayDetected ? "ActivityDay detected" : "No ActivityDay"}
                  </span>
                  <span>{stage.moveCalories ?? 0} Move Calories</span>
                  <span>{stage.workoutActiveCalories ?? 0} Workout Active Calories</span>
                  <span>
                    {stage.estimatedNonWorkoutActiveCalories ?? 0} Non-Workout Active Calories
                  </span>
                  <span>{stage.linkedTrainingSessionCount ?? 0} Linked Training Sessions</span>
                </div>
              )}
              {stage.canonicalObjectCounts && (
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-[12px] bg-[color-mix(in_srgb,var(--surface-muted)_76%,transparent)] p-2 text-[11px] font-bold text-[var(--text-muted)]">
                  <span>ActivityDay Count: {stage.canonicalObjectCounts.activity_day ?? 0}</span>
                  <span>
                    TrainingSession Count: {stage.canonicalObjectCounts.training ?? 0}
                  </span>
                  <span>NutritionDay Count: {stage.canonicalObjectCounts.nutrition ?? 0}</span>
                  <span>DEXAScan Count: {stage.canonicalObjectCounts.dexa_scan ?? 0}</span>
                  <span>LabPanel Count: {stage.canonicalObjectCounts.lab_panel ?? 0}</span>
                  <span>
                    RecoveryDay Count: {stage.canonicalObjectCounts.recovery_day ?? 0}
                  </span>
                  <span>PhotoSession Count: {stage.canonicalObjectCounts.photo_session ?? 0}</span>
                </div>
              )}
              {stage.sourceArtifactRefs?.length > 0 && (
                <p className="mt-2 text-[11px] font-semibold leading-5 text-[var(--text-muted)]">
                  Sources: {stage.sourceArtifactRefs.join(", ")}
                </p>
              )}
              {stage.trainingSessions?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {stage.trainingSessions.map((session, sessionIndex) => (
                    <p
                      className="text-xs font-bold leading-5 text-[var(--text-secondary)]"
                      key={`${stageKey}-${session.id ?? sessionIndex}`}
                    >
                      {formatTrainingDiagnosticSession(session)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {diagnostics.warnings?.length > 0 && (
        <div className="mt-3 rounded-[14px] bg-[color-mix(in_srgb,var(--chart-3)_14%,var(--surface-muted))] p-3">
          {diagnostics.warnings.map((warning, index) => (
            <p
              className="text-xs font-bold leading-5 text-[var(--chart-3)]"
              key={`diagnostic-warning-${index}-${warning}`}
            >
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function getDiagnosticStageKey(stage, index) {
  return stage.id ?? `${stage.label ?? "diagnostic-stage"}-${index}`;
}

function formatPipelineStageCount(stage) {
  if (stage.canonicalObjectCounts) {
    const counts = stage.canonicalObjectCounts;
    const parts = [
      counts.activity_day ? `${counts.activity_day} ActivityDay` : null,
      counts.training ? `${counts.training} TrainingSession` : null,
      counts.nutrition ? `${counts.nutrition} NutritionDay` : null,
      counts.dexa_scan ? `${counts.dexa_scan} DEXAScan` : null,
      counts.lab_panel ? `${counts.lab_panel} LabPanel` : null,
      counts.recovery_day ? `${counts.recovery_day} RecoveryDay` : null,
      counts.photo_session ? `${counts.photo_session} PhotoSession` : null,
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(", ");
  }

  if (stage.activityDayCount !== undefined) {
    return `${stage.activityDayCount} ActivityDay`;
  }

  if (stage.nutritionDayCount !== undefined) {
    return `${stage.nutritionDayCount} NutritionDay`;
  }

  return `${stage.trainingSessionCount ?? 0} training`;
}

function formatTrainingDiagnosticSession(session) {
  return [
    session.title,
    session.activeCalories ? `${session.activeCalories} Active Calories` : null,
    session.distance ? `${session.distance} distance` : null,
    session.exerciseCount ? `${session.exerciseCount} exercises` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

function EvidenceEnginePreview({ evidenceEngine }) {
  const evidenceObjects = evidenceEngine.evidenceObjects ?? [];
  const evidenceObjectMap = createEvidenceObjectMap(evidenceObjects);

  return (
    <>
      <EvidenceTimelineList
        evidenceObjectMap={evidenceObjectMap}
        items={evidenceEngine.timelineEntries}
        title="Timeline entries"
      />
      <EvidenceObjectCards
        evidenceObjects={evidenceObjects}
        title="Evidence objects that would be stored"
      />
      <EvidenceDecisionList
        evidenceObjectMap={evidenceObjectMap}
        title="Reconciliation results"
        items={evidenceEngine.reconciliationResults}
      />
      <EvidenceDecisionList
        evidenceObjectMap={evidenceObjectMap}
        title="Storage decisions"
        items={evidenceEngine.storageDecisions}
      />
      <HistoricalTrackingList
        evidenceObjectMap={evidenceObjectMap}
        title="Historical tracking preview"
        items={evidenceEngine.historicalTrackingPreview}
      />
      <JsonBlock label="Analytics metadata" value={evidenceEngine.analyticsMetadata} />
    </>
  );
}

function EvidenceTimelineList({ evidenceObjectMap, items = [], title }) {
  return (
    <div className="mt-4">
      <PipelineSectionTitle>{title}</PipelineSectionTitle>
      <div className="mt-2 space-y-2">
        {items.length === 0 && <EmptyPipelineRow />}
        {items.map((item, index) => {
          const evidenceObject = evidenceObjectMap.get(item.evidenceObjectId);

          return (
            <div
              className="rounded-[14px] bg-[var(--surface-muted)] p-3"
              key={getEvidenceRenderKey({
                evidenceObject,
                fallbackItem: item,
                index,
                prefix: "timeline",
              })}
            >
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                {evidenceObject
                  ? formatEvidenceObjectTitle(evidenceObject)
                  : item.title ?? "Evidence record"}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                {evidenceObject
                  ? formatEvidenceObjectSubtitle(evidenceObject)
                  : item.occurredAt ?? "Timeline-ready evidence"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceObjectCards({ evidenceObjects = [], title }) {
  return (
    <div className="mt-4">
      <PipelineSectionTitle>{title}</PipelineSectionTitle>
      <div className="mt-2 space-y-3">
        {evidenceObjects.length === 0 && <EmptyPipelineRow />}
        {evidenceObjects.map((evidenceObject, index) => (
          <EvidenceObjectCard
            evidenceObject={evidenceObject}
            key={getEvidenceRenderKey({
              evidenceObject,
              index,
              prefix: "evidence-object",
            })}
          />
        ))}
      </div>
    </div>
  );
}

function EvidenceObjectCard({ evidenceObject }) {
  const metrics = getEvidenceObjectMetrics(evidenceObject);

  return (
    <div className="rounded-[16px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            {formatEvidenceObjectTitle(evidenceObject)}
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-[var(--text-secondary)]">
            {formatEvidenceObjectSubtitle(evidenceObject)}
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {formatEvidenceType(evidenceObject.evidence_type)}
        </span>
      </div>
      {metrics.length > 0 && (
        <div className="mt-3 grid gap-2">
          {metrics.map((metric, index) => (
            <p
              className="rounded-[12px] bg-[var(--surface-elevated)] px-3 py-2 text-sm font-bold leading-5 text-[var(--text-primary)]"
              key={`${evidenceObject.id}-${metric}-${index}`}
            >
              {metric}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceDecisionList({ evidenceObjectMap, items = [], title }) {
  return (
    <div className="mt-4">
      <PipelineSectionTitle>{title}</PipelineSectionTitle>
      <div className="mt-2 space-y-2">
        {items.length === 0 && <EmptyPipelineRow />}
        {items.map((item, index) => {
          const evidenceObject = evidenceObjectMap.get(item.evidenceObjectId);
          const label = evidenceObject
            ? formatEvidenceObjectDecisionLabel(evidenceObject)
            : item.label ?? item.title ?? item.evidenceObjectId ?? "Evidence record";

          return (
            <div
              className="rounded-[14px] bg-[var(--surface-muted)] p-3"
              key={getEvidenceRenderKey({
                evidenceObject,
                fallbackItem: item,
                index,
                prefix: title,
              })}
            >
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                {label}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                {formatEvidenceDecision(item, evidenceObject)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoricalTrackingList({ evidenceObjectMap, items = [], title }) {
  return (
    <div className="mt-4">
      <PipelineSectionTitle>{title}</PipelineSectionTitle>
      <div className="mt-2 space-y-2">
        {items.length === 0 && <EmptyPipelineRow />}
        {items.map((item, index) => {
          const evidenceObject =
            evidenceObjectMap.get(item.evidenceObjectId) ??
            findEvidenceObjectForRecordKey(evidenceObjectMap, item.recordKey);

          return (
            <div
              className="rounded-[14px] bg-[var(--surface-muted)] p-3"
              key={getEvidenceRenderKey({
                evidenceObject,
                fallbackItem: item,
                index,
                prefix: "history",
              })}
            >
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                {evidenceObject
                  ? formatEvidenceObjectTitle(evidenceObject)
                  : formatStreamLabel(item.stream)}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                Stored in {formatStreamLabel(item.stream)}
                {item.trendFields?.length
                  ? ` with ${item.trendFields.length} trend-ready values.`
                  : "."}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineSectionTitle({ children }) {
  return (
    <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function EmptyPipelineRow() {
  return (
    <p className="rounded-[14px] bg-[var(--surface-muted)] p-3 text-sm font-semibold text-[var(--text-muted)]">
      None.
    </p>
  );
}

function GoalEnginePreview({ goalEngine }) {
  return (
    <>
      {goalEngine.noMeaningfulImpact && (
        <p className="rounded-[14px] bg-[var(--surface-muted)] p-3 text-sm font-bold leading-6 text-[var(--text-secondary)]">
          No meaningful goal impact detected.
        </p>
      )}
      <SectionList title="Affected goals" items={goalEngine.affectedGoals} />
      <SectionList title="Confidence changes" items={goalEngine.confidenceChanges} />
      <SectionList title="Trajectory changes" items={goalEngine.trajectoryChanges} />
      <SectionList title="Prediction changes" items={goalEngine.predictionChanges} />
      <SectionList title="Why" items={goalEngine.reasons} />
    </>
  );
}

function BriefingEnginePreview({ briefing }) {
  return (
    <>
      <KeyValue label="Generated" value={briefing.generated ? "Yes" : "No"} />
      <p className="rounded-[14px] bg-[var(--surface-muted)] p-3 text-sm font-bold leading-6 text-[var(--text-primary)]">
        {briefing.headline}
      </p>
      <SectionList title="Statements" items={briefing.statements} />
      <SectionList title="Unsupported claims omitted" items={briefing.omittedClaims} />
      <SectionList title="Provenance" items={briefing.provenanceRefs} />
    </>
  );
}

function CoachingEnginePreview({ coaching }) {
  return (
    <>
      <KeyValue label="Generated" value={coaching.generated ? "Yes" : "No"} />
      <p className="rounded-[14px] bg-[var(--surface-muted)] p-3 text-sm font-bold leading-6 text-[var(--text-primary)]">
        {coaching.text}
      </p>
      <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">
        {coaching.reason}
      </p>
      <SectionList title="Provenance" items={coaching.provenanceRefs} />
    </>
  );
}

function createEvidenceObjectMap(evidenceObjects = []) {
  return new Map(evidenceObjects.map((object) => [object.id, object]));
}

function getEvidenceSelectionKey(evidenceObject, index) {
  return getEvidenceRenderKey({
    evidenceObject,
    index,
    prefix: "app-record",
  });
}

function getEvidenceRenderKey({
  evidenceObject = null,
  fallbackItem = null,
  index = 0,
  prefix = "evidence",
}) {
  const evidenceId = evidenceObject?.id ?? fallbackItem?.evidenceObjectId ?? fallbackItem?.id;
  if (evidenceId) return `${prefix}-${evidenceId}`;

  const recordKey = evidenceObject?.recordKey ?? fallbackItem?.recordKey;
  if (recordKey) return `${prefix}-${recordKey}-${index}`;

  const provenanceRefs =
    evidenceObject?.provenance?.source_artifact_refs ??
    evidenceObject?.source?.source_artifact_refs ??
    fallbackItem?.provenanceRefs ??
    fallbackItem?.provenance?.source_artifact_refs ??
    [];
  if (provenanceRefs.length > 0) {
    return `${prefix}-${provenanceRefs.join("-")}-${index}`;
  }

  const evidenceType =
    evidenceObject?.evidence_type ??
    fallbackItem?.evidence_type ??
    fallbackItem?.type ??
    fallbackItem?.stream ??
    "evidence";
  const observedAt =
    evidenceObject?.observed_at ??
    evidenceObject?.captured_at ??
    fallbackItem?.observed_at ??
    fallbackItem?.occurredAt ??
    "";
  const activityType = evidenceObject
    ? formatEvidenceObjectTitle(evidenceObject)
    : fallbackItem?.title ?? fallbackItem?.label ?? fallbackItem?.decision ?? "record";

  return `${prefix}-${evidenceType}-${observedAt}-${activityType}-${index}`;
}

function groupEvidenceObjectsForAppSelections(evidenceSelections = []) {
  const groupMap = new Map();

  evidenceSelections.forEach(({ evidenceObject, key }) => {
    const date = getEvidenceDate(evidenceObject) || "Undated";
    const groupKey = date;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        date,
        items: [],
        type: "Evidence",
      });
    }

    groupMap.get(groupKey).items.push({ evidenceObject, key });
  });

  return [...groupMap.values()].map((group) => ({
    ...group,
    items: [...group.items].sort(compareEvidencePageItems),
  }));
}

function compareEvidencePageItems(first, second) {
  const rank = {
    activity_day: 0,
    nutrition: 1,
    training: 2,
    activity: 2,
    dexa_scan: 3,
    dexa: 3,
    body_composition: 3,
  };

  const firstRank = rank[first.evidenceObject?.evidence_type] ?? 9;
  const secondRank = rank[second.evidenceObject?.evidence_type] ?? 9;
  if (firstRank !== secondRank) return firstRank - secondRank;

  return formatEvidenceObjectTitle(first.evidenceObject).localeCompare(
    formatEvidenceObjectTitle(second.evidenceObject)
  );
}

function formatEvidenceObjectTitle(evidenceObject) {
  if (isDexaEvidenceObject(evidenceObject)) {
    const date = getEvidenceDate(evidenceObject);
    return date ? `DEXAScan (${date})` : "DEXAScan";
  }

  if (evidenceObject.evidence_type === "activity_day") {
    const date = getEvidenceDate(evidenceObject);
    return date ? `Activity Summary (${date})` : "Activity Summary";
  }

  if (evidenceObject.evidence_type === "nutrition") {
    const date = getEvidenceDate(evidenceObject);
    return date ? `Nutrition Day (${date})` : "Nutrition Day";
  }

  const metadataTitle = cleanDisplayText(evidenceObject.metadata?.activity_type);
  const genericType = formatEvidenceType(evidenceObject.evidence_type);

  if (metadataTitle && metadataTitle.toLowerCase() !== genericType.toLowerCase()) {
    return metadataTitle;
  }

  const titleField = findEvidenceTitleValue(evidenceObject);
  const title = cleanDisplayText(titleField?.value);

  if (title && title.toLowerCase() !== genericType.toLowerCase()) {
    return title;
  }

  return title ?? cleanDisplayText(titleField?.label) ?? genericType;
}

function formatEvidenceObjectSubtitle(evidenceObject) {
  if (evidenceObject.evidence_type === "training") {
    const exerciseCount = evidenceObject.exercises?.length ?? 0;
    const confidence =
      evidenceObject.confidence?.interpretation ??
      evidenceObject.confidence?.extraction ??
      "moderate";
    const activityType =
      evidenceObject.metadata?.activity_type === "Traditional Strength Training"
        ? "Strength Workout"
        : cleanDisplayText(evidenceObject.metadata?.activity_type) ?? "Training Session";

    return [
      activityType,
      exerciseCount > 0
        ? `${exerciseCount} detected exercise${exerciseCount === 1 ? "" : "s"}`
        : null,
      `Confidence ${formatEvidenceLabel(confidence)}`,
    ]
      .filter(Boolean)
      .join(" - ");
  }

  const date = getEvidenceDate(evidenceObject);
  const timeRange = getEvidenceTimeRange(evidenceObject);

  return [date, timeRange].filter(Boolean).join(" - ") || "Ready for timeline storage";
}

function formatEvidenceLabel(value) {
  const text = cleanDisplayText(value);
  if (!text) return "Unknown";

  return text
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getAppEvidenceRecordTime(evidenceObject) {
  if (isDexaEvidenceObject(evidenceObject)) {
    return [
      evidenceObject.provider,
      evidenceObject.bodyFatPercentage != null
        ? `${evidenceObject.bodyFatPercentage}% body fat`
        : null,
    ]
      .filter(Boolean)
      .join(" - ") || "Body composition scan";
  }

  if (evidenceObject.evidence_type === "activity_day") {
    const linkedSessions =
      evidenceObject.references?.training_session_ids?.length ??
      evidenceObject.derived_metrics?.training_sessions_referenced;

    return linkedSessions
      ? `Daily activity summary - ${linkedSessions} TrainingSessions referenced`
      : "Daily activity summary";
  }

  const duration = cleanDisplayText(
    findEvidenceValue(evidenceObject, ["duration", "elapsed time"])?.value
  );
  const timeRange = getEvidenceTimeRange(evidenceObject);

  return duration || timeRange || "Tap to inspect extracted evidence";
}

function formatEvidenceObjectDecisionLabel(evidenceObject) {
  const title = formatEvidenceObjectTitle(evidenceObject);
  const startTime = cleanDisplayText(
    findEvidenceValue(evidenceObject, ["start time", "started at"])?.value
  );
  const activeCalories = findEvidenceValue(evidenceObject, [
    "active calories",
    "active energy",
  ]);

  if (startTime) return `${title} (${startTime})`;
  if (activeCalories?.value) return `${title} (${activeCalories.value} cal)`;

  return title;
}

function formatEvidenceDecision(item, evidenceObject) {
  if (!evidenceObject) return item.reason ?? item.decision ?? "Ready for storage.";

  if (item.decision === "store_new") {
    return `Stored as a new ${formatEvidenceRecordNoun(evidenceObject)}.`;
  }

  if (item.replace) return `Would replace the existing ${formatEvidenceRecordNoun(evidenceObject)}.`;
  if (item.merge) return `Would merge into the existing ${formatEvidenceRecordNoun(evidenceObject)}.`;
  if (item.duplicate) return `Would be flagged as a possible duplicate ${formatEvidenceRecordNoun(evidenceObject)}.`;

  return item.reason ?? `Stored as a ${formatEvidenceRecordNoun(evidenceObject)}.`;
}

function formatEvidenceRecordNoun(evidenceObject) {
  const evidenceType = evidenceObject.evidence_type;

  if (evidenceType === "activity_day") return "activity day";
  if (["training", "activity"].includes(evidenceType)) return "training session";
  if (["nutrition", "hydration"].includes(evidenceType)) return "nutrition record";
  if (["recovery", "sleep"].includes(evidenceType)) return "recovery record";
  if (evidenceType === "weight") return "weight entry";
  if (["body_composition", "dexa", "dexa_scan"].includes(evidenceType)) {
    return "DEXA scan";
  }
  if (evidenceType === "labs") return "lab record";

  return "evidence record";
}

function createTrainingApplicationSummary(evidenceObjects = []) {
  const trainingObjects = evidenceObjects.filter((object) =>
    ["training", "activity"].includes(object.evidence_type)
  );
  const strengthObjects = trainingObjects.filter((object) =>
    /strength|resistance|lifting|weights/i.test(formatEvidenceObjectTitle(object))
  );
  const cardioObjects = trainingObjects.filter(
    (object) => !strengthObjects.includes(object)
  );
  const strengthCompleted = strengthObjects.length > 0;
  const cardioCount = cardioObjects.length;
  const trainingCount = trainingObjects.length;
  const totalActiveCalories = trainingObjects.reduce(
    (total, object) => total + (Number(object.metadata?.active_calories) || 0),
    0
  );
  const parts = [
    strengthCompleted ? "one strength training session" : null,
    cardioCount > 0
      ? `${cardioCount} cardio session${cardioCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  const trainingSentence =
    parts.length > 0
      ? `You completed ${parts.join(" together with ")}${
          totalActiveCalories > 0 ? ` totaling ${totalActiveCalories} active calories` : ""
        }.`
      : "No training sessions were detected in this upload.";

  return {
    cardioCount,
    goalEvidence:
      trainingCount > 0
        ? [
            strengthCompleted ? "Strength workout completed" : null,
            cardioCount > 0 ? "Cardio completed" : null,
          ]
            .filter(Boolean)
            .join(" and ")
        : "No goal-relevant evidence detected.",
    strengthCompleted,
    totalActiveCalories,
    trainingCount,
    trainingSentence,
  };
}

function createActivityDayApplicationSummary(evidenceObjects = []) {
  const activityDayObjects = evidenceObjects.filter(
    (object) => object.evidence_type === "activity_day"
  );
  const latestActivityDay = activityDayObjects[activityDayObjects.length - 1];
  const activity = latestActivityDay?.daily_activity ?? {};
  const derived = latestActivityDay?.derived_metrics ?? {};
  const moveGoalExceeded =
    Number.isFinite(Number(activity.move_calories)) &&
    Number.isFinite(Number(activity.move_goal)) &&
    Number(activity.move_calories) >= Number(activity.move_goal);
  const exerciseGoalCompleted =
    Number.isFinite(Number(activity.exercise_minutes)) &&
    Number.isFinite(Number(activity.exercise_goal)) &&
    Number(activity.exercise_minutes) >= Number(activity.exercise_goal);
  const linkedTrainingSessionCount =
    latestActivityDay?.references?.training_session_ids?.length ??
    derived.training_sessions_referenced ??
    0;
  const activitySentence =
    activityDayObjects.length > 0
      ? [
          activity.move_calories != null
            ? `${activity.move_calories} Move Calories`
            : "Daily activity summary captured",
          activity.exercise_minutes != null
            ? `${activity.exercise_minutes} Exercise Minutes`
            : null,
          activity.stand_hours != null ? `${activity.stand_hours} Stand Hours` : null,
          derived.workout_active_calories != null
            ? `${derived.workout_active_calories} active calories came from logged workouts`
            : null,
          derived.non_workout_active_calories != null
            ? `${derived.non_workout_active_calories} estimated active calories came from non-workout movement`
            : null,
        ]
          .filter(Boolean)
          .join(". ")
      : "No ActivityDay summary was detected.";

  return {
    activityDayCount: activityDayObjects.length,
    activitySentence,
    exerciseGoalCompleted,
    goalEvidence:
      activityDayObjects.length > 0
        ? [
            moveGoalExceeded ? "Move goal exceeded" : "Move activity captured",
            exerciseGoalCompleted ? "Exercise goal completed" : null,
            linkedTrainingSessionCount > 0
              ? `${linkedTrainingSessionCount} TrainingSessions linked`
              : null,
          ]
            .filter(Boolean)
            .join(" and ")
        : "No activity-day evidence detected.",
    linkedTrainingSessionCount,
    moveGoalExceeded,
  };
}

function createDexaApplicationSummary(evidenceObjects = []) {
  const dexaObjects = evidenceObjects.filter(isDexaEvidenceObject);
  const latestDexa = dexaObjects[dexaObjects.length - 1];

  if (!latestDexa) {
    return {
      dexaCount: 0,
      goalEvidence: "No DEXA evidence detected.",
      summary: "No DEXA calibration from this upload.",
    };
  }

  return {
    bodyFatPercentage: latestDexa.bodyFatPercentage,
    dexaCount: dexaObjects.length,
    fatMass: latestDexa.fatMass?.value,
    goalEvidence: `${latestDexa.bodyFatPercentage}% body fat and ${latestDexa.leanMass?.value} lb lean mass measured by DEXA`,
    leanMass: latestDexa.leanMass?.value,
    provider: latestDexa.provider,
    summary: `${latestDexa.provider ?? "DEXA"} measured ${latestDexa.bodyFatPercentage}% body fat, ${latestDexa.fatMass?.value} lb fat mass, and ${latestDexa.leanMass?.value} lb lean mass.`,
  };
}

function getTrainingMetadataMetrics(evidenceObject) {
  const metadata = evidenceObject.metadata;
  if (!metadata || !["training", "activity"].includes(evidenceObject.evidence_type)) {
    return [];
  }

  return [
    formatDistanceMetadata(metadata),
    formatMetadataMetricValue(metadata.active_calories, "Active Calories"),
    formatMetadataMetricValue(metadata.total_calories, "Total Calories"),
    formatMetadataMetricValue(metadata.average_heart_rate, "bpm average HR"),
    metadata.average_pace,
    metadata.effort_level ? `Effort: ${metadata.effort_level}` : null,
    formatDurationSeconds(metadata.duration_seconds),
  ].filter(Boolean);
}

function getNutritionMetrics(evidenceObject) {
  if (evidenceObject.evidence_type !== "nutrition") return [];

  return formatNutritionTotals(evidenceObject.daily_totals);
}

function getActivityDayMetrics(evidenceObject) {
  if (evidenceObject.evidence_type !== "activity_day") return [];

  const activity = evidenceObject.daily_activity ?? {};
  const derived = evidenceObject.derived_metrics ?? {};

  return [
    formatNutritionNumber(activity.move_calories, "Move Calories"),
    activity.move_goal != null ? `${activity.move_goal} Move Goal` : null,
    formatNutritionNumber(activity.exercise_minutes, "Exercise Minutes"),
    activity.exercise_goal != null ? `${activity.exercise_goal} Exercise Goal` : null,
    formatNutritionNumber(activity.stand_hours, "Stand Hours"),
    activity.stand_goal != null ? `${activity.stand_goal} Stand Goal` : null,
    formatNutritionNumber(activity.total_calories_burned, "Total Calories Burned"),
    formatNutritionNumber(derived.workout_active_calories, "Workout Active Calories"),
    formatNutritionNumber(
      derived.non_workout_active_calories,
      "Estimated Non-Workout Active Calories"
    ),
  ].filter(Boolean);
}

function isDexaEvidenceObject(evidenceObject = {}) {
  return (
    ["dexa", "dexa_scan", "body_composition"].includes(evidenceObject.evidence_type) ||
    Boolean(evidenceObject.provider && evidenceObject.bodyFatPercentage !== undefined)
  );
}

function getDexaMetrics(evidenceObject) {
  if (!isDexaEvidenceObject(evidenceObject)) return [];

  return [
    evidenceObject.bodyFatPercentage != null
      ? `${evidenceObject.bodyFatPercentage}% Body Fat`
      : null,
    formatMassField(evidenceObject.totalMass, "Total Mass"),
    formatMassField(evidenceObject.leanMass, "Lean Mass"),
    formatMassField(evidenceObject.fatMass, "Fat Mass"),
    formatMassField(evidenceObject.boneMineralContent, "Bone Mineral Content"),
    evidenceObject.restingMetabolicRate?.value != null
      ? `${evidenceObject.restingMetabolicRate.value} kcal/day RMR`
      : null,
    evidenceObject.visceralAdiposeTissue?.mass?.value != null
      ? `${evidenceObject.visceralAdiposeTissue.mass.value} lb VAT`
      : null,
  ].filter(Boolean);
}

function formatMassField(field, label) {
  if (field?.value === null || field?.value === undefined) return null;

  return `${field.value} ${field.unit ?? "lb"} ${label}`;
}

function formatNutritionTotals(totals = {}) {
  return [
    formatNutritionNumber(totals.calories, "calories"),
    formatNutritionNumber(totals.protein_g, "g protein"),
    formatNutritionNumber(totals.carbs_g, "g carbs"),
    formatNutritionNumber(totals.fat_g, "g fat"),
    formatNutritionNumber(totals.fiber_g, "g fiber"),
    formatNutritionNumber(totals.sugar_g, "g sugar"),
    formatNutritionNumber(totals.sodium_mg, "mg sodium"),
  ].filter(Boolean);
}

function formatNutritionNumber(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isFinite(Number(value))) return null;

  return `${Number(value).toLocaleString("en-US")}${label ? ` ${label}` : ""}`;
}

function formatMacroPercentage(macro = {}) {
  const values = [
    formatNutritionNumber(macro.grams, "g"),
    macro.percent_of_calories != null ? `${macro.percent_of_calories}% calories` : null,
    macro.goal_percent != null ? `${macro.goal_percent}% goal` : null,
  ].filter(Boolean);

  return values.length > 0 ? values.join(" · ") : null;
}

function formatGoalStatus(status = {}) {
  const values = [
    status.actual != null ? `actual ${formatNutritionNumber(status.actual, status.unit ?? "")}` : null,
    status.goal != null ? `goal ${formatNutritionNumber(status.goal, status.unit ?? "")}` : null,
    status.difference != null
      ? `${Number(status.difference) > 0 ? "+" : ""}${formatNutritionNumber(status.difference, status.unit ?? "")}`
      : null,
  ].filter(Boolean);

  return values.length > 0 ? values.join(" · ") : null;
}

function getNutritionMeals(evidenceObject) {
  return Array.isArray(evidenceObject.meals) ? evidenceObject.meals : [];
}

function getVisibleNutrients(evidenceObject) {
  return Array.isArray(evidenceObject.nutrients) ? evidenceObject.nutrients : [];
}

function formatVisibleNutrient(nutrient = {}) {
  return [
    formatNutritionNumber(nutrient.total, nutrient.unit ?? ""),
    nutrient.goal != null ? `goal ${formatNutritionNumber(nutrient.goal, nutrient.unit ?? "")}` : null,
    nutrient.remaining != null
      ? `${formatNutritionNumber(nutrient.remaining, nutrient.unit ?? "")} remaining`
      : null,
    nutrient.percent_daily_value != null ? `${nutrient.percent_daily_value}% DV` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatMetadataMetricValue(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (label.startsWith("bpm")) return `${value} ${label}`;
  return `${value} ${label}`;
}

function formatDistanceMetadata(metadata = {}) {
  if (metadata.distance === null || metadata.distance === undefined) return null;

  return [metadata.distance, metadata.distance_unit].filter(Boolean).join(" ");
}

function formatDurationSeconds(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return null;

  const totalSeconds = Number(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = Math.round(totalSeconds % 60);

  if (minutes <= 0) return `${remainingSeconds}s`;
  if (remainingSeconds === 0) return `${minutes} min`;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getEvidenceObjectMetrics(evidenceObject) {
  const dexaMetrics = getDexaMetrics(evidenceObject);
  if (dexaMetrics.length > 0) return dexaMetrics;

  const activityDayMetrics = getActivityDayMetrics(evidenceObject);
  if (activityDayMetrics.length > 0) return activityDayMetrics;

  const nutritionMetrics = getNutritionMetrics(evidenceObject);
  if (nutritionMetrics.length > 0) return nutritionMetrics;

  const metadataMetrics = getTrainingMetadataMetrics(evidenceObject);
  if (metadataMetrics.length > 0) return metadataMetrics;

  const metricPatterns = [
    ["distance"],
    ["active calories", "active calorie", "active energy", "active kcal"],
    ["total calories", "total calorie", "total energy", "total kcal"],
    ["average heart rate", "avg heart rate", "average hr", "avg hr"],
    ["pace", "average pace"],
    ["effort", "perceived effort"],
    ["duration"],
    ["calories"],
    ["protein"],
    ["carbohydrates", "carbs"],
    ["fat"],
    ["steps"],
    ["sleep"],
    ["weight"],
  ];
  const usedNames = new Set();
  const metrics = [];

  metricPatterns.forEach((patterns) => {
    const field = findEvidenceValue(evidenceObject, patterns, usedNames);
    const formatted = formatEvidenceValue(field);

    if (field && formatted) {
      usedNames.add(normalizeEvidenceKey(field));
      metrics.push(formatted);
    }
  });

  if (metrics.length > 0) return metrics;

  return (evidenceObject.values ?? [])
    .filter((field) => !isMetadataEvidenceValue(field))
    .slice(0, 6)
    .map(formatEvidenceValue)
    .filter(Boolean);
}

function getEvidencePageMetrics(evidenceObject) {
  const dexaMetrics = getDexaMetrics(evidenceObject);
  if (dexaMetrics.length > 0) return dexaMetrics.slice(0, 6);

  const activityDayMetrics = getActivityDayMetrics(evidenceObject);
  if (activityDayMetrics.length > 0) return activityDayMetrics.slice(0, 6);

  const nutritionMetrics = getNutritionMetrics(evidenceObject);
  if (nutritionMetrics.length > 0) return nutritionMetrics.slice(0, 6);

  const metadataMetrics = getTrainingMetadataMetrics(evidenceObject);
  if (metadataMetrics.length > 0) return metadataMetrics.slice(0, 6);

  const preferredPatterns = [
    ["distance"],
    ["active calories", "active calorie", "active energy", "active kcal"],
    ["total calories", "total calorie", "total energy", "total kcal"],
    ["average heart rate", "avg heart rate", "average hr", "avg hr"],
    ["pace", "average pace"],
    ["effort", "perceived effort"],
  ];
  const usedNames = new Set();
  const metrics = [];

  preferredPatterns.forEach((patterns) => {
    const field = findEvidenceValue(evidenceObject, patterns, usedNames);
    const formatted = formatEvidenceValue(field);

    if (field && formatted) {
      usedNames.add(normalizeEvidenceKey(field));
      metrics.push(formatted);
    }
  });

  return metrics.length > 0 ? metrics : getEvidenceObjectMetrics(evidenceObject).slice(0, 4);
}

function getEvidenceDetailRows(evidenceObject) {
  const rows = [];
  const pushRow = (label, value) => {
    const displayValue = cleanDisplayText(value);

    if (displayValue) {
      rows.push({
        label,
        value: displayValue,
      });
    }
  };

  pushRow("Date", getEvidenceDate(evidenceObject));
  pushRow("Activity", evidenceObject.metadata?.activity_type);
  if (isDexaEvidenceObject(evidenceObject)) {
    pushRow("Provider", evidenceObject.provider);
    pushRow("Measured Date", evidenceObject.measuredAt);
    pushRow("Body Fat", evidenceObject.bodyFatPercentage != null ? `${evidenceObject.bodyFatPercentage}%` : null);
    pushRow("Total Mass", formatMassField(evidenceObject.totalMass, ""));
    pushRow("Fat Mass", formatMassField(evidenceObject.fatMass, ""));
    pushRow("Lean Mass", formatMassField(evidenceObject.leanMass, ""));
    pushRow("Bone Mineral Content", formatMassField(evidenceObject.boneMineralContent, ""));
    pushRow(
      "Resting Metabolic Rate",
      evidenceObject.restingMetabolicRate?.value != null
        ? `${evidenceObject.restingMetabolicRate.value} ${evidenceObject.restingMetabolicRate.unit ?? "kcal/day"}`
        : null
    );
    pushRow("VAT Mass", formatMassField(evidenceObject.visceralAdiposeTissue?.mass, ""));
    pushRow(
      "VAT Volume",
      evidenceObject.visceralAdiposeTissue?.volume?.value != null
        ? `${evidenceObject.visceralAdiposeTissue.volume.value} ${evidenceObject.visceralAdiposeTissue.volume.unit ?? "in3"}`
        : null
    );
    pushRow("Android Fat", evidenceObject.androidFatPercentage != null ? `${evidenceObject.androidFatPercentage}%` : null);
    pushRow("Gynoid Fat", evidenceObject.gynoidFatPercentage != null ? `${evidenceObject.gynoidFatPercentage}%` : null);
    pushRow("Android/Gynoid Ratio", evidenceObject.androidGynoidRatio);
    pushRow("Total BMD", evidenceObject.boneDensity?.totalBMD);
    pushRow("T-score", evidenceObject.boneDensity?.tScore);
    pushRow("Z-score", evidenceObject.boneDensity?.zScore);
  }
  if (evidenceObject.evidence_type === "activity_day") {
    const activity = evidenceObject.daily_activity ?? {};
    const derived = evidenceObject.derived_metrics ?? {};

    pushRow("Move Calories", formatNutritionNumber(activity.move_calories, "calories"));
    pushRow("Move Goal", formatNutritionNumber(activity.move_goal, "calories"));
    pushRow("Exercise Minutes", formatNutritionNumber(activity.exercise_minutes, "minutes"));
    pushRow("Exercise Goal", formatNutritionNumber(activity.exercise_goal, "minutes"));
    pushRow("Stand Hours", formatNutritionNumber(activity.stand_hours, "hours"));
    pushRow("Stand Goal", formatNutritionNumber(activity.stand_goal, "hours"));
    pushRow(
      "Total Calories Burned",
      formatNutritionNumber(activity.total_calories_burned, "calories")
    );
    pushRow(
      "Ring Completion",
      formatRingCompletion(activity.ring_completion)
    );
    pushRow(
      "Workout Active Calories",
      formatNutritionNumber(derived.workout_active_calories, "calories")
    );
    pushRow(
      "Estimated Non-Workout Active Calories",
      formatNutritionNumber(derived.non_workout_active_calories, "calories")
    );
    pushRow(
      "Training Sessions Referenced",
      derived.training_sessions_referenced
    );
    pushRow(
      "Referenced TrainingSessions",
      evidenceObject.references?.training_session_ids?.join(", ")
    );
  }
  if (evidenceObject.evidence_type === "nutrition") {
    pushRow("Calories", formatNutritionNumber(evidenceObject.daily_totals?.calories, "calories"));
    pushRow("Protein", formatNutritionNumber(evidenceObject.daily_totals?.protein_g, "g protein"));
    pushRow("Carbs", formatNutritionNumber(evidenceObject.daily_totals?.carbs_g, "g carbs"));
    pushRow("Fat", formatNutritionNumber(evidenceObject.daily_totals?.fat_g, "g fat"));
    pushRow("Fiber", formatNutritionNumber(evidenceObject.daily_totals?.fiber_g, "g fiber"));
    pushRow("Sugar", formatNutritionNumber(evidenceObject.daily_totals?.sugar_g, "g sugar"));
    pushRow("Sodium", formatNutritionNumber(evidenceObject.daily_totals?.sodium_mg, "mg sodium"));
    pushRow("Meals", getNutritionMeals(evidenceObject).length);
    pushRow("Protein Split", formatMacroPercentage(evidenceObject.macro_percentages?.protein));
    pushRow("Carb Split", formatMacroPercentage(evidenceObject.macro_percentages?.carbohydrates));
    pushRow("Fat Split", formatMacroPercentage(evidenceObject.macro_percentages?.fat));
    pushRow("Calorie Goal", formatGoalStatus(evidenceObject.goal_status?.calories));
    pushRow("Protein Goal", formatGoalStatus(evidenceObject.goal_status?.protein_g));
    pushRow("Carb Goal", formatGoalStatus(evidenceObject.goal_status?.carbs_g));
    pushRow("Fat Goal", formatGoalStatus(evidenceObject.goal_status?.fat_g));
    pushRow("Fiber Goal", formatGoalStatus(evidenceObject.goal_status?.fiber_g));
    pushRow("Sugar Goal", formatGoalStatus(evidenceObject.goal_status?.sugar_g));
    pushRow("Sodium Goal", formatGoalStatus(evidenceObject.goal_status?.sodium_mg));
    pushRow("Cholesterol Goal", formatGoalStatus(evidenceObject.goal_status?.cholesterol_mg));
  }
  pushRow("Active Calories", formatMetadataMetricValue(evidenceObject.metadata?.active_calories, "Active Calories"));
  pushRow("Total Calories", formatMetadataMetricValue(evidenceObject.metadata?.total_calories, "Total Calories"));
  pushRow("Duration", formatDurationSeconds(evidenceObject.metadata?.duration_seconds));
  pushRow("Distance", formatDistanceMetadata(evidenceObject.metadata));
  pushRow("Average Heart Rate", formatMetadataMetricValue(evidenceObject.metadata?.average_heart_rate, "bpm average HR"));
  pushRow("Average Pace", evidenceObject.metadata?.average_pace);
  pushRow("Effort", evidenceObject.metadata?.effort_level);
  pushRow("Location", evidenceObject.metadata?.location);
  pushRow(
    "Start Time",
    findEvidenceValue(evidenceObject, ["start time", "started at"])?.value
  );
  pushRow(
    "End Time",
    findEvidenceValue(evidenceObject, ["end time", "ended at"])?.value
  );

  (evidenceObject.values ?? []).forEach((field) => {
    const label = cleanDisplayText(field.label ?? field.name);
    const value = formatEvidenceValue(field);

    if (!label || !value) return;
    if (field.name === "strength_exercises") return;
    if (["date", "start time", "end time"].includes(label.toLowerCase())) return;

    pushRow(label, value.replace(`${label}: `, ""));
  });

  pushRow("Source", formatEvidenceSource(evidenceObject));
  pushRow("Extraction Confidence", evidenceObject.confidence?.extraction);
  pushRow("Interpreter Confidence", evidenceObject.confidence?.interpretation);

  return dedupeDetailRows(rows);
}

function formatRingCompletion(ringCompletion = {}) {
  const values = [
    ringCompletion.move != null ? `Move ${ringCompletion.move}%` : null,
    ringCompletion.exercise != null ? `Exercise ${ringCompletion.exercise}%` : null,
    ringCompletion.stand != null ? `Stand ${ringCompletion.stand}%` : null,
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : null;
}

function dedupeDetailRows(rows) {
  const seen = new Set();

  return rows.filter((row) => {
    const key = `${row.label}:${row.value}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getStrengthTrainingHierarchy(evidenceObject) {
  if (Array.isArray(evidenceObject.exercises) && evidenceObject.exercises.length > 0) {
    return {
      model: "strength_training_hierarchy_v1",
      exercises: evidenceObject.exercises.map((exercise) => ({
        ...exercise,
        exercise_id: exercise.exercise_id ?? exercise.id,
      })),
    };
  }

  const field = (evidenceObject.values ?? []).find(
    (value) => value.name === "strength_exercises"
  );

  if (!field?.value || typeof field.value !== "string") return null;

  try {
    const parsed = JSON.parse(field.value);

    if (parsed?.model !== "strength_training_hierarchy_v1") return null;
    if (!Array.isArray(parsed.exercises)) return null;

    return parsed;
  } catch {
    return null;
  }
}

function getExerciseTotalVolume(exercise) {
  return (exercise.sets ?? []).reduce(
    (total, set) => total + (Number(set.volume) || 0),
    0
  );
}

function summarizeExerciseSets(exercise) {
  const groups = new Map();

  (exercise.sets ?? []).forEach((set) => {
    const key = `${set.reps}-${set.weight}-${set.weight_unit}`;
    if (!groups.has(key)) {
      groups.set(key, {
        count: 0,
        reps: set.reps,
        weight: set.weight,
        unit: set.weight_unit,
      });
    }

    groups.get(key).count += 1;
  });

  return [...groups.values()].map(
    (group) => `${group.count} × ${group.reps} @ ${group.weight} ${group.unit}`
  );
}

function formatExerciseSetSummary(sets = []) {
  const groups = new Map();

  (sets ?? []).forEach((set) => {
    const key = `${set.reps}-${set.weight}-${set.weight_unit}`;
    if (!groups.has(key)) {
      groups.set(key, {
        count: 0,
        reps: set.reps,
        weight: set.weight,
        unit: set.weight_unit ?? "lb",
      });
    }

    groups.get(key).count += 1;
  });

  return [...groups.values()]
    .map((group) =>
      [
        `${group.count} x ${group.reps}`,
        group.weight != null ? `@ ${group.weight} ${group.unit}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" · ");
}

function formatEvidenceSource(evidenceObject) {
  const source = evidenceObject.source ?? {};

  return [
    source.application,
    source.integration,
    source.modality,
  ]
    .map(cleanDisplayText)
    .filter(Boolean)
    .join(" - ");
}

function findEvidenceTitleValue(evidenceObject) {
  const values = evidenceObject.values ?? [];
  const genericType = formatEvidenceType(evidenceObject.evidence_type).toLowerCase();
  const candidates = values
    .map((field) => ({
      field,
      score: scoreEvidenceTitleField(field, evidenceObject.evidence_type),
      value: cleanDisplayText(field.value),
    }))
    .filter((candidate) => candidate.score > 0 && candidate.value)
    .filter((candidate) => candidate.value.toLowerCase() !== genericType)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.field ?? null;
}

function scoreEvidenceTitleField(field, evidenceType) {
  const key = normalizeEvidenceKey(field);
  const value = cleanDisplayText(field.value);
  const valueLower = value?.toLowerCase() ?? "";

  if (!value || isMetadataEvidenceValue(field)) return 0;
  if (["training", "activity"].includes(evidenceType)) {
    if (key.includes("activity type")) return 100;
    if (key.includes("workout type")) return 98;
    if (key.includes("exercise type")) return 95;
    if (key.includes("activity name")) return 94;
    if (key.includes("workout name")) return 92;
    if (key === "type" || key.endsWith(" type")) return 88;
    if (key === "activity" || key.endsWith(" activity")) return 86;
    if (key === "workout" || key.endsWith(" workout")) return 84;
    if (key.includes("session type")) return 82;
  }

  if (key.includes("title")) return 70;
  if (key.includes("name")) return 65;

  if (
    ["outdoor walk", "traditional strength training", "stair stepper"].includes(
      valueLower
    )
  ) {
    return 60;
  }

  return 0;
}

function formatEvidenceValue(field) {
  if (!field) return "";

  const label = cleanDisplayText(field.label ?? field.name);
  const value = cleanDisplayText(field.value);
  const unit = cleanDisplayText(field.unit);
  const key = `${field.name ?? ""} ${field.label ?? ""}`.toLowerCase();

  if (!value) return "";
  if (key.includes("active") && (key.includes("calorie") || key.includes("energy") || key.includes("kcal"))) return `${value} Active Calories`;
  if (key.includes("total") && (key.includes("calorie") || key.includes("energy") || key.includes("kcal"))) return `${value} Total Calories`;
  if (key.includes("heart") || key.includes("hr")) return `${value}${unit ? ` ${unit}` : " bpm"} average HR`;
  if (key.includes("pace")) return `${value}${unit ? ` ${unit}` : ""}`;
  if (key.includes("effort")) return `Effort: ${value}${unit ? ` ${unit}` : ""}`;
  if (key.includes("distance")) return `${value}${unit ? ` ${unit}` : ""}`;

  return `${label}: ${value}${unit ? ` ${unit}` : ""}`;
}

function getEvidenceDate(evidenceObject) {
  const dateField = findEvidenceValue(evidenceObject, [
    "date",
    "workout date",
    "activity date",
    "session date",
  ]);
  const fieldValue = cleanDisplayText(dateField?.value);

  if (fieldValue) return fieldValue;

  return formatObservedDate(evidenceObject.observed_at ?? evidenceObject.captured_at);
}

function getEvidenceTimeRange(evidenceObject) {
  const startTime = cleanDisplayText(
    findEvidenceValue(evidenceObject, ["start time", "started at"])?.value
  );
  const endTime = cleanDisplayText(
    findEvidenceValue(evidenceObject, ["end time", "ended at"])?.value
  );

  if (startTime && endTime) return `${startTime} - ${endTime}`;
  return startTime ?? endTime ?? "";
}

function findEvidenceValue(evidenceObject, patterns, usedNames = new Set()) {
  return (evidenceObject.values ?? []).find((field) => {
    const key = normalizeEvidenceKey(field);

    return !usedNames.has(key) && patterns.some((pattern) => key.includes(pattern));
  });
}

function normalizeEvidenceKey(field) {
  return `${field?.name ?? ""} ${field?.label ?? ""}`
    .replace(/[_-]/g, " ")
    .toLowerCase()
    .trim();
}

function isMetadataEvidenceValue(field) {
  const key = normalizeEvidenceKey(field);

  return [
    "source",
    "source application",
    "confidence",
    "evidence type",
    "input method",
    "uploaded files",
    "summary",
    "note",
  ].some((term) => key.includes(term));
}

function cleanDisplayText(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(cleanDisplayText).filter(Boolean).join(", ");
  if (typeof value === "object") return null;

  return String(value).trim();
}

function formatObservedDate(value) {
  const text = cleanDisplayText(value);
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!isoMatch) return text;

  const [, year, month, day] = isoMatch;
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${monthNames[Number(month) - 1]} ${Number(day)}, ${year}`;
}

function formatEvidenceType(value) {
  const text = cleanDisplayText(value);
  if (!text) return "Evidence";

  return text
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStreamLabel(value) {
  return formatEvidenceType(value).replace(" History", " history");
}

function findEvidenceObjectForRecordKey(evidenceObjectMap, recordKey) {
  if (!recordKey) return null;

  return [...evidenceObjectMap.values()].find((object) =>
    String(recordKey).includes(object.evidence_type)
  );
}

function SectionList({ items, muted = false, title }) {
  const normalizedItems = normalizeListItems(items);

  return (
    <div className="mt-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {title}
      </p>
      <div className="mt-2 space-y-2">
        {normalizedItems.length === 0 && (
          <p className="rounded-[14px] bg-[var(--surface-muted)] p-3 text-sm font-semibold text-[var(--text-muted)]">
            None.
          </p>
        )}
        {normalizedItems.map((item, index) => (
          <div
            className="rounded-[14px] bg-[var(--surface-muted)] p-3"
            key={`${title}-${item.label}-${item.detail}-${index}`}
          >
            <p className={`text-sm font-extrabold ${muted ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
              {item.label}
            </p>
            {item.detail && (
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                {item.detail}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeListItems(items = []) {
  return items.map((item) => {
    if (typeof item === "string") {
      return {
        detail: "",
        label: item,
      };
    }

    return {
      detail:
        item.reason ??
        item.detail ??
        item.decision ??
        item.recordKey ??
        item.evidenceObjectId ??
        "",
      label:
        item.label ??
        item.title ??
        item.goal ??
        item.stream ??
        item.evidenceObjectId ??
        item.id ??
        "Item",
    };
  });
}

function JsonBlock({ label, value }) {
  const [copyLabel, setCopyLabel] = useState("Copy JSON");
  const jsonText = typeof value === "string" ? value : JSON.stringify(value, null, 2);

  async function copyJson(event) {
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(jsonText);
      setCopyLabel("Copied");
    } catch {
      setCopyLabel("Copy failed");
    }

    window.setTimeout(() => setCopyLabel("Copy JSON"), 1800);
  }

  return (
    <details className="rounded-[14px] bg-[var(--surface-muted)] p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        <span>{label}</span>
        {label === "Structured Evidence JSON" && (
          <button
            className="rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]"
            onClick={copyJson}
            type="button"
          >
            {copyLabel}
          </button>
        )}
      </summary>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[var(--surface-elevated)] p-3 text-[11px] font-semibold leading-5 text-[var(--text-secondary)]">
        {jsonText}
      </pre>
    </details>
  );
}

function LabCard({ children, icon, title }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <IconBadge color="primary" icon={icon} size="xs" />
        <h2 className="text-base font-extrabold text-[var(--text-primary)]">
          {title}
        </h2>
      </div>
      {children}
    </Card>
  );
}

function KeyValue({ label, value }) {
  return (
    <div className="rounded-[14px] bg-[var(--surface-muted)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold leading-5 text-[var(--text-primary)]">
        {value || "Pending"}
      </p>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="rounded-full bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface-elevated))] px-2.5 py-1 text-xs font-extrabold text-[var(--primary)]">
      {children}
    </span>
  );
}
