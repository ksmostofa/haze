export const BUILD_ID = "haze-20260811-global-v1";
export const ACTIVE_SEASON = "night-1";
export const EXPECTED_KILLS = 69;
export const MIN_RUN_MS = 90_000;
export const MAX_RUN_MS = 7_200_000;

const EXPECTED_SPLITS = 6;
const TYPES = {
  shambler: { score: 100 },
  runner: { score: 150 },
  brute: { score: 400 },
};
const HP_MULTIPLIERS = [.85, 1.35, .7, 1, 1.12, 1.2, .72, 1.05, 1.3, 1.65];
const WAVES = [
  { shambler: 6, runner: 0, brute: 0 },
  { shambler: 7, runner: 2, brute: 0 },
  { shambler: 8, runner: 3, brute: 0 },
  { shambler: 9, runner: 4, brute: 1 },
  { shambler: 10, runner: 5, brute: 1 },
  { shambler: 8, runner: 4, brute: 1 },
];

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function cleanName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const length = Array.from(normalized).length;
  if (length < 1 || length > 16) return null;
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(normalized)) return null;
  return normalized;
}

function proofError(message) {
  return { ok: false, error: message };
}

export function validateProof(proof, serverElapsedMs) {
  if (!proof || typeof proof !== "object" || !Array.isArray(proof.kills) || !Array.isArray(proof.waveSplits)) {
    return proofError("Run proof is missing");
  }
  if (proof.kills.length !== EXPECTED_KILLS || proof.waveSplits.length !== EXPECTED_SPLITS) {
    return proofError("Run proof has the wrong event count");
  }

  const ids = new Set();
  const variants = Array(10).fill(0);
  const waveCounts = WAVES.map(() => ({ shambler: 0, runner: 0, brute: 0 }));
  const maxKillAt = Array(EXPECTED_SPLITS).fill(-1);
  let score = 0;

  for (const event of proof.kills) {
    if (!event || typeof event !== "object" || !integer(event.id, 1, EXPECTED_KILLS) || ids.has(event.id)) {
      return proofError("Run proof contains an invalid enemy ID");
    }
    if (!integer(event.wave, 1, EXPECTED_SPLITS) || !Object.hasOwn(TYPES, event.type) || !integer(event.variant, 0, 9)) {
      return proofError("Run proof contains an invalid enemy");
    }
    if (!integer(event.spawnedAtMs, 0, MAX_RUN_MS) || !integer(event.atMs, 0, MAX_RUN_MS) || event.atMs < event.spawnedAtMs) {
      return proofError("Run proof contains an invalid event time");
    }
    ids.add(event.id);
    variants[event.variant]++;
    waveCounts[event.wave - 1][event.type]++;
    maxKillAt[event.wave - 1] = Math.max(maxKillAt[event.wave - 1], event.atMs);
    score += Math.round(TYPES[event.type].score * (.8 + HP_MULTIPLIERS[event.variant] * .35));
  }
  for (let id = 1; id <= EXPECTED_KILLS; id++) if (!ids.has(id)) return proofError("Run proof is incomplete");

  for (let index = 0; index < WAVES.length; index++) {
    for (const type of Object.keys(TYPES)) {
      if (waveCounts[index][type] !== WAVES[index][type]) return proofError("Run proof has an invalid wave composition");
    }
  }
  const expectedVariants = [7, 7, 7, 7, 7, 7, 7, 7, 6, 7];
  if (variants.some((count, index) => count !== expectedVariants[index])) return proofError("Run proof has an invalid enemy sequence");

  let previousSplit = -1;
  for (let index = 0; index < proof.waveSplits.length; index++) {
    const split = proof.waveSplits[index];
    if (!split || split.wave !== index + 1 || !integer(split.atMs, 0, MAX_RUN_MS) || split.atMs <= previousSplit) {
      return proofError("Run proof has invalid wave splits");
    }
    if (maxKillAt[index] < 0 || split.atMs < maxKillAt[index] || split.atMs - maxKillAt[index] > 1_500) {
      return proofError("Run proof has an inconsistent wave split");
    }
    if (index > 0) {
      for (const event of proof.kills) {
        if (event.wave === index + 1 && event.spawnedAtMs < previousSplit) return proofError("Run proof crosses wave boundaries");
      }
    }
    previousSplit = split.atMs;
  }
  if (!integer(serverElapsedMs, MIN_RUN_MS, MAX_RUN_MS) || previousSplit > serverElapsedMs + 1_500) {
    return proofError("Run proof does not match server time");
  }
  return { ok: true, score, kills: EXPECTED_KILLS, finalSplitMs: previousSplit };
}
