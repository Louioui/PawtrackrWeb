// ============================================================================
// PAWTRACKR WEB — SUB-10MS MULTI-TOKEN IN-MEMORY SEARCH ENGINE
// Inspired by Pawtrackr iOS: simultaneously matches partial dog names,
// client names, unformatted phone digits, breeds, and behavior aura tags.
// ============================================================================

import type { Client, Pet, Visit } from '@/types/database';

export interface SearchableSalonRecord {
  pet: Pet;
  client: Client;
  activeVisit?: Visit;
  /** Pre-computed normalized search corpus for sub-millisecond matching */
  normalizedCorpus: string;
  normalizedDigits: string;
}

export interface MultiTokenSearchResult {
  record: SearchableSalonRecord;
  matchedTokens: string[];
  score: number;
}

export interface SearchExecutionReport {
  results: MultiTokenSearchResult[];
  elapsedMs: number;
  tokens: string[];
  totalIndexed: number;
}

/**
 * Normalizes text by lowercasing and stripping diacritics/punctuation.
 */
function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Extracts raw numeric digits from phone strings so "4829" matches "(415) 890-4829".
 */
function extractDigits(input: string): string {
  return input.replace(/\D+/g, '');
}

/**
 * Builds the pre-tokenized index for a specific salon (`business_id`).
 */
export function buildSalonSearchIndex(
  businessId: string,
  pets: Pet[],
  clients: Client[],
  visits: Visit[]
): SearchableSalonRecord[] {
  const clientMap = new Map<string, Client>();
  for (const client of clients) {
    if (client.business_id === businessId) {
      clientMap.set(client.id, client);
    }
  }

  const visitByPet = new Map<string, Visit>();
  for (const visit of visits) {
    if (visit.business_id === businessId) {
      visitByPet.set(visit.pet_id, visit);
    }
  }

  const indexed: SearchableSalonRecord[] = [];

  for (const pet of pets) {
    if (pet.business_id !== businessId) continue;
    const client = clientMap.get(pet.client_id);
    if (!client) continue;

    const activeVisit = visitByPet.get(pet.id);
    const digits = extractDigits(client.phone);

    const corpusParts = [
      pet.name,
      pet.breed,
      pet.species,
      pet.coat_type,
      pet.behavior_notes,
      ...pet.behavior_tags,
      ...pet.behavior_tags.map((t) => t.replace('_', ' ')),
      client.name,
      client.phone,
      digits,
      client.email,
      activeVisit?.package_name ?? '',
      activeVisit?.status ?? '',
    ];

    indexed.push({
      pet,
      client,
      activeVisit,
      normalizedCorpus: normalizeText(corpusParts.join(' ')),
      normalizedDigits: digits,
    });
  }

  return indexed;
}

/**
 * Executes a conjunctive (AND) multi-token query across the pre-indexed salon records
 * in sub-millisecond time, ranking exact/prefix matches highest.
 */
export function executeMultiTokenSearch(
  index: SearchableSalonRecord[],
  rawQuery: string
): SearchExecutionReport {
  const start =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const normalizedQuery = normalizeText(rawQuery);
  const tokens = normalizedQuery
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    const end =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      results: index.map((record) => ({
        record,
        matchedTokens: [],
        score: 1,
      })),
      elapsedMs: Number(Math.max(0.08, end - start).toFixed(2)),
      tokens: [],
      totalIndexed: index.length,
    };
  }

  const matchedResults: MultiTokenSearchResult[] = [];

  for (let i = 0; i < index.length; i++) {
    const item = index[i];
    let allMatched = true;
    let score = 0;
    const matchedTokens: string[] = [];

    const petNameLower = item.pet.name.toLowerCase();
    const breedLower = item.pet.breed.toLowerCase();
    const clientNameLower = item.client.name.toLowerCase();

    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t];
      const tokenDigits = extractDigits(token);

      const inCorpus = item.normalizedCorpus.includes(token);
      const inDigits =
        tokenDigits.length >= 2 && item.normalizedDigits.includes(tokenDigits);

      if (!inCorpus && !inDigits) {
        allMatched = false;
        break;
      }

      matchedTokens.push(token);

      // Relevance boosting
      if (petNameLower.startsWith(token)) {
        score += 50;
      } else if (petNameLower.includes(token)) {
        score += 30;
      }

      if (inDigits) {
        score += 40;
      }

      if (breedLower.includes(token)) {
        score += 25;
      }

      if (clientNameLower.includes(token)) {
        score += 20;
      }

      if (item.pet.behavior_tags.some((tag) => tag.includes(token))) {
        score += 35;
      }
    }

    if (allMatched) {
      matchedResults.push({
        record: item,
        matchedTokens,
        score,
      });
    }
  }

  matchedResults.sort((a, b) => b.score - a.score);

  const end =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    results: matchedResults,
    elapsedMs: Number(Math.max(0.11, end - start).toFixed(2)),
    tokens,
    totalIndexed: index.length,
  };
}
