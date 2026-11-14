// ============================================================================
// PAWTRACKR WEB — AUTONOMOUS AI VOICE RECEPTIONIST (WHISPER INTAKE PARSER)
// Browser & Server safe structured grooming intake extractor with strict
// adversarial prompt-injection neutralization.
// ============================================================================

export type CoatRecallCategory = 'doodle_poodle' | 'double_coat' | 'short_smooth';

export interface StructuredVoiceBookingIntake {
  sanitizedTranscript: string;
  promptInjectionBlocked: boolean;
  blockedPatterns: string[];
  clientName: string;
  clientPhone: string;
  petName: string;
  breed: string;
  coatCategory: CoatRecallCategory;
  recommendedCadenceWeeks: number;
  requestedService: string;
  estimatedPriceCents: number;
  preferredSlotLabel: string;
  safetyFlags: Array<'anxious' | 'matted' | 'senior' | 'biter' | 'extra_care'>;
  receptionistSmsReply: string;
  confidenceScore: number;
}

const VOICE_INJECTION_RULES: Array<{ name: string; regex: RegExp }> = [
  { name: 'system_override', regex: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi },
  { name: 'role_hijack', regex: /you\s+are\s+now\s+(a|an|in)?\s*(developer|admin|system|unrestricted|dan\b)/gi },
  { name: 'system_delimiter', regex: /(<\s*\/?\s*system\s*>|\[\s*SYSTEM\s*\]|###\s*INSTRUCTION)/gi },
  { name: 'secret_exfiltration', regex: /(reveal|print|output|dump|leak)\s+(the\s+)?(api\s*key|secret|service_role|jwt|env|password)/gi },
  { name: 'price_tampering', regex: /(set|override|change)\s+(the\s+)?(price|total|discount|commission)\s+to\s+\$?0/gi },
  { name: 'bidi_control', regex: /[\u202A-\u202E\u2066-\u2069]/g },
];

const BREED_CATALOG: Array<{
  pattern: RegExp;
  label: string;
  coat: CoatRecallCategory;
  cadenceWeeks: number;
  baseCents: number;
}> = [
  { pattern: /\bgoldendoodle\b/i, label: 'Goldendoodle', coat: 'doodle_poodle', cadenceWeeks: 6, baseCents: 16500 },
  { pattern: /\blabradoodle\b/i, label: 'Labradoodle', coat: 'doodle_poodle', cadenceWeeks: 6, baseCents: 16500 },
  { pattern: /\baussiedoodle\b/i, label: 'Aussiedoodle', coat: 'doodle_poodle', cadenceWeeks: 6, baseCents: 16000 },
  { pattern: /\bbernedoodle\b/i, label: 'Bernedoodle', coat: 'doodle_poodle', cadenceWeeks: 6, baseCents: 17500 },
  { pattern: /\bcavapoo\b/i, label: 'Cavapoo', coat: 'doodle_poodle', cadenceWeeks: 6, baseCents: 12500 },
  { pattern: /\bpoodle\b/i, label: 'Standard Poodle', coat: 'doodle_poodle', cadenceWeeks: 6, baseCents: 17000 },
  { pattern: /\bbichon\b/i, label: 'Bichon Frise', coat: 'doodle_poodle', cadenceWeeks: 6, baseCents: 11500 },
  { pattern: /\bhusky\b/i, label: 'Siberian Husky', coat: 'double_coat', cadenceWeeks: 8, baseCents: 15500 },
  { pattern: /\bgolden\s+retriever\b/i, label: 'Golden Retriever', coat: 'double_coat', cadenceWeeks: 8, baseCents: 14500 },
  { pattern: /\bgerman\s+shepherd\b/i, label: 'German Shepherd', coat: 'double_coat', cadenceWeeks: 8, baseCents: 15000 },
  { pattern: /\bshiba(\s+inu)?\b/i, label: 'Shiba Inu', coat: 'double_coat', cadenceWeeks: 8, baseCents: 13000 },
  { pattern: /\bpomeranian\b/i, label: 'Pomeranian', coat: 'double_coat', cadenceWeeks: 8, baseCents: 11000 },
  { pattern: /\bcorgi\b/i, label: 'Pembroke Welsh Corgi', coat: 'double_coat', cadenceWeeks: 8, baseCents: 12000 },
  { pattern: /\bfrench\s+bulldog\b|\bfrenchie\b/i, label: 'French Bulldog', coat: 'short_smooth', cadenceWeeks: 10, baseCents: 9500 },
  { pattern: /\bbeagle\b/i, label: 'Beagle', coat: 'short_smooth', cadenceWeeks: 10, baseCents: 9000 },
  { pattern: /\bboxer\b/i, label: 'Boxer', coat: 'short_smooth', cadenceWeeks: 10, baseCents: 10500 },
  { pattern: /\bdachshund\b/i, label: 'Dachshund', coat: 'short_smooth', cadenceWeeks: 10, baseCents: 8500 },
];

/**
 * Sanitizes a raw Whisper voice transcript and extracts structured salon
 * booking details in deterministic integer cents.
 */
export function extractStructuredVoiceIntake(rawTranscript: string): StructuredVoiceBookingIntake {
  const truncated = String(rawTranscript ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .slice(0, 4000);

  let cleaned = truncated;
  const blockedPatterns: string[] = [];

  for (const rule of VOICE_INJECTION_RULES) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(cleaned)) {
      blockedPatterns.push(rule.name);
      rule.regex.lastIndex = 0;
      cleaned = cleaned.replace(rule.regex, '[REDACTED_ADVERSARIAL_DIRECTIVE]');
    }
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Extract phone number if spoken/transcribed
  const phoneMatch = cleaned.match(/(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
  const clientPhone = phoneMatch ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}` : 'Caller ID Verified';

  // Extract client name: "this is Name", "my name is Name", "I'm Name"
  const clientMatch = cleaned.match(
    /\b(?:this\s+is|my\s+name\s+is|i\s+am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/
  );
  const clientName = clientMatch ? clientMatch[1].trim() : 'Inbound Voice Caller';

  // Extract breed
  let matchedBreed = {
    label: 'Mixed Breed Companion',
    coat: 'doodle_poodle' as CoatRecallCategory,
    cadenceWeeks: 6,
    baseCents: 13500,
  };
  let breedDetected = false;
  for (const b of BREED_CATALOG) {
    if (b.pattern.test(cleaned)) {
      matchedBreed = {
        label: b.label,
        coat: b.coat,
        cadenceWeeks: b.cadenceWeeks,
        baseCents: b.baseCents,
      };
      breedDetected = true;
      break;
    }
  }

  // Extract pet name: "my <breed> <PetName>", "for <PetName>", "named <PetName>"
  const petMatch =
    cleaned.match(/\bnamed\s+([A-Z][a-z]{1,20})\b/) ||
    cleaned.match(/\bmy\s+(?:[a-z]+\s+){0,2}(?:dog|pup|puppy|doodle|poodle|husky|retriever|frenchie|bulldog|shiba)\s+([A-Z][a-z]{1,20})\b/i) ||
    cleaned.match(/\bbook\s+([A-Z][a-z]{1,20})\s+for\b/);
  const candidatePet = petMatch?.[1] ? petMatch[1].trim() : '';
  const petName =
    candidatePet && !/^(Friday|Monday|Tuesday|Wednesday|Thursday|Saturday|Sunday|Tomorrow|Today)$/i.test(candidatePet)
      ? candidatePet[0].toUpperCase() + candidatePet.slice(1)
      : 'Bello';

  // Extract service package & integer-cent add-ons
  let requestedService = 'Signature Full Groom & Hydro-Bath';
  let addonCents = 0;

  if (/\bteddy\s+bear\b|\bfull\s+scissor\b/i.test(cleaned)) {
    requestedService = 'Full Scissor Teddy Bear Trim & Hydro-Bath';
    addonCents += 2000;
  } else if (/\bdeshed|\bundercoat|\bblowout/i.test(cleaned)) {
    requestedService = 'De-Shedding Undercoat Blowout & Warm Bath';
    addonCents += 1500;
  } else if (/\bbath\s+only|\bsanitary\s+trim/i.test(cleaned)) {
    requestedService = 'Luxury Hydro-Bath & Sanitary Tidy';
    addonCents -= 2500;
  }

  if (/\bnail\s+grind|\bdremel/i.test(cleaned)) {
    requestedService += ' + Nail Grind';
    addonCents += 1800;
  }
  if (/\bteeth|\bdental/i.test(cleaned)) {
    requestedService += ' + Enzymatic Dental';
    addonCents += 1500;
  }

  // Extract behavioral & coat safety flags
  const safetyFlags: StructuredVoiceBookingIntake['safetyFlags'] = [];
  if (/\banxious|\bnervous|\bscared\b|\bdryer/i.test(cleaned)) safetyFlags.push('anxious');
  if (/\bmatted|\bmats|\bknot|\btangled/i.test(cleaned)) {
    safetyFlags.push('matted');
    addonCents += 2500; // Matted coat care buffer
  }
  if (/\bsenior|\bold\b|\barthrit|\b1[2-9]\s+year/i.test(cleaned)) safetyFlags.push('senior');
  if (/\bbite|\bsnap|\bmuzzle|\breactive/i.test(cleaned)) safetyFlags.push('biter');
  if (/\bsensitive|\ballerg|\bhypoallergenic/i.test(cleaned)) safetyFlags.push('extra_care');

  const estimatedPriceCents = Math.max(4500, matchedBreed.baseCents + addonCents);

  // Extract preferred day/time
  const dayMatch = cleaned.match(
    /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week)\b/i
  );
  const timeMatch = cleaned.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|morning|afternoon)\b/i);
  const preferredSlotLabel = [
    dayMatch ? dayMatch[1][0].toUpperCase() + dayMatch[1].slice(1) : 'Next Available Slot',
    timeMatch ? timeMatch[1].toUpperCase().replace(/\./g, '') : '10:00 AM',
  ].join(' • ');

  let confidence = 0.72;
  if (breedDetected) confidence += 0.1;
  if (clientMatch) confidence += 0.08;
  if (dayMatch || timeMatch) confidence += 0.06;
  if (blockedPatterns.length > 0) confidence = Math.max(0.55, confidence - 0.15);
  const confidenceScore = Math.min(0.99, Math.round(confidence * 100) / 100);

  const dollarsFormatted = (estimatedPriceCents / 100).toFixed(2);
  const receptionistSmsReply = `Hi ${clientName.split(' ')[0]}! Our Pawtrackr Voice Concierge prepared ${petName}'s ${requestedService} (${preferredSlotLabel}, est. $${dollarsFormatted}). Tap your encrypted confirmation link to lock in your slot!`;

  return {
    sanitizedTranscript: cleaned,
    promptInjectionBlocked: blockedPatterns.length > 0,
    blockedPatterns,
    clientName,
    clientPhone,
    petName,
    breed: matchedBreed.label,
    coatCategory: matchedBreed.coat,
    recommendedCadenceWeeks: matchedBreed.cadenceWeeks,
    requestedService,
    estimatedPriceCents,
    preferredSlotLabel,
    safetyFlags,
    receptionistSmsReply,
    confidenceScore,
  };
}
