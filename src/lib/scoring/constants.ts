/**
 * Phase 3 Scoring Engine Constants
 * Canonical constants for deterministic player-type scoring
 */

// ============================================================================
// AXIS DEFINITIONS (A1..A10)
// ============================================================================

export const AXES = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'
] as const;

export type Axis = typeof AXES[number];

export const AXIS_NAMES: Record<Axis, string> = {
  A1: 'Narrative Motivation',
  A2: 'Exploration Drive',
  A3: 'Risk Tolerance',
  A4: 'Cognitive Style',
  A5: 'Spotlight Comfort',
  A6: 'Combat Engagement',
  A7: 'Chaos Tolerance',
  A8: 'Rules Orientation',
  A9: 'Stimulation Need',
  A10: 'Character Identification',
};

// ============================================================================
// PLAYER TYPES (alphabetical for deterministic ordering)
// ============================================================================

export const PLAYER_TYPES = [
  'Actor',
  'Explorer',
  'Instigator',
  'PowerGamer',
  'Slayer',
  'Storyteller',
  'Thinker',
  'Watcher',
] as const;

export type PlayerType = typeof PLAYER_TYPES[number];

// ============================================================================
// SIGNAL STRENGTH MAPPING
// ============================================================================

export const SIGNAL_VALUES = {
  none: 0.0,
  weak: 0.5,
  medium: 1.0,
  strong: 2.0,
} as const;

export type SignalLabel = keyof typeof SIGNAL_VALUES;
export type SignalValue = typeof SIGNAL_VALUES[SignalLabel];

export const VALID_SIGNAL_VALUES = [0.0, 0.5, 1.0, 2.0] as const;

// ============================================================================
// AXIS → TYPE WEIGHT MATRIX
// Weights ∈ {0, 0.5, 1.0}
// ============================================================================

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

// ============================================================================
// TOTAL POSSIBLE WEIGHT PER TYPE (precomputed column sums)
// Used for normalization to correct structural bias
// ============================================================================

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

// ============================================================================
// SCENE CAPS (non-negotiable)
// ============================================================================

/** Maximum contribution for any single player type per scene */
export const PER_TYPE_CAP = 4.0;

/** Maximum total contribution across all player types per scene */
export const TOTAL_SCENE_CAP = 8.0;

// ============================================================================
// NORMALIZATION BASELINE
// ============================================================================

/** Baseline added to normalized score before percentage conversion */
export const NORMALIZATION_BASELINE = 0.0;

// ============================================================================
// FLOATING POINT TOLERANCE
// ============================================================================

export const FLOAT_TOLERANCE = 1e-9;

// ============================================================================
// TYPE DEFINITIONS FOR INPUT/OUTPUT
// ============================================================================

export interface AxisSignals {
  A1?: number;
  A2?: number;
  A3?: number;
  A4?: number;
  A5?: number;
  A6?: number;
  A7?: number;
  A8?: number;
  A9?: number;
  A10?: number;
}

export interface SceneInput {
  sceneNumber: number;
  axisSignals: AxisSignals;
}

export interface SessionInput {
  sessionId: string;
  scenes: SceneInput[];
}

export interface AxisContributions {
  [axis: string]: Partial<Record<PlayerType, number>>;
}

export interface SceneDetail {
  sceneNumber: number;
  axisSignals: AxisSignals;
  axisContributions: AxisContributions;
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
// UTILITY: Initialize empty type scores
// ============================================================================

export function createEmptyTypeScores(): Record<PlayerType, number> {
  return {
    Actor: 0,
    Explorer: 0,
    Instigator: 0,
    PowerGamer: 0,
    Slayer: 0,
    Storyteller: 0,
    Thinker: 0,
    Watcher: 0,
  };
}
