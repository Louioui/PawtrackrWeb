import { NextRequest } from 'next/server';
import { appendWorkflowEvent, noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { sanitizePetNotesForAI, voiceAiCircuitBreaker } from '@/lib/adversarial-guardrails';
import { extractStructuredVoiceIntake } from '@/lib/voice-intake';

export const dynamic = 'force-dynamic';

const MAX_TRANSCRIPT_BYTES = 16_384;

export async function POST(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'AI voice receptionist intake', [
    'owner',
    'manager',
    'front_desk',
  ]);
  if (!auth.ok) return auth.response;

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_TRANSCRIPT_BYTES) {
    return noStoreJson({ error: 'Voice transcript payload exceeds 16KB maximum.' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const rawTranscript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  if (!rawTranscript || rawTranscript.length < 4) {
    return noStoreJson({ error: 'A non-empty voice transcript is required.' }, 400);
  }
  if (rawTranscript.length > 4000) {
    return noStoreJson({ error: 'Voice transcript exceeds 4,000 characters.' }, 413);
  }

  try {
    const intake = await voiceAiCircuitBreaker.execute(async () => {
      const structured = extractStructuredVoiceIntake(rawTranscript);
      const guardrailCheck = sanitizePetNotesForAI(rawTranscript);
      const mergedBlocked = Array.from(
        new Set([...guardrailCheck.detectedSignatures, ...structured.blockedPatterns])
      );
      return {
        ...structured,
        sanitizedTranscript: guardrailCheck.injectionDetected
          ? guardrailCheck.sanitizedText
          : structured.sanitizedTranscript,
        promptInjectionBlocked: guardrailCheck.injectionDetected || structured.promptInjectionBlocked,
        blockedPatterns: mergedBlocked,
      };
    });

    await appendWorkflowEvent(auth.ctx, {
      workflow_id: 'WF36',
      event_type: 'voice.intake_parsed',
      source_record_type: 'voice_intake',
      source_record_id: auth.ctx.membership.business_id,
      metadata: {
        pet_name: intake.petName,
        breed: intake.breed,
        estimated_price_cents: intake.estimatedPriceCents,
        prompt_injection_blocked: intake.promptInjectionBlocked,
        blocked_patterns: intake.blockedPatterns,
      },
    });

    return noStoreJson(
      {
        ok: true,
        engine: 'whisper-v3-guarded',
        intake,
      },
      200
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Voice AI circuit unavailable';
    return noStoreJson({ error: msg }, 503);
  }
}
