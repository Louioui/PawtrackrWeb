// ============================================================================
// PAWTRACKR WEB — CLIENT & SERVER PROMPT INJECTION GUARDRAILS (AI Defense)
// Pure TypeScript string sanitizer safe for both browser client and server runtime
// ============================================================================

export const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+in\s+(developer|dan)\s+mode/i,
  /bypass\s+all\s+(rules|restrictions|guardrails)/i,
  /sudo\s+mode/i,
  /role:\s*(system|assistant|admin)/i,
  /<\s*system\s*>/i,
  /<\s*\/?script\s*>/i,
  /---+\s*system\s*---+/i,
  /give\s+me\s+(free|complimentary)\s+(groom|service|bath)/i,
  /override\s+(pricing|balance|total|checkout)/i,
  /reveal\s+(your\s+)?(hidden\s+)?(instructions|api\s*key|secrets?)/i,
  /[\u202A-\u202E\u2066-\u2069]/,
];

export interface SanitizePetNotesResult {
  sanitizedText: string;
  injectionDetected: boolean;
  detectedSignatures: string[];
  safeAiPromptBlock: string;
}

/**
 * Sanitizes customer-submitted pet behavior notes to neutralize prompt injection attacks.
 * Wraps clean data in an unexecutable boundary sandbox for LLM ingestion.
 * Safe for both browser client components and Node.js server routes.
 */
export function sanitizePetNotesForAI(rawNotes: string): SanitizePetNotesResult {
  if (!rawNotes || typeof rawNotes !== 'string') {
    return {
      sanitizedText: '',
      injectionDetected: false,
      detectedSignatures: [],
      safeAiPromptBlock: '<pet_notes unverified="false"></pet_notes>',
    };
  }

  let text = rawNotes.trim();
  const detectedSignatures: string[] = [];

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      detectedSignatures.push(pattern.source);
      // Neutralize matched attack strings
      text = text.replace(pattern, '[DEFANGED_PROMPT_INJECTION]');
    }
  }

  // Strip raw backticks, curly braces, and dangerous XML delimiters that could confuse LLM parsers
  const sanitized = text
    .replace(/[`${}]/g, '')
    .replace(/<\/?(system|assistant|user|instruction)>/gi, '');

  const injectionDetected = detectedSignatures.length > 0;

  // Construct boundary-contained string safe for prompt insertion
  const safeAiPromptBlock = `<client_provided_pet_notes injection_flagged="${injectionDetected}">\n<![CDATA[\n${sanitized}\n]]>\n</client_provided_pet_notes>`;

  return {
    sanitizedText: sanitized,
    injectionDetected,
    detectedSignatures,
    safeAiPromptBlock,
  };
}
