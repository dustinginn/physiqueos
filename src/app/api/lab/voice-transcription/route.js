import { NextResponse } from "next/server";
import { createOpenAITranscriptionProvider } from "../../../../domain/transcription/OpenAITranscriptionProvider";

export const runtime = "nodejs";

export async function POST(request) {
  const startedAt = Date.now();
  const formData = await request.formData();
  const audio = formData.get("audio");
  const browserTranscript = normalizeString(formData.get("browserTranscript")) ?? "";
  const durationMs = normalizeString(formData.get("durationMs"));
  const requestId = `voice_transcription_${startedAt}`;

  if (!audio || typeof audio.arrayBuffer !== "function" || audio.size === 0) {
    console.warn("[voice-transcription]", {
      audioBytes: audio?.size ?? 0,
      requestId,
      status: "missing_audio",
    });

    return NextResponse.json(
      {
        error: "Audio file is required.",
        diagnostics: {
          apiKeyDetected: Boolean(process.env.OPENAI_API_KEY),
          audioBytes: audio?.size ?? 0,
          requestId,
          requestSentToOpenAI: false,
          totalLatencyMs: Date.now() - startedAt,
        },
        provider: "server_transcription",
        status: "missing_audio",
        transcript: null,
      },
      { status: 400 }
    );
  }

  const provider = createOpenAITranscriptionProvider();
  const baseDiagnostics = {
    apiKeyDetected: provider.isConfigured,
    audioBytes: audio.size,
    modelSelected: provider.model,
    requestId,
  };

  console.info("[voice-transcription] request received", {
    ...baseDiagnostics,
    browserTranscriptLength: browserTranscript.length,
    durationMs,
  });

  try {
    console.info("[voice-transcription] sending request to OpenAI", {
      ...baseDiagnostics,
      requestSentToOpenAI: provider.isConfigured,
    });

    const result = await provider.transcribe({
      audio,
      browserTranscript,
      durationMs,
    });
    const status = result.status === "provider_error" ? 502 : 200;
    const totalLatencyMs = Date.now() - startedAt;
    const diagnostics = {
      ...baseDiagnostics,
      openaiHttpStatus: result.httpStatus,
      requestSentToOpenAI: provider.isConfigured,
      responseReceivedFromOpenAI: Boolean(result.httpStatus),
      totalLatencyMs,
      transcriptionReturned: Boolean(result.transcript),
      transcriptLength: result.transcript?.length ?? 0,
    };

    console.info("[voice-transcription] response received", {
      ...diagnostics,
      error: result.error ? redactSecrets(result.error) : null,
      providerStatus: result.status,
    });

    return NextResponse.json(
      {
        audioBytes: audio.size,
        diagnostics,
        latencyMs: totalLatencyMs,
        provider: result.provider,
        providerLabel: result.providerLabel,
        reason: result.reason ?? null,
        status: result.status,
        transcript: result.transcript,
        model: result.model ?? provider.model,
        openaiHttpStatus: result.httpStatus,
        error: result.error ? redactSecrets(result.error) : null,
      },
      { status }
    );
  } catch (error) {
    const totalLatencyMs = Date.now() - startedAt;

    console.error("[voice-transcription] request failed", {
      ...baseDiagnostics,
      error: redactSecrets(error.message),
      requestSentToOpenAI: provider.isConfigured,
      totalLatencyMs,
    });

    return NextResponse.json(
      {
        audioBytes: audio.size,
        diagnostics: {
          ...baseDiagnostics,
          requestSentToOpenAI: provider.isConfigured,
          totalLatencyMs,
          transcriptionReturned: false,
        },
        error: redactSecrets(error.message),
        latencyMs: totalLatencyMs,
        provider: provider.id,
        providerLabel: provider.label,
        status: "request_failed",
        transcript: null,
      },
      { status: 500 }
    );
  }
}

function normalizeString(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function redactSecrets(value) {
  return String(value ?? "").replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]");
}
