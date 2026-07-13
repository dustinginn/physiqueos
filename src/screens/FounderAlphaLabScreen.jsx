"use client";

import {
  Activity,
  Archive,
  Brain,
  Bug,
  ClipboardList,
  Database,
  FileText,
  Home,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createCustomPersona, createLabSimulation } from "../domain/lab/labSimulation";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import SectionTitle from "../components/ui/SectionTitle";

const journeyStorageKey = "physiqueos-founder-alpha-lab-journeys";
const fakeIntegrations = [
  "Apple Health",
  "Apple Watch",
  "Garmin",
  "Oura",
  "Cronometer",
  "MyFitnessPal",
  "Workout history",
  "DEXA",
  "Blood Work",
  "Photos",
];
const homeModes = ["Brand New User", "Building Stage", "Established User", "Power User"];
const levelFilters = ["All", "Beginner", "Intermediate", "Advanced", "Empty profile", "Power user", "Custom"];

export default function FounderAlphaLabScreen({ personas = [] }) {
  const [selectedPersonaId, setSelectedPersonaId] = useState(personas[0]?.id ?? "");
  const [customPersonas, setCustomPersonas] = useState([]);
  const [levelFilter, setLevelFilter] = useState("All");
  const [conversation, setConversation] = useState("");
  const [integrations, setIntegrations] = useState([]);
  const [photoUploads, setPhotoUploads] = useState([]);
  const [photoInterpretations, setPhotoInterpretations] = useState([]);
  const [latestLabPhotoSet, setLatestLabPhotoSet] = useState(null);
  const [homeMode, setHomeMode] = useState("Brand New User");
  const [simulation, setSimulation] = useState(null);
  const [micState, setMicState] = useState("idle");
  const [customDraft, setCustomDraft] = useState({
    background: "",
    goal: "",
    title: "",
  });

  const allPersonas = useMemo(
    () => [...customPersonas, ...personas],
    [customPersonas, personas]
  );
  const selectedPersona =
    allPersonas.find((persona) => persona.id === selectedPersonaId) ?? allPersonas[0];
  const filteredPersonas = allPersonas.filter(
    (persona) => levelFilter === "All" || persona.level === levelFilter
  );

  const [journeys, setJourneys] = useState(() => {
    if (typeof window === "undefined") return [];

    try {
      const stored = window.localStorage.getItem(journeyStorageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  function persistJourney(nextSimulation) {
    const record = {
      ...nextSimulation,
      personaSnapshot: nextSimulation.persona,
    };
    const nextJourneys = [
      record,
      ...journeys.filter((journey) => journey.id !== record.id),
    ].slice(0, 20);

    setJourneys(nextJourneys);
    window.localStorage.setItem(journeyStorageKey, JSON.stringify(nextJourneys));
  }

  function runSimulation({ persona = selectedPersona, replayCount = 0 } = {}) {
    if (!persona) return;
    const nextSimulation = createLabSimulation({
      conversation,
      homeMode,
      integrations,
      persona,
      photoInterpretations,
      photoUploads,
      replayCount,
    });

    setSimulation(nextSimulation);
    persistJourney(nextSimulation);
  }

  function startNewJourney() {
    setConversation("");
    setIntegrations([]);
    setPhotoUploads([]);
    setPhotoInterpretations([]);
    setLatestLabPhotoSet(null);
    setHomeMode("Brand New User");
    setSimulation(null);
    setSelectedPersonaId(personas[0]?.id ?? "");
  }

  function loadJourney(journeyId) {
    const journey = journeys.find((item) => item.id === journeyId);
    if (!journey) return;

    const persona = journey.personaSnapshot ?? journey.persona;
    if (persona && !allPersonas.some((item) => item.id === persona.id)) {
      setCustomPersonas((current) => [persona, ...current]);
    }
    setSelectedPersonaId(persona?.id ?? journey.persona?.id);
    setConversation(journey.conversation ?? "");
    setIntegrations(journey.evidence
      ?.filter((item) => item.source === "Fake integration")
      .map((item) => item.label) ?? []);
    setPhotoUploads(journey.evidence
      ?.filter((item) => item.source === "Lab photo upload")
      .map((item) => ({ name: item.label })) ?? []);
    setHomeMode(journey.homePreview?.mode ?? "Brand New User");
    setSimulation(journey);
  }

  function replayJourney() {
    runSimulation({
      persona: selectedPersona,
      replayCount: (simulation?.replayCount ?? 0) + 1,
    });
  }

  function toggleIntegration(name) {
    setIntegrations((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );
  }

  async function handlePhotoUpload(event) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const captureDate = new Date().toISOString().slice(0, 10);

    setPhotoUploads((current) => [
      ...files.map((file) => ({
        name: file.name,
        uploadedAt: new Date().toISOString(),
      })),
      ...current,
    ]);
    const localPhotoSet = {
      captureDate,
      photos: await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          dataUrl: await fileToDataUrl(file),
          mimeType: file.type || "image/jpeg",
          view: inferView(file.name),
          pose: inferPose(file.name),
          capturedAt: captureDate,
        }))
      ),
    };
    const formData = new FormData();

    for (const file of files) {
      formData.append("photos", file);
    }

    formData.append("captureDate", captureDate);
    formData.append("goalContext", selectedPersona?.primaryGoal ?? "Visible Abs at Rest");
    if (latestLabPhotoSet) {
      formData.append("previousPhotoSet", JSON.stringify(latestLabPhotoSet));
    }

    try {
      const response = await fetch("/api/lab/photo-interpretation", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error ?? "Photo interpretation failed.");

      setPhotoInterpretations((current) => [result, ...current].slice(0, 4));
      setLatestLabPhotoSet({
        ...localPhotoSet,
        photoSetId: result.interpretation?.photo_set_id,
      });
    } catch (error) {
      setPhotoInterpretations((current) => [
        {
          provider: "error",
          warning: error.message,
          interpretation: null,
        },
        ...current,
      ].slice(0, 4));
    }
    event.target.value = "";
  }

  function createPersona() {
    if (!customDraft.title || !customDraft.goal) return;
    const persona = createCustomPersona(customDraft);

    setCustomPersonas((current) => [persona, ...current]);
    setSelectedPersonaId(persona.id);
    setCustomDraft({ background: "", goal: "", title: "" });
    setSimulation(null);
  }

  function startMicrophone() {
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicState("unsupported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    setMicState("listening");
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      setConversation((current) => `${current}${current ? "\n" : ""}${transcript}`.trim());
    };
    recognition.onerror = () => setMicState("error");
    recognition.onend = () => setMicState("idle");
    recognition.start();
  }

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-28">
        <LabHeader
          journeys={journeys}
          onLoad={loadJourney}
          onReplay={replayJourney}
          onReset={startNewJourney}
        />

        <div className="mt-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <PersonaSelector
              filteredPersonas={filteredPersonas}
              levelFilter={levelFilter}
              onCreatePersona={createPersona}
              onFilterChange={setLevelFilter}
              onPersonaChange={(id) => {
                setSelectedPersonaId(id);
                setSimulation(null);
              }}
              selectedPersonaId={selectedPersona?.id}
              setCustomDraft={setCustomDraft}
              customDraft={customDraft}
            />
            <ConversationPanel
              conversation={conversation}
              micState={micState}
              onChange={setConversation}
              onListen={startMicrophone}
              onRun={() => runSimulation()}
            />
            <FakeIntegrationsPanel
              integrations={integrations}
              onToggle={toggleIntegration}
            />
          </div>

          <div className="space-y-4">
            <InterpretationPanel simulation={simulation} />
            <EvidencePanel
              evidence={simulation?.evidence ?? []}
              onPhotoUpload={handlePhotoUpload}
              photoInterpretations={photoInterpretations}
              photoUploads={photoUploads}
            />
            <ProtocolsPanel protocols={simulation?.protocols} />
            <StartingBriefing briefing={simulation?.startingBriefing} />
          </div>

          <div className="space-y-4">
            <HomePreview
              homeMode={homeMode}
              onHomeModeChange={(mode) => {
                setHomeMode(mode);
                setSimulation(null);
              }}
              preview={simulation?.homePreview}
            />
            <DebugPanel debug={simulation?.debug} />
          </div>
        </div>
      </div>
    </main>
  );
}

function LabHeader({ journeys, onLoad, onReplay, onReset }) {
  return (
    <Card className="sticky top-3 z-30 border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-elevated)_92%,transparent)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--primary)]">
            Founder Alpha Lab
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[var(--text-primary)]">
            Teach the operating system how to think.
          </h1>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] px-3 py-3 text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--border-strong)]"
            href="/lab/narrative-engine"
          >
            <Brain size={16} />
            Narrative Lab
          </Link>
          <LabButton icon={RotateCcw} label="Start New Journey" onClick={onReset} tone="primary" />
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] px-3 py-3 text-sm font-extrabold text-[var(--text-primary)]">
            <Archive size={16} />
            <select
              aria-label="Load Previous Journey"
              className="max-w-[150px] bg-transparent text-sm font-extrabold outline-none"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) onLoad(event.target.value);
              }}
            >
              <option value="">Load Previous</option>
              {journeys.map((journey) => (
                <option key={journey.id} value={journey.id}>
                  {journey.persona?.title ?? "Journey"} / {formatTime(journey.timestamp)}
                </option>
              ))}
            </select>
          </label>
          <LabButton icon={Play} label="Replay Journey" onClick={onReplay} />
        </div>
      </div>
    </Card>
  );
}

function PersonaSelector({
  customDraft,
  filteredPersonas,
  levelFilter,
  onCreatePersona,
  onFilterChange,
  onPersonaChange,
  selectedPersonaId,
  setCustomDraft,
}) {
  return (
    <LabCard icon={UserRound} title="Persona Selector">
      <div className="flex flex-wrap gap-2">
        {levelFilters.map((filter) => (
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
              levelFilter === filter
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)]"
            }`}
            key={filter}
            onClick={() => onFilterChange(filter)}
            type="button"
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-[330px] space-y-2 overflow-y-auto pr-1">
        {filteredPersonas.map((persona) => (
          <button
            className={`w-full rounded-[14px] border p-3 text-left transition ${
              selectedPersonaId === persona.id
                ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface-elevated))]"
                : "border-[var(--divider)] bg-[var(--surface-muted)] hover:border-[var(--border-strong)]"
            }`}
            key={persona.id}
            onClick={() => onPersonaChange(persona.id)}
            type="button"
          >
            <span className="flex items-start justify-between gap-2">
              <span>
                <span className="block text-sm font-extrabold text-[var(--text-primary)]">
                  {persona.title}
                </span>
                <span className="mt-1 line-clamp-2 block text-xs font-medium leading-5 text-[var(--text-muted)]">
                  {persona.primaryGoal}
                </span>
              </span>
              <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-extrabold text-[var(--text-muted)]">
                {persona.level}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-[14px] bg-[var(--surface-muted)] p-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
          Create Custom Persona
        </p>
        <div className="mt-2 grid gap-2">
          <input
            className="rounded-[12px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
            onChange={(event) => setCustomDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Name"
            value={customDraft.title}
          />
          <input
            className="rounded-[12px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
            onChange={(event) => setCustomDraft((current) => ({ ...current, goal: event.target.value }))}
            placeholder="Primary goal"
            value={customDraft.goal}
          />
          <textarea
            className="min-h-20 rounded-[12px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
            onChange={(event) => setCustomDraft((current) => ({ ...current, background: event.target.value }))}
            placeholder="Background"
            value={customDraft.background}
          />
          <LabButton icon={Wand2} label="Create Persona" onClick={onCreatePersona} />
        </div>
      </div>
    </LabCard>
  );
}

function ConversationPanel({ conversation, micState, onChange, onListen, onRun }) {
  return (
    <LabCard icon={Mic} title="Goal Initialization">
      <div className="grid gap-2 sm:grid-cols-2">
        <LabButton icon={Mic} label={getMicLabel(micState)} onClick={onListen} />
        <LabButton icon={Sparkles} label="Run Interpretation" onClick={onRun} tone="primary" />
      </div>
      <textarea
        className="mt-3 min-h-44 w-full rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3 text-sm font-medium leading-6 text-[var(--text-primary)] outline-none"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type or dictate the onboarding conversation. Example: I want visible abs by late summer, I lift four days per week, I have DEXA scans and progress photos, and I want direct guidance."
        value={conversation}
      />
      <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">
        Voice and typing both feed the simulated Interpretation Layer.
      </p>
    </LabCard>
  );
}

function FakeIntegrationsPanel({ integrations, onToggle }) {
  return (
    <LabCard icon={Database} title="Fake Integrations">
      <div className="grid grid-cols-2 gap-2">
        {fakeIntegrations.map((integration) => (
          <button
            className={`rounded-[12px] border px-3 py-2 text-left text-xs font-extrabold transition ${
              integrations.includes(integration)
                ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface-elevated))] text-[var(--primary)]"
                : "border-[var(--divider)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"
            }`}
            key={integration}
            onClick={() => onToggle(integration)}
            type="button"
          >
            {integration}
          </button>
        ))}
      </div>
    </LabCard>
  );
}

function InterpretationPanel({ simulation }) {
  const interpretation = simulation?.interpretation;

  return (
    <LabCard icon={Brain} title="Interpretation">
      {!interpretation ? (
        <EmptyLabState label="Select a persona and run interpretation." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <KeyValue label="Goal" value={interpretation.goal} />
          <KeyValue label="Timeline" value={interpretation.timeline} />
          <KeyValue label="Acumen" value={interpretation.acumen} />
          <KeyValue label="Guidance Style" value={interpretation.guidanceStyle} />
          <ChipList label="Objectives" values={interpretation.objectives} />
          <ChipList label="Missing Pieces" values={interpretation.missingPieces} tone="warning" />
          <ChipList label="Reasoning" values={interpretation.reasoning} wide />
          <KeyValue label="Internal Confidence" value={`${interpretation.internalConfidence}%`} />
        </div>
      )}
    </LabCard>
  );
}

function EvidencePanel({ evidence, onPhotoUpload, photoInterpretations, photoUploads }) {
  return (
    <LabCard icon={ClipboardList} title="Evidence">
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
          Evidence objects appear immediately as the Lab interprets conversation, fake integrations, and uploads.
        </p>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-[var(--surface-muted)] px-3 py-2 text-xs font-extrabold text-[var(--text-primary)]">
          <Upload size={14} />
          Upload Photos
          <input
            accept="image/*"
            className="sr-only"
            multiple
            onChange={onPhotoUpload}
            type="file"
          />
        </label>
      </div>
      {photoUploads.length > 0 && (
        <p className="mb-3 rounded-[12px] bg-[var(--surface-muted)] px-3 py-2 text-xs font-bold text-[var(--text-muted)]">
          Photo analysis simulation queued: {photoUploads.map((photo) => photo.name).join(", ")}
        </p>
      )}
      {photoInterpretations.length > 0 && (
        <div className="mb-3 space-y-3">
          {photoInterpretations.map((result, index) => (
            <PhotoInterpretationResult
              key={`${result.interpretation?.photo_set_id ?? "photo-error"}-${index}`}
              result={result}
            />
          ))}
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {evidence.length === 0 ? (
          <EmptyLabState label="No evidence generated yet." />
        ) : (
          evidence.map((item) => (
            <div
              className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3"
              key={`${item.type}-${item.label}`}
            >
              <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
                {item.type}
              </p>
              <h3 className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">
                {item.label}
              </h3>
              <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
                {item.source} / {item.confidence}
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                {item.influence}
              </p>
            </div>
          ))
        )}
      </div>
    </LabCard>
  );
}

function PhotoInterpretationResult({ result }) {
  const interpretation = result.interpretation;

  return (
    <div className="rounded-[16px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
          PhotoInterpreter / {result.provider}
        </p>
        {result.warning && (
          <span className="rounded-full bg-[color-mix(in_srgb,var(--chart-3)_14%,var(--surface-muted))] px-2 py-1 text-[10px] font-extrabold text-[var(--chart-3)]">
            Fallback warning
          </span>
        )}
      </div>
      {result.warning && (
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
          {result.warning}
        </p>
      )}
      {!interpretation ? (
        <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">
          No interpretation returned.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          <BriefingLine
            label="User-Facing Explanation"
            value={interpretation.user_facing_summary}
          />
          <BriefingLine
            label="Coach Briefing Insert"
            value={interpretation.coach_briefing_insert}
          />
          <ChipList
            label="Evidence Created"
            values={[
              `Photo set: ${interpretation.photo_set_id}`,
              `Views: ${interpretation.views_detected.join(", ")}`,
              ...interpretation.goal_relevance.slice(0, 2),
            ]}
            tone="evidence"
          />
          <ChipList
            label="Internal Interpretation"
            values={[
              ...interpretation.body_composition_observations.slice(0, 2),
              ...interpretation.visual_changes_observed.slice(0, 2),
              ...interpretation.limitations.slice(0, 2),
            ]}
          />
          <ChipList
            label="Suggested Protocols / Priorities"
            values={[
              ...interpretation.suggested_protocols.slice(0, 2),
              ...interpretation.suggested_priorities.slice(0, 2),
            ]}
            tone="success"
          />
        </div>
      )}
    </div>
  );
}

function ProtocolsPanel({ protocols }) {
  return (
    <LabCard icon={Activity} title="Protocols">
      {!protocols ? (
        <EmptyLabState label="Protocols will appear after interpretation." />
      ) : (
        <div className="space-y-3">
          <KeyValue label="Protocol Maturity" value={protocols.maturity} />
          <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
            {protocols.reasoning}
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <ProtocolList title="Established Protocols" protocols={protocols.established} />
            <ProtocolList title="Suggested Protocols" protocols={protocols.suggested} />
          </div>
          <ChipList label="Future Suggestions" values={protocols.futureSuggestions} tone="evidence" />
        </div>
      )}
    </LabCard>
  );
}

function ProtocolList({ protocols, title }) {
  return (
    <div className="rounded-[14px] bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {title}
      </p>
      <div className="mt-2 space-y-2">
        {protocols.length === 0 ? (
          <p className="text-xs font-semibold text-[var(--text-muted)]">None yet.</p>
        ) : (
          protocols.map((protocol) => (
            <div key={protocol.title}>
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                {protocol.title}
              </p>
              <p className="text-xs font-medium leading-5 text-[var(--text-muted)]">
                {protocol.reasoning}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StartingBriefing({ briefing }) {
  return (
    <LabCard icon={FileText} title="Starting Briefing">
      {!briefing ? (
        <EmptyLabState label="Generate interpretation to create a starting briefing." />
      ) : (
        <div className="rounded-[18px] bg-gradient-to-br from-[color-mix(in_srgb,var(--primary)_14%,var(--surface-elevated))] to-[var(--surface-muted)] p-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">
            {briefing.title}
          </p>
          <h2 className="mt-2 text-2xl font-extrabold leading-tight text-[var(--text-primary)]">
            {briefing.headline}
          </h2>
          <div className="mt-4 grid gap-3">
            <BriefingLine label="Understanding" value={briefing.understanding} />
            <BriefingLine label="What matters" value={briefing.whatMatters} />
            <BriefingLine label="Confidence" value={briefing.confidence} />
            <BriefingLine label="Still learning" value={briefing.stillLearning} />
            <BriefingLine label="Next step" value={briefing.nextStep} />
          </div>
        </div>
      )}
    </LabCard>
  );
}

function HomePreview({ homeMode, onHomeModeChange, preview }) {
  return (
    <LabCard icon={Home} title="Home Preview">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {homeModes.map((mode) => (
          <button
            className={`rounded-[12px] px-3 py-2 text-xs font-extrabold ${
              homeMode === mode
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)]"
            }`}
            key={mode}
            onClick={() => onHomeModeChange(mode)}
            type="button"
          >
            {mode}
          </button>
        ))}
      </div>
      {!preview ? (
        <EmptyLabState label="Run interpretation to preview Home." />
      ) : (
        <div className="space-y-3 rounded-[20px] border border-[var(--divider)] bg-[var(--surface-muted)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">
                {preview.mode}
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">
                {preview.trajectory}
              </h2>
              <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
                {preview.primaryGoal}
              </p>
            </div>
            <div className="rounded-full bg-[var(--surface-elevated)] px-3 py-2 text-sm font-extrabold text-[var(--primary)]">
              {preview.confidence}%
            </div>
          </div>
          <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
            {preview.context}
          </p>
          <ChipList label="Today's Priorities" values={preview.priorities} tone="success" />
          <ChipList label="Supporting Objectives" values={preview.objectives} tone="evidence" />
        </div>
      )}
    </LabCard>
  );
}

function DebugPanel({ debug }) {
  return (
    <LabCard icon={Bug} title="Debug View">
      {!debug ? (
        <EmptyLabState label="Debug state will appear after interpretation." />
      ) : (
        <div className="space-y-3">
          <DebugObject title="Goal Engine" value={debug.goalEngine} />
          <DebugObject title="Evidence Engine" value={debug.evidenceEngine} />
          <ChipList label="Reasoning Engine" values={debug.reasoningEngine} />
          <ChipList label="Missing Pieces" values={debug.missingPieces} tone="warning" />
          <KeyValue label="Next Best Step" value={debug.nextBestStep} />
          <DebugObject title="Next Best Step Decision" value={debug.nextBestStepDecision} />
          <DebugObject title="Protocol Graph" value={debug.protocolGraph} />
          <KeyValue label="Internal Confidence" value={`${debug.internalConfidence}%`} />
          <KeyValue label="Acumen" value={debug.acumen} />
          <KeyValue label="Guidance Mode" value={debug.guidanceMode} />
          <ChipList label="Reasoning Chain" values={debug.reasoningChain} tone="evidence" />
        </div>
      )}
    </LabCard>
  );
}

function LabCard({ children, icon, title }) {
  return (
    <Card className="space-y-3">
      <SectionTitle
        title={title}
        action={<IconBadge className="rounded-full" color="primary" icon={icon} size="xs" />}
      />
      {children}
    </Card>
  );
}

function LabButton({ icon: Icon, label, onClick, tone = "muted" }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] px-3 py-3 text-sm font-extrabold transition ${
        tone === "primary"
          ? "bg-[var(--primary)] text-white"
          : "border border-[var(--divider)] bg-[var(--surface-muted)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon size={16} />
      {label}
    </button>
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

function ChipList({ label, tone = "primary", values = [], wide = false }) {
  const toneClass = {
    evidence: "bg-[color-mix(in_srgb,var(--chart-2)_12%,var(--surface-muted))] text-[var(--chart-2)]",
    primary: "bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface-muted))] text-[var(--primary)]",
    success: "bg-[color-mix(in_srgb,var(--chart-1)_12%,var(--surface-muted))] text-[var(--chart-1)]",
    warning: "bg-[color-mix(in_srgb,var(--chart-3)_14%,var(--surface-muted))] text-[var(--chart-3)]",
  }[tone];

  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {values.length === 0 ? (
          <span className="text-xs font-semibold text-[var(--text-muted)]">None yet.</span>
        ) : (
          values.map((value) => (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${toneClass}`}
              key={value}
            >
              {value}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function BriefingLine({ label, value }) {
  return (
    <div className="rounded-[14px] bg-[color-mix(in_srgb,var(--surface-elevated)_72%,transparent)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function DebugObject({ title, value }) {
  return (
    <details className="rounded-[14px] bg-[var(--surface-muted)] p-3">
      <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-primary)]">
        {title}
      </summary>
      <pre className="mt-2 overflow-x-auto text-xs leading-5 text-[var(--text-secondary)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function EmptyLabState({ label }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-[14px] border border-dashed border-[var(--divider)] bg-[var(--surface-muted)] p-4 text-center text-sm font-semibold text-[var(--text-muted)]">
      {label}
    </div>
  );
}

function getMicLabel(state) {
  if (state === "listening") return "Listening...";
  if (state === "unsupported") return "Mic Unsupported";
  if (state === "error") return "Mic Error";

  return "Start Microphone";
}

function formatTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function inferView(fileName) {
  const lower = String(fileName ?? "").toLowerCase();

  if (lower.includes("front")) return "front";
  if (lower.includes("side")) return "side";
  if (lower.includes("back") || lower.includes("rear")) return "back";

  return "unknown";
}

function inferPose(fileName) {
  const lower = String(fileName ?? "").toLowerCase();

  if (lower.includes("double") || lower.includes("flex")) return "flexed";
  if (lower.includes("relaxed")) return "relaxed";

  return "unknown";
}
