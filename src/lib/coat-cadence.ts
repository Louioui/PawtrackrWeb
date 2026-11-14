// ============================================================================
// PAWTRACKR WEB — BREED COAT-CYCLE RECALL & RETENTION CADENCE ENGINE
// Coat science algorithms, matting risk scoring, and automated recall cadences.
// All financial figures computed in fixed-point integer cents (pos-math invariant).
// ============================================================================

export type CoatArchetype =
  | 'curled_fleece'
  | 'double_coat'
  | 'silky_drop'
  | 'wire_coat'
  | 'smooth_short';

export type MattingRiskLevel = 'critical' | 'elevated' | 'on_track';

export interface CoatArchetypeInfo {
  archetype: CoatArchetype;
  label: string;
  defaultCadenceWeeks: number;
  criticalThresholdWeeks: number;
  mattingHazardDescription: string;
  recommendedService: string;
}

export interface CoatCadenceStatus {
  breed: string;
  archetype: CoatArchetype;
  archetypeLabel: string;
  recommendedCadenceWeeks: number;
  weeksSinceLastGroom: number;
  overdueWeeks: number;
  overdueDays: number;
  mattingRiskLevel: MattingRiskLevel;
  careRecommendation: string;
  isRecallDue: boolean;
  priorityScore: number;
}

export interface CoatRecallCandidate {
  id: string;
  clientId: string;
  clientName: string;
  phone: string;
  email?: string | null;
  petId: string;
  petName: string;
  breed: string;
  lastVisitId?: string | null;
  lastGroomDate: string;
  lastPackagePriceCents: number;
  behaviorTags?: string[];
  cadenceStatus: CoatCadenceStatus;
}

// ----------------------------------------------------------------------------
// COAT ARCHETYPE DICTIONARY & BREED MAPPINGS
// ----------------------------------------------------------------------------

export const COAT_ARCHETYPES: Record<CoatArchetype, CoatArchetypeInfo> = {
  curled_fleece: {
    archetype: 'curled_fleece',
    label: 'Curled Fleece / Continuous Growth',
    defaultCadenceWeeks: 5,
    criticalThresholdWeeks: 6.5,
    mattingHazardDescription:
      'High velocity pelt matting in friction zones (ears, collar, armpits). Requires 4-5 week cycle.',
    recommendedService: 'Full Coat Sculpt & Conditioning Hydrobath',
  },
  double_coat: {
    archetype: 'double_coat',
    label: 'Double Coat / Seasonal Shedding',
    defaultCadenceWeeks: 7,
    criticalThresholdWeeks: 9.0,
    mattingHazardDescription:
      'Undercoat compaction obstructing dermal airflow and thermoregulation. Requires high-velocity deshedding.',
    recommendedService: 'High-Velocity Deshed & Botanical Spa Blowout',
  },
  silky_drop: {
    archetype: 'silky_drop',
    label: 'Silky Drop Coat',
    defaultCadenceWeeks: 5,
    criticalThresholdWeeks: 6.5,
    mattingHazardDescription:
      'Single-layer hair knots easily into tight tangles near eyes, beard, and feet.',
    recommendedService: 'Stylist Maintenance Trim & Nourishing Silk Bath',
  },
  wire_coat: {
    archetype: 'wire_coat',
    label: 'Wire Coat / Hand-Strip',
    defaultCadenceWeeks: 7,
    criticalThresholdWeeks: 8.5,
    mattingHazardDescription:
      'Blown topcoat loses water-repellent texture and accumulates dander.',
    recommendedService: 'Wire Carding / Hand-Strip or Full Precision Clip',
  },
  smooth_short: {
    archetype: 'smooth_short',
    label: 'Smooth Short Coat',
    defaultCadenceWeeks: 8,
    criticalThresholdWeeks: 10.0,
    mattingHazardDescription:
      'Dead follicular shedding, sebaceous buildup, and rapid nail elongation.',
    recommendedService: 'Hydro-Massage Bath, Deshed & Pawdicure Treatment',
  },
};

const BREED_PATTERNS: Array<{ pattern: RegExp; archetype: CoatArchetype; customWeeks?: number }> = [
  // Curled Fleece & Doodles (4-5 weeks)
  { pattern: /poodle|doodle|poo$|bichon|lagotto|water\s*dog|barbet|havapoo|cavapoo/i, archetype: 'curled_fleece' },
  { pattern: /goldendoodle|labradoodle|bernedoodle|aussiedoodle|sheepadoodle/i, archetype: 'curled_fleece' },

  // Double Coat (6-8 weeks)
  { pattern: /husky|malamute|samoyed|eskimo|spitz|chow/i, archetype: 'double_coat', customWeeks: 6 },
  { pattern: /shepherd|malinois|golden\s*retriever|great\s*pyrenees|newfoundland|bernese/i, archetype: 'double_coat', customWeeks: 7 },
  { pattern: /pomeranian|corgi|shiba|akita|australian\s*shepherd|aussie(?!\s*doodle)|collie|sheltie|border\s*collie/i, archetype: 'double_coat', customWeeks: 6 },
  { pattern: /keeshond|tibetan\s*mastiff|saint\s*bernard/i, archetype: 'double_coat', customWeeks: 7 },

  // Silky Drop Coat (4-6 weeks)
  { pattern: /yorkie|yorkshire|maltese|shih\s*tzu|lhasa|havanese|afghan|pekingese|cavalier/i, archetype: 'silky_drop', customWeeks: 5 },
  { pattern: /cocker\s*spaniel|springer\s*spaniel|setter/i, archetype: 'silky_drop', customWeeks: 6 },

  // Wire Coat (6-8 weeks)
  { pattern: /schnauzer|airedale|scottish\s*terrier|westie|west\s*highland|cairn|wire\s*fox|border\s*terrier|dandie/i, archetype: 'wire_coat', customWeeks: 6 },

  // Smooth Short Coat (8-10 weeks)
  { pattern: /french\s*bulldog|frenchie|bulldog|pug|boxer|boston\s*terrier|doberman|rottweiler|pitbull|staffordshire|chihuahua|dalmatian|beagle|dachshund/i, archetype: 'smooth_short', customWeeks: 8 },
  { pattern: /pointer|weimaraner|vizsla|greyhound|whippet|great\s*dane|basset/i, archetype: 'smooth_short', customWeeks: 8 },
];

/**
 * Identifies the coat archetype and default cadence for a given breed name.
 */
export function identifyCoatArchetype(breedName: string): CoatArchetypeInfo & { customWeeks?: number } {
  if (!breedName || typeof breedName !== 'string') {
    return { ...COAT_ARCHETYPES.curled_fleece };
  }

  const clean = breedName.trim();
  for (const entry of BREED_PATTERNS) {
    if (entry.pattern.test(clean)) {
      const base = COAT_ARCHETYPES[entry.archetype];
      return {
        ...base,
        defaultCadenceWeeks: entry.customWeeks ?? base.defaultCadenceWeeks,
      };
    }
  }

  // Safe conservative default for unknown pet salon breeds
  return { ...COAT_ARCHETYPES.curled_fleece };
}

/**
 * Calculates real-time coat cadence and matting hazard status.
 */
export function calculateCoatCadenceStatus(params: {
  petBreed: string;
  lastGroomDate: string | Date;
  referenceDate?: string | Date;
  customCadenceWeeks?: number | null;
}): CoatCadenceStatus {
  const { petBreed, lastGroomDate, referenceDate = new Date(), customCadenceWeeks } = params;

  const archetypeInfo = identifyCoatArchetype(petBreed);
  const recommendedCadenceWeeks =
    customCadenceWeeks && customCadenceWeeks > 0
      ? customCadenceWeeks
      : archetypeInfo.defaultCadenceWeeks;

  const lastGroomTime = new Date(lastGroomDate).getTime();
  const refTime = new Date(referenceDate).getTime();
  const diffMs = Math.max(0, refTime - lastGroomTime);
  const diffDays = Math.floor(diffMs / 86400000);
  const weeksSinceLastGroom = Math.round((diffDays / 7) * 10) / 10;

  const overdueWeeks = Math.round(Math.max(0, weeksSinceLastGroom - recommendedCadenceWeeks) * 10) / 10;
  const overdueDays = Math.max(0, diffDays - recommendedCadenceWeeks * 7);

  // Assess Matting Hazard Level
  let mattingRiskLevel: MattingRiskLevel = 'on_track';
  if (weeksSinceLastGroom >= archetypeInfo.criticalThresholdWeeks) {
    mattingRiskLevel = 'critical';
  } else if (weeksSinceLastGroom >= recommendedCadenceWeeks) {
    mattingRiskLevel = 'elevated';
  }

  const isRecallDue = weeksSinceLastGroom >= recommendedCadenceWeeks;

  // Priority Score (0-100+) for recall sorting
  const baseScore = isRecallDue ? 50 : 10;
  const overdueBonus = Math.min(40, overdueDays * 2);
  const riskBonus = mattingRiskLevel === 'critical' ? 25 : mattingRiskLevel === 'elevated' ? 10 : 0;
  const priorityScore = baseScore + overdueBonus + riskBonus;

  let careRecommendation = `Coat on cadence. Next recommended refresh around ${recommendedCadenceWeeks} weeks.`;
  if (mattingRiskLevel === 'critical') {
    careRecommendation = `URGENT: ${weeksSinceLastGroom} weeks elapsed. ${archetypeInfo.mattingHazardDescription}`;
  } else if (mattingRiskLevel === 'elevated') {
    careRecommendation = `DUE: Maintenance window reached (${weeksSinceLastGroom}w vs ${recommendedCadenceWeeks}w recommended).`;
  }

  return {
    breed: petBreed,
    archetype: archetypeInfo.archetype,
    archetypeLabel: archetypeInfo.label,
    recommendedCadenceWeeks,
    weeksSinceLastGroom,
    overdueWeeks,
    overdueDays,
    mattingRiskLevel,
    careRecommendation,
    isRecallDue,
    priorityScore,
  };
}

/**
 * Generates an automated, conversion-optimized SMS recall notification.
 */
export function generateCoatRecallSms(params: {
  clientName: string;
  petName: string;
  breed: string;
  weeksSinceLastGroom: number;
  salonName: string;
  bookingUrl: string;
}): string {
  const { clientName, petName, breed, weeksSinceLastGroom, salonName, bookingUrl } = params;
  const archetypeInfo = identifyCoatArchetype(breed);

  let urgencyTone = `it has been ${weeksSinceLastGroom} weeks since ${petName}’s last groom.`;
  if (archetypeInfo.archetype === 'curled_fleece') {
    urgencyTone = `to preserve ${petName}’s coat length and prevent friction tangling, their ${archetypeInfo.defaultCadenceWeeks}-week refresh is due.`;
  } else if (archetypeInfo.archetype === 'double_coat') {
    urgencyTone = `${petName} is due for seasonal deshedding to keep their undercoat light and healthy.`;
  }

  return `Hi ${clientName}! From ${salonName}: Based on ${petName}’s coat cycle, ${urgencyTone} Reserve your preferred table here: ${bookingUrl} (Reply STOP to opt out)`;
}

/**
 * Computes exact recapturable revenue across candidates in integer cents ($0.00 drift).
 */
export function estimateRecapturableRevenueCents(candidates: CoatRecallCandidate[]): number {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0;
  return candidates.reduce((sum, c) => {
    const price = Math.max(0, Math.floor(c.lastPackagePriceCents || 0));
    return sum + price;
  }, 0);
}
