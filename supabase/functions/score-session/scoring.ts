/**
 * Deterministic Scoring Engine - Deno port
 * Pure functions from src/lib/scoring, adapted for edge function use.
 */

// ============================================================================
// Constants
// ============================================================================

export const AXES = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as const;
export type Axis = (typeof AXES)[number];

export const PLAYER_TYPES = [
  "Actor",
  "Explorer",
  "Instigator",
  "PowerGamer",
  "Slayer",
  "Storyteller",
  "Thinker",
  "Watcher",
] as const;
export type PlayerType = (typeof PLAYER_TYPES)[number];

export const WEIGHT_MATRIX: Record<Axis, Partial<Record<PlayerType, number>>> = {
  A1: { Actor: 1.0, Explorer: 0.5, Storyteller: 1.0, Watcher: 0.5 },
  A2: { Explorer: 1.0, Instigator: 0.5, Storyteller: 0.5, Thinker: 0.5 },
  A3: { Actor: 0.5, Explorer: 0.5, Instigator: 1.0, Slayer: 1.0 },
  A4: { Actor: 0.5, PowerGamer: 0.5, Storyteller: 0.5, Thinker: 1.0, Watcher: 0.5 },
  A5: { Actor: 1.0, Instigator: 0.5, Storyteller: 0.5, Watcher: 1.0 },
  A6: { Instigator: 0.5, PowerGamer: 0.5, Slayer: 1.0, Thinker: 0.5 },
  A7: { Actor: 0.5, Instigator: 1.0 },
  A8: { PowerGamer: 1.0, Storyteller: 0.5, Thinker: 1.0 },
  A9: { Actor: 0.5, Instigator: 1.0, Slayer: 1.0, Watcher: 1.0 },
  A10: { Actor: 1.0, Storyteller: 1.0, Watcher: 0.5 },
};

export const TOTAL_POSSIBLE_WEIGHT: Record<PlayerType, number> = {
  Actor: 5.0,
  Instigator: 4.5,
  Storyteller: 4.0,
  Watcher: 3.5,
  Slayer: 3.0,
  Thinker: 3.0,
  Explorer: 2.0,
  PowerGamer: 2.0,
};

const PER_TYPE_CAP = 4.0;
const TOTAL_SCENE_CAP = 8.0;
const NORMALIZATION_BASELINE = 0.0;
const FLOAT_TOLERANCE = 1e-9;

// ============================================================================
// Types
// ============================================================================

export interface AxisSignals {
  [key: string]: number | undefined;
}

interface SceneInput {
  sceneNumber: number;
  axisSignals: AxisSignals;
}

export interface SceneDetail {
  sceneNumber: number;
  axisSignals: AxisSignals;
  axisContributions: Record<string, Partial<Record<PlayerType, number>>>;
  preCapTypeContributions: Record<PlayerType, number>;
  postCapTypeContributions: Record<PlayerType, number>;
}

export interface ScoringResult {
  sessionId: string;
  perScene: SceneDetail[];
  rawScores: Record<PlayerType, number>;
  normalizedScores: Record<PlayerType, number>;
  percentages: Record<PlayerType, number>;
}

export interface PublicResult {
  sessionId: string;
  percentages: Record<PlayerType, number>;
  topTypes: Array<{ type: PlayerType; pct: number }>;
}

// ============================================================================
// Helpers
// ============================================================================

function createEmpty(): Record<PlayerType, number> {
  return { Actor: 0, Explorer: 0, Instigator: 0, PowerGamer: 0, Slayer: 0, Storyteller: 0, Thinker: 0, Watcher: 0 };
}

function sum(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

function applyPerTypeCap(contribs: Record<PlayerType, number>): Record<PlayerType, number> {
  const r = { ...contribs };
  for (const t of PLAYER_TYPES) {
    if (r[t] > PER_TYPE_CAP) r[t] = PER_TYPE_CAP;
  }
  return r;
}

function enforceTotalCap(contribs: Record<PlayerType, number>): Record<PlayerType, number> {
  const r = { ...contribs };
  let total = sum(r);
  if (total <= TOTAL_SCENE_CAP) return r;
  let over = total - TOTAL_SCENE_CAP;

  while (over > FLOAT_TOLERANCE) {
    const sorted = PLAYER_TYPES.filter((t) => r[t] > FLOAT_TOLERANCE).sort((a, b) => {
      const d = r[a] - r[b];
      return Math.abs(d) < FLOAT_TOLERANCE ? a.localeCompare(b) : d;
    });
    if (sorted.length === 0) break;
    for (const t of sorted) {
      if (over <= FLOAT_TOLERANCE) break;
      const red = Math.min(r[t], over);
      r[t] -= red;
      over -= red;
      r[t] = Math.round(r[t] * 1e10) / 1e10;
      over = Math.round(over * 1e10) / 1e10;
    }
  }

  const finalTotal = sum(r);
  if (Math.abs(finalTotal - TOTAL_SCENE_CAP) > FLOAT_TOLERANCE && finalTotal > 0) {
    const largest = PLAYER_TYPES.filter((t) => r[t] > 0).sort((a, b) => r[b] - r[a])[0];
    if (largest) {
      r[largest] -= finalTotal - TOTAL_SCENE_CAP;
      r[largest] = Math.round(r[largest] * 1e10) / 1e10;
    }
  }
  return r;
}

// ============================================================================
// Core scoring functions
// ============================================================================

function scoreScene(axisSignals: AxisSignals) {
  const axisCont: Record<string, Partial<Record<PlayerType, number>>> = {};
  const preCap = createEmpty();

  for (const axis of AXES) {
    const sig = axisSignals[axis] ?? 0;
    if (sig === 0) continue;
    const weights = WEIGHT_MATRIX[axis];
    axisCont[axis] = {};
    for (const t of PLAYER_TYPES) {
      const w = weights[t] ?? 0;
      if (w === 0) continue;
      const c = sig * w;
      axisCont[axis][t] = c;
      preCap[t] += c;
    }
  }

  for (const t of PLAYER_TYPES) preCap[t] = Math.round(preCap[t] * 1e10) / 1e10;
  const afterTypeCap = applyPerTypeCap(preCap);
  const postCap = enforceTotalCap(afterTypeCap);

  return { axisContributions: axisCont, preCapTypeContributions: preCap, postCapTypeContributions: postCap };
}

export function scoreSession(sessionId: string, scenes: SceneInput[]): ScoringResult {
  const perScene: SceneDetail[] = [];
  const rawScores = createEmpty();

  for (const scene of scenes) {
    const r = scoreScene(scene.axisSignals);
    perScene.push({
      sceneNumber: scene.sceneNumber,
      axisSignals: scene.axisSignals,
      ...r,
    });
    for (const t of PLAYER_TYPES) rawScores[t] += r.postCapTypeContributions[t];
  }

  for (const t of PLAYER_TYPES) rawScores[t] = Math.round(rawScores[t] * 1e10) / 1e10;

  const normalizedScores = createEmpty();
  for (const t of PLAYER_TYPES) {
    normalizedScores[t] = NORMALIZATION_BASELINE + rawScores[t] / TOTAL_POSSIBLE_WEIGHT[t];
  }

  const percentages = createEmpty();
  const sumNorm = sum(normalizedScores);
  if (sumNorm === 0) {
    const eq = 100 / PLAYER_TYPES.length;
    for (const t of PLAYER_TYPES) percentages[t] = eq;
  } else {
    for (const t of PLAYER_TYPES) percentages[t] = (normalizedScores[t] / sumNorm) * 100;
  }

  return { sessionId, perScene, rawScores, normalizedScores, percentages };
}

export function getPublicResult(result: ScoringResult): PublicResult {
  const sorted = PLAYER_TYPES.map((t) => ({ type: t, pct: result.percentages[t] })).sort((a, b) => {
    const d = b.pct - a.pct;
    return Math.abs(d) < FLOAT_TOLERANCE ? a.type.localeCompare(b.type) : d;
  });
  return { sessionId: result.sessionId, percentages: result.percentages, topTypes: sorted };
}
