const DEFAULT_MODEL = "gpt-4o-mini-transcribe";

export function createOpenAITranscriptionProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_MODEL,
} = {}) {
  return {
    id: "openai",
    label: "OpenAI transcription",
    isConfigured: Boolean(apiKey),
    model,
    async transcribe({ audio, browserTranscript = "", durationMs = null }) {
      if (!apiKey) {
        return {
          httpStatus: null,
          model,
          provider: "openai",
          providerLabel: "OpenAI transcription",
          reason: "OPENAI_API_KEY is not configured.",
          status: "provider_not_configured",
          transcript: null,
        };
      }

      const upstreamFormData = new FormData();

      upstreamFormData.set("file", audio, audio.name || "voice-evidence.webm");
      upstreamFormData.set("model", model);
      upstreamFormData.set("language", "en");
      upstreamFormData.set(
        "prompt",
        createTranscriptionPrompt({ browserTranscript, durationMs })
      );

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        body: upstreamFormData,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        return {
          error: payload.error?.message ?? "OpenAI transcription failed.",
          httpStatus: response.status,
          model,
          provider: "openai",
          providerLabel: "OpenAI transcription",
          status: "provider_error",
          transcript: null,
        };
      }

      return {
        httpStatus: response.status,
        model,
        provider: "openai",
        providerLabel: "OpenAI transcription",
        status: "transcribed",
        transcript: normalizeString(payload.text),
      };
    },
  };
}

function createTranscriptionPrompt({ browserTranscript, durationMs }) {
  return [
    "Transcribe PhysiqueOS voice evidence accurately.",
    "Preserve workout details, exercise names, sets, reps, weights, distances, calories, times, nutrition details, symptoms, protocol notes, and units.",
    "Common strength-training phrasing may include sets like 4 sets of 12, loads like 70 lb, exercise machines, dumbbells, cables, and bodyweight work.",
    browserTranscript ? `Browser live-caption draft: ${browserTranscript}` : null,
    durationMs ? `Recording duration milliseconds: ${durationMs}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeString(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}
