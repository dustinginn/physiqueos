"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Camera,
  FileJson,
  FlaskConical,
  Home,
  ImagePlus,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Upload,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

const today = new Date().toISOString().slice(0, 10);
const navItems = [
  ["Upload", "upload"],
  ["Comparison", "comparison"],
  ["Details", "details"],
  ["Explanation", "explanation"],
  ["Evidence", "evidence"],
  ["Protocols", "protocols"],
  ["Briefing", "briefing"],
  ["Home", "home-preview"],
];

export default function PhotoSimulatorScreen() {
  const [previewMode, setPreviewMode] = useState("mobile");
  const [currentFiles, setCurrentFiles] = useState([]);
  const [previousFiles, setPreviousFiles] = useState([]);
  const [currentPreviews, setCurrentPreviews] = useState([]);
  const [previousPreviews, setPreviousPreviews] = useState([]);
  const [captureDate, setCaptureDate] = useState(today);
  const [previousCaptureDate, setPreviousCaptureDate] = useState(today);
  const [currentView, setCurrentView] = useState("unknown");
  const [previousView, setPreviousView] = useState("unknown");
  const [currentPose, setCurrentPose] = useState("unknown");
  const [previousPose, setPreviousPose] = useState("unknown");
  const [goalContext, setGoalContext] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const interpretation = result?.interpretation;
  const status = useMemo(() => getInterpreterStatus(result, error), [error, result]);
  const isMobileMode = previewMode === "mobile";

  async function handleCurrentFiles(event) {
    const files = Array.from(event.target.files ?? []);
    const previews = await createPreviews(files);

    setCurrentFiles(files);
    setCurrentPreviews(previews);
    applyFirstPreviewMetadata(previews, {
      setDate: setCaptureDate,
      setPose: setCurrentPose,
      setView: setCurrentView,
    });
  }

  async function handlePreviousFiles(event) {
    const files = Array.from(event.target.files ?? []);
    const previews = await createPreviews(files);

    setPreviousFiles(files);
    setPreviousPreviews(previews);
    applyFirstPreviewMetadata(previews, {
      setDate: setPreviousCaptureDate,
      setPose: setPreviousPose,
      setView: setPreviousView,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (currentFiles.length === 0) {
      setError("Upload at least one current photo set.");
      return;
    }

    const formData = new FormData();

    currentFiles.forEach((file) => formData.append("currentPhotos", file));
    previousFiles.forEach((file) => formData.append("previousPhotos", file));
    formData.append("currentPhotoMetadata", JSON.stringify(currentPreviews.map(toPhotoMetadata)));
    formData.append("previousPhotoMetadata", JSON.stringify(previousPreviews.map(toPhotoMetadata)));
    formData.append("captureDate", captureDate);
    formData.append("previousCaptureDate", previousCaptureDate);
    formData.append("goalContext", goalContext);
    formData.append("currentView", currentView);
    formData.append("previousView", previousView);
    formData.append("currentPose", currentPose);
    formData.append("previousPose", previousPose);

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/photo-simulator", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error ?? "Photo simulation failed.");

      setResult(payload);
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset() {
    setCurrentFiles([]);
    setPreviousFiles([]);
    setCurrentPreviews([]);
    setPreviousPreviews([]);
    setResult(null);
    setError("");
  }

  const formProps = {
    captureDate,
    currentPose,
    currentPreviews,
    currentView,
    goalContext,
    handleCurrentFiles,
    handlePreviousFiles,
    handleSubmit,
    isSubmitting,
    previousCaptureDate,
    previousPose,
    previousPreviews,
    previousView,
    reset,
    setCaptureDate,
    setCurrentPose,
    setCurrentView,
    setGoalContext,
    setPreviousCaptureDate,
    setPreviousPose,
    setPreviousView,
    setCurrentPreviews,
    setPreviousPreviews,
  };
  const resultProps = {
    error,
    interpretation,
    result,
    status,
  };

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-slate-950">
      <div
        className={`mx-auto px-4 pb-16 pt-8 ${
          isMobileMode ? "max-w-[393px]" : "max-w-[1040px]"
        }`}
      >
        <Link
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href="/lab"
        >
          <ArrowLeft size={18} />
          Lab
        </Link>

        <header className="mb-5 space-y-3">
          <div className="flex items-center gap-3">
            <IconBadge icon={FlaskConical} color="warning" size="md" />
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-orange-600">
                Photo Upload Simulator
              </p>
              <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
                Test visual change detection without saving evidence.
              </h1>
            </div>
          </div>
          <div className="rounded-[16px] border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.08em] text-orange-700">
            SIMULATION ONLY - NOTHING SAVED TO FOUNDER PROFILE
          </div>
        </header>

        <ModeSwitch mode={previewMode} onChange={setPreviewMode} />
        {isMobileMode && <SimulatorNav />}

        {isMobileMode ? (
          <div className="space-y-4">
            <SimulatorForm {...formProps} />
            <MobileResults {...resultProps} isSubmitting={isSubmitting} />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <SimulatorForm {...formProps} />
            <DesktopResults {...resultProps} />
          </div>
        )}
      </div>
    </main>
  );
}

function ModeSwitch({ mode, onChange }) {
  return (
    <div className="sticky top-0 z-20 -mx-1 mb-3 bg-[color-mix(in_srgb,var(--app-bg)_92%,transparent)] px-1 py-2 backdrop-blur">
      <div className="grid grid-cols-2 gap-2 rounded-[18px] border border-[var(--divider)] bg-[var(--surface)] p-1 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
        {[
          ["desktop", "Desktop"],
          ["mobile", "Mobile"],
        ].map(([value, label]) => (
          <button
            className={`rounded-[14px] px-3 py-2 text-sm font-extrabold transition ${
              mode === value
                ? "bg-[var(--primary)] text-white shadow-[0_8px_18px_rgba(79,70,229,0.24)]"
                : "text-slate-500"
            }`}
            key={value}
            onClick={() => onChange(value)}
            type="button"
          >
            {value === "desktop" ? "🖥 Desktop" : "📱 Mobile"}
          </button>
        ))}
      </div>
    </div>
  );
}

function SimulatorNav() {
  return (
    <nav className="sticky top-[58px] z-20 -mx-4 mb-4 overflow-x-auto border-y border-[var(--divider)] bg-[color-mix(in_srgb,var(--app-bg)_94%,transparent)] px-4 py-2 backdrop-blur">
      <div className="flex gap-2">
        {navItems.map(([label, target]) => (
          <a
            className="shrink-0 rounded-full bg-[var(--surface)] px-3 py-2 text-xs font-extrabold text-slate-600 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
            href={`#${target}`}
            key={target}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function SimulatorForm({
  captureDate,
  currentPose,
  currentPreviews,
  currentView,
  goalContext,
  handleCurrentFiles,
  handlePreviousFiles,
  handleSubmit,
  isSubmitting,
  previousCaptureDate,
  previousPose,
  previousPreviews,
  previousView,
  reset,
  setCaptureDate,
  setCurrentPose,
  setCurrentView,
  setGoalContext,
  setPreviousCaptureDate,
  setPreviousPose,
  setPreviousView,
  setCurrentPreviews,
  setPreviousPreviews,
}) {
  return (
    <form className="space-y-4" id="upload" onSubmit={handleSubmit}>
      <Card className="space-y-4">
        <SectionHeader
          icon={Upload}
          title="Photo Upload"
          subtitle="Upload one current photo, or front / side / back together."
        />
        <input
          accept="image/*"
          className="block w-full rounded-[16px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-4 py-3 text-sm font-semibold text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#EEF2FF] file:px-3 file:py-2 file:text-sm file:font-bold file:text-[#4F46E5]"
          multiple
          onChange={handleCurrentFiles}
          type="file"
        />
        <FieldGrid>
          <DateInput label="Capture date" onChange={setCaptureDate} value={captureDate} />
          <Select label="View label" onChange={setCurrentView} value={currentView}>
            <option value="unknown">Auto-detect</option>
            <option value="front">Front</option>
            <option value="side">Side</option>
            <option value="back">Back / Rear</option>
          </Select>
          <Select label="Pose" onChange={setCurrentPose} value={currentPose}>
            <option value="unknown">Auto-detect</option>
            <option value="relaxed">Relaxed</option>
            <option value="flexed">Rear Flexed</option>
          </Select>
        </FieldGrid>
        <PhotoPreviewGrid
          onChange={setCurrentPreviews}
          previews={currentPreviews}
          title="Current preview"
        />
      </Card>

      <Card className="space-y-4">
        <SectionHeader
          icon={ImagePlus}
          title="Optional previous comparison"
          subtitle="Use matching views to test week-over-week visual change."
        />
        <input
          accept="image/*"
          className="block w-full rounded-[16px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-4 py-3 text-sm font-semibold text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#EEF2FF] file:px-3 file:py-2 file:text-sm file:font-bold file:text-[#4F46E5]"
          multiple
          onChange={handlePreviousFiles}
          type="file"
        />
        <FieldGrid>
          <DateInput
            label="Previous date"
            onChange={setPreviousCaptureDate}
            value={previousCaptureDate}
          />
          <Select label="View label" onChange={setPreviousView} value={previousView}>
            <option value="unknown">Auto-detect</option>
            <option value="front">Front</option>
            <option value="side">Side</option>
            <option value="back">Back / Rear</option>
          </Select>
          <Select label="Pose" onChange={setPreviousPose} value={previousPose}>
            <option value="unknown">Auto-detect</option>
            <option value="relaxed">Relaxed</option>
            <option value="flexed">Rear Flexed</option>
          </Select>
        </FieldGrid>
        <PhotoPreviewGrid
          onChange={setPreviousPreviews}
          previews={previousPreviews}
          title="Previous preview"
        />
      </Card>

      <Card className="space-y-4">
        <SectionHeader
          icon={Sparkles}
          title="Optional context"
          subtitle="Leave this blank to test general visual evidence analysis."
        />
        <label className="space-y-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
          <span>Goal context</span>
          <input
            className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-base font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            onChange={(event) => setGoalContext(event.target.value)}
            placeholder="Optional, e.g. Visible Abs at Rest"
            value={goalContext}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full bg-indigo-50 px-3 py-2 text-xs font-extrabold text-indigo-700"
            onClick={() => {
              setCurrentView("front");
              setPreviousView("front");
              setCurrentPose("relaxed");
              setPreviousPose("relaxed");
            }}
            type="button"
          >
            Front vs front
          </button>
          <button
            className="rounded-full bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700"
            onClick={() => {
              setCurrentView("unknown");
              setPreviousView("unknown");
            }}
            type="button"
          >
            Auto-detect labels
          </button>
          <button
            className="rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700"
            onClick={reset}
            type="button"
          >
            Reset
          </button>
        </div>
      </Card>

      <div className="flex gap-3">
        <button
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[16px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(79,70,229,0.24)] disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
          Run PhotoInterpreter
        </button>
        <button
          className="grid min-h-12 w-12 place-items-center rounded-[16px] border border-[var(--divider)] bg-[var(--surface)] text-slate-600"
          onClick={reset}
          type="button"
        >
          <RefreshCcw size={18} />
        </button>
      </div>
    </form>
  );
}

function MobileResults({ error, interpretation, isSubmitting, result, status }) {
  return (
    <div className="space-y-4">
      <section id="analyzing">
        <StatusCard error={error} result={result} status={status} />
        {isSubmitting && (
          <Card className="flex items-center gap-3">
            <Loader2 className="animate-spin text-indigo-600" size={18} />
            <p className="text-sm font-extrabold text-slate-700">
              Analyzing photos...
            </p>
          </Card>
        )}
      </section>
      <TestCasesCard />
      {interpretation && (
        <>
          <CollapsibleSection defaultOpen icon={FileJson} id="comparison" title="Comparison">
            <JsonPreview value={result.metadataDebug ?? {}} />
            <OutputList title="Views detected" values={interpretation.views_detected} />
            <OutputList title="What changed" values={interpretation.visual_changes_observed} />
            <OutputList title="What reduced confidence" values={interpretation.limitations} />
          </CollapsibleSection>
          <CollapsibleSection defaultOpen icon={Sparkles} id="details" title="Detailed Interpretation">
            <DetailedInterpretation value={interpretation.detailed_interpretation} />
          </CollapsibleSection>
          <CollapsibleSection defaultOpen icon={BadgeCheck} id="explanation" title="Briefing Summary">
            <BriefingSummary
              value={interpretation.briefing_summary}
              fallback={interpretation.user_facing_summary}
            />
          </CollapsibleSection>
          <CollapsibleSection icon={Sparkles} id="internal" title="Internal Notes">
            <OutputList title="Body composition observations" values={interpretation.body_composition_observations} />
            <OutputList title="Likely improving areas" values={interpretation.likely_improving_areas} />
            <OutputList title="Likely lagging areas" values={interpretation.likely_lagging_areas} />
            <OutputList title="Confidence notes" values={interpretation.confidence_notes} />
          </CollapsibleSection>
          <CollapsibleSection defaultOpen icon={ShieldAlert} id="evidence" title="Evidence Created">
            <JsonPreview value={result.previews?.evidenceObjects ?? []} />
          </CollapsibleSection>
          <CollapsibleSection defaultOpen icon={Sparkles} id="protocols" title="Suggested Protocols">
            <ChipList values={interpretation.suggested_protocols} />
          </CollapsibleSection>
          <CollapsibleSection defaultOpen icon={BadgeCheck} id="priorities" title="Suggested Priorities">
            <ChipList values={interpretation.suggested_priorities} />
          </CollapsibleSection>
          <CollapsibleSection defaultOpen icon={Camera} id="briefing" title="Briefing Insert">
            <p className="text-sm font-semibold leading-6 text-slate-700">
              {interpretation.coach_briefing_insert}
            </p>
          </CollapsibleSection>
          <CollapsibleSection defaultOpen icon={Home} id="home-preview" title="Home Preview">
            <JsonPreview value={result.previews?.futureGoalEnginePreview ?? {}} />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

function DesktopResults({ error, interpretation, result, status }) {
  return (
    <aside className="space-y-4">
      <StatusCard error={error} result={result} status={status} />
      <TestCasesCard />
      {interpretation && (
        <>
          <Panel icon={Sparkles} title="Detailed Interpretation">
            <DetailedInterpretation value={interpretation.detailed_interpretation} />
          </Panel>
          <Panel icon={FileJson} title="Internal Notes">
            <OutputList title="Body composition observations" values={interpretation.body_composition_observations} />
            <OutputList title="Likely improving areas" values={interpretation.likely_improving_areas} />
            <OutputList title="Likely lagging areas" values={interpretation.likely_lagging_areas} />
            <OutputList title="Confidence notes" values={interpretation.confidence_notes} />
          </Panel>
          <Panel icon={BadgeCheck} title="Briefing Summary">
            <BriefingSummary
              value={interpretation.briefing_summary}
              fallback={interpretation.user_facing_summary}
            />
          </Panel>
          <Panel icon={FileJson} title="Comparison">
            <JsonPreview value={result.metadataDebug ?? {}} />
            <OutputList title="Views detected" values={interpretation.views_detected} />
            <OutputList title="What changed" values={interpretation.visual_changes_observed} />
            <OutputList title="What reduced confidence" values={interpretation.limitations} />
          </Panel>
          <Panel icon={ShieldAlert} title="Evidence Objects That Would Be Created">
            <JsonPreview value={result.previews?.evidenceObjects ?? []} />
          </Panel>
          <Panel icon={Sparkles} title="Suggested Protocols">
            <ChipList values={interpretation.suggested_protocols} />
          </Panel>
          <Panel icon={BadgeCheck} title="Suggested Priorities">
            <ChipList values={interpretation.suggested_priorities} />
          </Panel>
          <Panel icon={Camera} title="Briefing Insert">
            <p className="text-sm font-semibold leading-6 text-slate-700">
              {interpretation.coach_briefing_insert}
            </p>
          </Panel>
          <Panel icon={Home} title="Home Preview">
            <JsonPreview value={result.previews?.futureGoalEnginePreview ?? {}} />
          </Panel>
        </>
      )}
    </aside>
  );
}

function StatusCard({ error, result, status }) {
  return (
    <Card className="space-y-3">
      <SectionHeader icon={status.icon} title="Interpreter status" subtitle={status.detail} />
      <div className={`rounded-[14px] px-3 py-2 text-sm font-extrabold ${status.className}`}>
        {status.label}
      </div>
      {result?.simulator && (
        <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
          <p>Model: {result.simulator.model}</p>
          <p>Latency: {result.simulator.latencyMs}ms</p>
          <p>Persisted: No</p>
          <p>Mode: Simulation</p>
        </div>
      )}
      {error && (
        <p className="rounded-[12px] bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          {error}
        </p>
      )}
      {result?.warning && (
        <p className="rounded-[12px] bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">
          {result.warning}
        </p>
      )}
    </Card>
  );
}

function TestCasesCard() {
  return (
    <Card className="space-y-3">
      <SectionHeader
        icon={AlertTriangle}
        title="Quick test cases"
        subtitle="Goals are optional; visual interpretation should still work."
      />
      <ul className="space-y-2 text-sm font-semibold leading-6 text-slate-600">
        <li>Single front photo: upload one current front image.</li>
        <li>Front vs front comparison: upload current and previous front images.</li>
        <li>Front / side / back set: upload all current views together.</li>
        <li>Mismatched views: set current front and previous back to verify limitations.</li>
        <li>No goal context: leave the goal field blank and verify visual change output still works.</li>
        <li>No key fallback: remove `OPENAI_API_KEY` locally and rerun.</li>
      </ul>
    </Card>
  );
}

function CollapsibleSection({ children, defaultOpen = false, icon, id, title }) {
  const Icon = icon;

  return (
    <details
      className="scroll-mt-28 rounded-[22px] border border-[var(--divider)] bg-[var(--surface)] p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
      id={id}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <IconBadge icon={Icon} color="primary" size="sm" />
        <span className="text-base font-extrabold leading-tight text-slate-950">
          {title}
        </span>
      </summary>
      <div className="mt-4 space-y-3">{children}</div>
    </details>
  );
}

function PhotoPreviewGrid({ onChange, previews, title }) {
  if (previews.length === 0) return null;

  function updatePreview(index, patch) {
    onChange(
      previews.map((preview, previewIndex) =>
        previewIndex === index
          ? {
              ...preview,
              ...patch,
              metadataSource: patch.metadataSource ?? "manual",
            }
          : preview
      )
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </p>
      <div className="space-y-3">
        {previews.map((preview, index) => (
          <div
            className="overflow-hidden rounded-[12px] border border-[var(--divider)] bg-[var(--surface-muted)]"
            key={`${preview.name}-${index}`}
          >
            <div className="grid grid-cols-[80px_1fr] gap-3 p-2">
              <Image
                alt={preview.name}
                className="aspect-[3/4] w-full rounded-[10px] object-cover"
                height={128}
                src={preview.url}
                unoptimized
                width={96}
              />
              <div className="min-w-0 space-y-2">
                <p className="truncate text-[11px] font-extrabold text-slate-600">
                  {preview.name}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <DateInput
                    label="Date"
                    onChange={(value) => updatePreview(index, { date: value })}
                    value={preview.date ?? ""}
                  />
                  <Select
                    label="View"
                    onChange={(value) => updatePreview(index, { view: value })}
                    value={preview.view ?? "unknown"}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="front">Front</option>
                    <option value="side">Side</option>
                    <option value="back">Back / Rear</option>
                  </Select>
                  <Select
                    label="Pose"
                    onChange={(value) => updatePreview(index, { pose: value })}
                    value={preview.pose ?? "unknown"}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="relaxed">Relaxed</option>
                    <option value="flexed">Rear Flexed</option>
                  </Select>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    <span>Source</span>
                    <input
                      className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold normal-case tracking-normal text-slate-600"
                      readOnly
                      value={formatHumanValue(preview.metadataSource ?? "unknown")}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldGrid({ children }) {
  return <div className="grid gap-3 sm:grid-cols-3">{children}</div>;
}

function DateInput({ label, onChange, value }) {
  return (
    <label className="space-y-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
      <span>{label}</span>
      <input
        className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-base font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function Select({ children, label, onChange, value }) {
  return (
    <label className="space-y-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
      <span>{label}</span>
      <select
        className="min-h-12 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-base font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function Panel({ children, icon, title }) {
  return (
    <Card className="space-y-3">
      <SectionHeader icon={icon} title={title} />
      {children}
    </Card>
  );
}

function SectionHeader({ icon, subtitle, title }) {
  const Icon = icon;

  return (
    <div className="flex items-start gap-3">
      <IconBadge icon={Icon} color="primary" size="sm" />
      <div>
        <h2 className="text-base font-extrabold leading-tight text-slate-950">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function OutputList({ title, values = [] }) {
  if (!values?.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </p>
      <ul className="space-y-1">
        {values.map((value) => (
          <li className="text-sm font-semibold leading-6 text-slate-700" key={value}>
            {formatHumanValue(value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailedInterpretation({ value }) {
  if (!value?.sections?.length) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        No detailed interpretation returned.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {value.summary && (
        <p className="rounded-[14px] bg-[var(--surface-muted)] p-3 text-sm font-semibold leading-6 text-slate-700">
          {value.summary}
        </p>
      )}
      <div className="space-y-3">
        {value.sections.map((section) => (
          <article
            className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3"
            key={`${section.region}-${section.status}`}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold leading-tight text-slate-950">
                  {section.region}
                </h3>
                <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                  {formatHumanValue(section.status)}
                </p>
              </div>
              <span className="rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-[11px] font-extrabold text-slate-600">
                Confidence: {formatHumanValue(section.confidence)}
              </span>
            </div>
            <div className="space-y-3">
              <DetailRow label="What changed" value={section.what_changed} />
              <DetailRow label="What did not change" value={section.what_did_not_change} />
              <DetailRow label="Why" value={section.why} />
              <OutputList title="Limits" values={section.limitations} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function BriefingSummary({ fallback, value }) {
  if (!value) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-700">
        {fallback || "No briefing summary returned."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {value.summary && (
        <p className="text-sm font-semibold leading-6 text-slate-700">
          {value.summary}
        </p>
      )}
      <OutputList title="Biggest changes" values={value.biggest_changes} />
      <DetailRow label="Why it matters" value={value.why_they_matter} />
      <DetailRow label="Goal impact" value={value.goal_impact} />
      <DetailRow label="Next step" value={value.next_step} />
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;

  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function ChipList({ values = [] }) {
  if (!values?.length) {
    return <p className="text-sm font-semibold text-slate-500">None returned.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span
          className="rounded-full bg-[var(--surface-muted)] px-3 py-2 text-xs font-extrabold text-slate-700"
          key={value}
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function JsonPreview({ value }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[14px] bg-[var(--surface-muted)] p-3 text-[11px] font-semibold leading-5 text-slate-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function getInterpreterStatus(result, error) {
  if (error) {
    return {
      className: "bg-red-50 text-red-700",
      detail: "The simulator request failed before returning interpretation output.",
      icon: ShieldAlert,
      label: "Error state",
    };
  }

  if (!result) {
    return {
      className: "bg-slate-100 text-slate-700",
      detail: "Upload photos to call the real interpreter path.",
      icon: FlaskConical,
      label: "Ready",
    };
  }

  if (result.provider === "openai") {
    return {
      className: "bg-emerald-50 text-emerald-700",
      detail: "OpenAI vision-backed PhotoInterpreter returned structured JSON.",
      icon: BadgeCheck,
      label: "OpenAI active",
    };
  }

  return {
    className: "bg-orange-50 text-orange-700",
    detail: "Fallback interpretation is active. Check OPENAI_API_KEY if this was unexpected.",
    icon: AlertTriangle,
    label: "Fallback active",
  };
}

async function createPreviews(files) {
  return Promise.all(
    files.map(async (file) => {
      const metadata = parseFilenameMetadata(file.name);
      const exifDate = extractExifDate(await file.arrayBuffer());

      return {
        name: file.name,
        url: await readDataUrl(file),
        date: exifDate ?? metadata.date ?? today,
        view: metadata.view,
        pose: metadata.pose,
        metadataSource: exifDate ? "EXIF" : metadata.source,
      };
    })
  );
}

function readDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function extractExifDate(arrayBuffer) {
  const text = Array.from(new Uint8Array(arrayBuffer))
    .map((byte) => String.fromCharCode(byte))
    .join("");
  const match = text.match(/\b(20\d{2}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}\b/);

  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function applyFirstPreviewMetadata(previews, setters) {
  const first = previews[0];

  if (!first) return;
  if (first.date) setters.setDate(first.date);
  if (first.view && first.view !== "unknown") setters.setView(first.view);
  if (first.pose && first.pose !== "unknown") setters.setPose(first.pose);
}

function toPhotoMetadata(preview) {
  return {
    date: preview.date || null,
    fileName: preview.name,
    pose: preview.pose || "unknown",
    source: preview.metadataSource || "unknown",
    view: preview.view || "unknown",
  };
}

function parseFilenameMetadata(fileName) {
  return {
    date: parseDateFromFilename(fileName),
    pose: parsePoseFromFilename(fileName),
    source: parseDateFromFilename(fileName) ? "filename" : "unknown",
    view: parseViewFromFilename(fileName),
  };
}

function parseDateFromFilename(fileName) {
  const value = String(fileName ?? "");
  const isoMatch = value.match(/\b(20\d{2})[-_](\d{2})[-_](\d{2})\b/);

  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const usMatch = value.match(/\b(\d{2})[-_](\d{2})[-_](20\d{2})\b/);

  if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;

  return null;
}

function parseViewFromFilename(fileName) {
  const lower = String(fileName ?? "").toLowerCase();

  if (lower.includes("front")) return "front";
  if (lower.includes("side")) return "side";
  if (lower.includes("back") || lower.includes("rear")) return "back";

  return "unknown";
}

function parsePoseFromFilename(fileName) {
  const lower = String(fileName ?? "").toLowerCase();

  if (lower.includes("double-biceps") || lower.includes("double_biceps") || lower.includes("flex")) {
    return "flexed";
  }
  if (lower.includes("relaxed")) return "relaxed";

  return "unknown";
}

function formatHumanValue(value) {
  const text = String(value ?? "").replaceAll("_", " ").trim();
  const looksLikeSentence =
    /[.!?]/.test(text) || text.split(/\s+/).filter(Boolean).length > 4;

  if (looksLikeSentence) return text;

  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
