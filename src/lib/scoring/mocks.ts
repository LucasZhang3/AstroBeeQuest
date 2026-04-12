/**
 * Phase 3 Scoring Engine - Mock Data Generators
 * Utilities for testing and development
 */

import {
  AXES,
  Axis,
  AxisSignals,
  SceneInput,
  SessionInput,
  VALID_SIGNAL_VALUES,
} from './constants';

// ============================================================================
// Preset signal patterns
// ============================================================================

export type PresetType = 
  | 'actor-heavy'
  | 'explorer-heavy'
  | 'slayer-heavy'
  | 'thinker-heavy'
  | 'balanced'
  | 'low-signal'
  | 'high-signal'
  | 'random';

const PRESETS: Record<Exclude<PresetType, 'random'>, AxisSignals> = {
  'actor-heavy': {
    A1: 2.0,  // Narrative Motivation (Actor 1.0)
    A5: 2.0,  // Spotlight Comfort (Actor 1.0)
    A7: 1.0,  // Chaos Tolerance (Actor 0.5)
    A10: 2.0, // Character Identification (Actor 1.0)
  },
  'explorer-heavy': {
    A1: 1.0,  // Narrative Motivation (Explorer 0.5)
    A2: 2.0,  // Exploration Drive (Explorer 1.0)
    A3: 1.0,  // Risk Tolerance (Explorer 0.5)
  },
  'slayer-heavy': {
    A3: 2.0,  // Risk Tolerance (Slayer 1.0)
    A6: 2.0,  // Combat Engagement (Slayer 1.0)
    A9: 2.0,  // Stimulation Need (Slayer 1.0)
  },
  'thinker-heavy': {
    A2: 1.0,  // Exploration Drive (Thinker 0.5)
    A4: 2.0,  // Cognitive Style (Thinker 1.0)
    A6: 1.0,  // Combat Engagement (Thinker 0.5)
    A8: 2.0,  // Rules Orientation (Thinker 1.0)
  },
  'balanced': {
    A1: 1.0,
    A2: 1.0,
    A3: 1.0,
    A4: 1.0,
    A5: 1.0,
    A6: 1.0,
    A7: 1.0,
    A8: 1.0,
    A9: 1.0,
    A10: 1.0,
  },
  'low-signal': {
    A1: 0.5,
    A4: 0.5,
  },
  'high-signal': {
    A1: 2.0,
    A2: 2.0,
    A3: 2.0,
    A4: 2.0,
    A5: 2.0,
    A6: 2.0,
    A7: 2.0,
    A8: 2.0,
    A9: 2.0,
    A10: 2.0,
  },
};

// ============================================================================
// Generate single scene with preset or random signals
// ============================================================================

export function generateSceneSignals(preset: PresetType = 'random'): AxisSignals {
  if (preset !== 'random') {
    return { ...PRESETS[preset] };
  }

  // Random generation
  const signals: AxisSignals = {};
  for (const axis of AXES) {
    // 30% chance to have no signal
    if (Math.random() < 0.3) continue;
    
    const randomIndex = Math.floor(Math.random() * VALID_SIGNAL_VALUES.length);
    signals[axis] = VALID_SIGNAL_VALUES[randomIndex];
  }
  return signals;
}

// ============================================================================
// Generate full 12-scene session
// ============================================================================

export function generateMockSession(
  sessionId: string = crypto.randomUUID(),
  preset: PresetType = 'random'
): SessionInput {
  const scenes: SceneInput[] = [];

  for (let i = 1; i <= 12; i++) {
    scenes.push({
      sceneNumber: i,
      axisSignals: generateSceneSignals(preset),
    });
  }

  return { sessionId, scenes };
}

// ============================================================================
// Generate session with specific scene configurations
// ============================================================================

export function generateCustomSession(
  sessionId: string,
  scenePresets: PresetType[]
): SessionInput {
  const scenes: SceneInput[] = scenePresets.map((preset, index) => ({
    sceneNumber: index + 1,
    axisSignals: generateSceneSignals(preset),
  }));

  // Pad to 12 scenes if needed
  while (scenes.length < 12) {
    scenes.push({
      sceneNumber: scenes.length + 1,
      axisSignals: {},
    });
  }

  return { sessionId, scenes };
}

// ============================================================================
// Generate empty session (all zeros)
// ============================================================================

export function generateEmptySession(
  sessionId: string = crypto.randomUUID()
): SessionInput {
  const scenes: SceneInput[] = [];
  for (let i = 1; i <= 12; i++) {
    scenes.push({ sceneNumber: i, axisSignals: {} });
  }
  return { sessionId, scenes };
}

// ============================================================================
// Generate session from the spec's 3-scene example
// ============================================================================

export function generateSpecExampleSession(): SessionInput {
  return {
    sessionId: 'spec-example',
    scenes: [
      { sceneNumber: 1, axisSignals: { A1: 2.0, A5: 1.0 } },
      { sceneNumber: 2, axisSignals: { A6: 2.0, A3: 1.0 } },
      { sceneNumber: 3, axisSignals: { A2: 1.0, A4: 0.5 } },
      // Pad remaining scenes with empty signals
      { sceneNumber: 4, axisSignals: {} },
      { sceneNumber: 5, axisSignals: {} },
      { sceneNumber: 6, axisSignals: {} },
      { sceneNumber: 7, axisSignals: {} },
      { sceneNumber: 8, axisSignals: {} },
      { sceneNumber: 9, axisSignals: {} },
      { sceneNumber: 10, axisSignals: {} },
      { sceneNumber: 11, axisSignals: {} },
      { sceneNumber: 12, axisSignals: {} },
    ],
  };
}

// ============================================================================
// Fuzz test generator
// ============================================================================

export function* fuzzGenerator(count: number = 1000): Generator<SessionInput> {
  for (let i = 0; i < count; i++) {
    yield generateMockSession(`fuzz-${i}`);
  }
}

// ============================================================================
// Validate fuzz test results
// ============================================================================

export interface FuzzValidationResult {
  sessionId: string;
  passed: boolean;
  errors: string[];
}

export function validateFuzzResult(
  percentages: Record<string, number>,
  rawScores: Record<string, number>,
  perScene: Array<{ postCapTypeContributions: Record<string, number> }>
): FuzzValidationResult {
  const errors: string[] = [];
  const sessionId = 'fuzz-validation';

  // Check percentages sum to 100
  const pctSum = Object.values(percentages).reduce((a, b) => a + b, 0);
  if (Math.abs(pctSum - 100) > 1e-6) {
    errors.push(`Percentages sum to ${pctSum}, expected 100`);
  }

  // Check no NaNs
  for (const [type, pct] of Object.entries(percentages)) {
    if (isNaN(pct)) {
      errors.push(`NaN percentage for ${type}`);
    }
    if (pct < 0) {
      errors.push(`Negative percentage for ${type}: ${pct}`);
    }
  }

  // Check raw scores are non-negative
  for (const [type, score] of Object.entries(rawScores)) {
    if (isNaN(score)) {
      errors.push(`NaN raw score for ${type}`);
    }
    if (score < 0) {
      errors.push(`Negative raw score for ${type}: ${score}`);
    }
  }

  // Check per-scene caps
  for (let i = 0; i < perScene.length; i++) {
    const scene = perScene[i];
    const contribs = scene.postCapTypeContributions;

    // Check per-type cap
    for (const [type, val] of Object.entries(contribs)) {
      if (val > 3.5 + 1e-9) {
        errors.push(`Scene ${i + 1}: ${type} exceeds per-type cap: ${val}`);
      }
    }

    // Check total scene cap
    const total = Object.values(contribs).reduce((a, b) => a + b, 0);
    if (total > 6.0 + 1e-9) {
      errors.push(`Scene ${i + 1}: total ${total} exceeds scene cap 6.0`);
    }
  }

  return {
    sessionId,
    passed: errors.length === 0,
    errors,
  };
}
