/**
 * Phase 3 Deterministic Scoring Engine
 * Pure functions for computing player-type scores from axis signals
 */

import {
  AXES,
  PLAYER_TYPES,
  WEIGHT_MATRIX,
  TOTAL_POSSIBLE_WEIGHT,
  NORMALIZATION_BASELINE,
  PER_TYPE_CAP,
  TOTAL_SCENE_CAP,
  Axis,
  PlayerType,
  AxisSignals,
  SceneInput,
  SceneDetail,
  ScoringResult,
  PublicResult,
  AxisContributions,
  createEmptyTypeScores,
} from './constants';

import {
  sum,
  applyPerTypeCap,
  enforceTotalCap,
} from './helpers';

// ============================================================================
// scoreScene: Compute post-cap per-type contributions for a single scene
// ============================================================================

export interface SceneScoreResult {
  axisContributions: AxisContributions;
  preCapTypeContributions: Record<PlayerType, number>;
  postCapTypeContributions: Record<PlayerType, number>;
}

export function scoreScene(axisSignals: AxisSignals): SceneScoreResult {
  // Initialize axis contributions matrix
  const axisContributions: AxisContributions = {};

  // Initialize type contributions
  const preCapTypeContributions = createEmptyTypeScores();

  // For each axis, compute contributions to each type
  for (const axis of AXES) {
    const signalStrength = axisSignals[axis] ?? 0.0;
    
    if (signalStrength === 0) continue;

    const axisWeights = WEIGHT_MATRIX[axis];
    axisContributions[axis] = {};

    for (const type of PLAYER_TYPES) {
      const weight = axisWeights[type] ?? 0;
      
      if (weight === 0) continue;

      const contribution = signalStrength * weight;
      axisContributions[axis][type] = contribution;
      preCapTypeContributions[type] += contribution;
    }
  }

  // Round to avoid floating point drift
  for (const type of PLAYER_TYPES) {
    preCapTypeContributions[type] = Math.round(preCapTypeContributions[type] * 1e10) / 1e10;
  }

  // Apply per-type cap (max 2.5 per type per scene)
  const afterPerTypeCap = applyPerTypeCap(preCapTypeContributions, PER_TYPE_CAP);

  // Apply total scene cap (max 4.0 total per scene) using weakest-first reduction
  const postCapTypeContributions = enforceTotalCap(afterPerTypeCap, TOTAL_SCENE_CAP);

  return {
    axisContributions,
    preCapTypeContributions,
    postCapTypeContributions,
  };
}

// ============================================================================
// accumulateScenes: Sum contributions across all scenes
// ============================================================================

export function accumulateScenes(
  sceneContribs: Array<Record<PlayerType, number>>
): Record<PlayerType, number> {
  const rawScores = createEmptyTypeScores();

  for (const contrib of sceneContribs) {
    for (const type of PLAYER_TYPES) {
      rawScores[type] += contrib[type];
    }
  }

  // Round to avoid floating point drift
  for (const type of PLAYER_TYPES) {
    rawScores[type] = Math.round(rawScores[type] * 1e10) / 1e10;
  }

  return rawScores;
}

// ============================================================================
// normalizeScores: Apply column normalization to correct structural bias
// Formula: normalized = baseline + (raw_score / total_possible_weight)
// ============================================================================

export function normalizeScores(
  rawScores: Record<PlayerType, number>
): Record<PlayerType, number> {
  const normalized = createEmptyTypeScores();

  for (const type of PLAYER_TYPES) {
    const raw = rawScores[type];
    const totalPossible = TOTAL_POSSIBLE_WEIGHT[type];
    normalized[type] = NORMALIZATION_BASELINE + (raw / totalPossible);
  }

  return normalized;
}

// ============================================================================
// toPercentages: Convert normalized scores to percentages summing to 100
// ============================================================================

export function toPercentages(
  normalizedScores: Record<PlayerType, number>
): Record<PlayerType, number> {
  const percentages = createEmptyTypeScores();
  const sumNorm = sum(normalizedScores);

  if (sumNorm === 0) {
    // Edge case: all zeros - distribute equally
    const equalPct = 100 / PLAYER_TYPES.length;
    for (const type of PLAYER_TYPES) {
      percentages[type] = equalPct;
    }
    return percentages;
  }

  for (const type of PLAYER_TYPES) {
    percentages[type] = (normalizedScores[type] / sumNorm) * 100;
  }

  return percentages;
}

// ============================================================================
// scoreSession: Orchestrator function returning full auditable trace
// ============================================================================

export function scoreSession(
  sessionId: string,
  scenes: SceneInput[]
): ScoringResult {
  const perScene: SceneDetail[] = [];
  const sceneContributions: Array<Record<PlayerType, number>> = [];

  // Process each scene
  for (const scene of scenes) {
    const sceneResult = scoreScene(scene.axisSignals);

    perScene.push({
      sceneNumber: scene.sceneNumber,
      axisSignals: scene.axisSignals,
      axisContributions: sceneResult.axisContributions,
      preCapTypeContributions: sceneResult.preCapTypeContributions,
      postCapTypeContributions: sceneResult.postCapTypeContributions,
    });

    sceneContributions.push(sceneResult.postCapTypeContributions);
  }

  // Accumulate across scenes
  const rawScores = accumulateScenes(sceneContributions);

  // Normalize
  const normalizedScores = normalizeScores(rawScores);

  // Convert to percentages
  const percentages = toPercentages(normalizedScores);

  return {
    sessionId,
    perScene,
    rawScores,
    normalizedScores,
    percentages,
  };
}

// ============================================================================
// getPublicResult: Extract user-facing result with top types
// ============================================================================

export function getPublicResult(result: ScoringResult): PublicResult {
  // Sort types by percentage descending, then alphabetically for ties
  const sortedTypes = PLAYER_TYPES
    .map(type => ({ type, pct: result.percentages[type] }))
    .sort((a, b) => {
      const diff = b.pct - a.pct;
      if (Math.abs(diff) < 1e-9) {
        return a.type.localeCompare(b.type);
      }
      return diff;
    });

  return {
    sessionId: result.sessionId,
    percentages: result.percentages,
    topTypes: sortedTypes,
  };
}

// ============================================================================
// Validation functions
// ============================================================================

export function validateSessionInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.sessionId !== 'string') {
    errors.push('sessionId must be a string');
  }

  if (!Array.isArray(obj.scenes)) {
    errors.push('scenes must be an array');
    return { valid: false, errors };
  }

  if (obj.scenes.length !== 12) {
    errors.push(`scenes must have exactly 12 entries, got ${obj.scenes.length}`);
  }

  for (let i = 0; i < obj.scenes.length; i++) {
    const scene = obj.scenes[i] as Record<string, unknown>;
    
    if (typeof scene.sceneNumber !== 'number') {
      errors.push(`Scene ${i}: sceneNumber must be a number`);
    }

    if (!scene.axisSignals || typeof scene.axisSignals !== 'object') {
      errors.push(`Scene ${i}: axisSignals must be an object`);
      continue;
    }

    const signals = scene.axisSignals as Record<string, unknown>;
    for (const axis of AXES) {
      const value = signals[axis];
      if (value !== undefined) {
        if (typeof value !== 'number') {
          errors.push(`Scene ${i}, ${axis}: value must be a number`);
        } else if (![0.0, 0.5, 1.0, 2.0].some(v => Math.abs(v - value) < 1e-9)) {
          errors.push(`Scene ${i}, ${axis}: invalid value ${value}, must be 0, 0.5, 1, or 2`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
