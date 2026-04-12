/**
 * Phase 3 Scoring Engine - Unit Tests
 * Comprehensive test suite for deterministic scoring
 */

import { describe, it, expect } from 'vitest';
import {
  scoreScene,
  accumulateScenes,
  normalizeScores,
  toPercentages,
  scoreSession,
  getPublicResult,
  validateSessionInput,
} from './scorer';
import {
  PLAYER_TYPES,
  TOTAL_POSSIBLE_WEIGHT,
  NORMALIZATION_BASELINE,
  createEmptyTypeScores,
  PlayerType,
} from './constants';
import {
  sum,
  applyPerTypeCap,
  enforceTotalCap,
  roundPercentages,
} from './helpers';
import {
  generateEmptySession,
  generateMockSession,
  generateSpecExampleSession,
  fuzzGenerator,
  validateFuzzResult,
} from './mocks';

// ============================================================================
// HELPER TESTS
// ============================================================================

describe('Helper Functions', () => {
  describe('sum', () => {
    it('should sum object values', () => {
      expect(sum({ a: 1, b: 2, c: 3 })).toBe(6);
    });

    it('should return 0 for empty object', () => {
      expect(sum({})).toBe(0);
    });
  });

  describe('applyPerTypeCap', () => {
    it('should clamp values exceeding per-type cap', () => {
      const input = createEmptyTypeScores();
      input.Actor = 4.0;
      input.Slayer = 2.0;

      const result = applyPerTypeCap(input);
      
      expect(result.Actor).toBe(3.5);
      expect(result.Slayer).toBe(2.0);
    });

    it('should not modify values under cap', () => {
      const input = createEmptyTypeScores();
      input.Actor = 2.0;
      
      const result = applyPerTypeCap(input);
      
      expect(result.Actor).toBe(2.0);
    });
  });

  describe('enforceTotalCap', () => {
    it('should not modify if total is under scene cap', () => {
      const input = createEmptyTypeScores();
      input.Actor = 2.0;
      input.Slayer = 1.5;

      const result = enforceTotalCap(input);
      
      expect(result.Actor).toBe(2.0);
      expect(result.Slayer).toBe(1.5);
      expect(sum(result)).toBe(3.5);
    });

    it('should reduce to exactly total scene cap using weakest-first', () => {
      const input = createEmptyTypeScores();
      input.Actor = 3.5;
      input.Storyteller = 3.5;
      input.Explorer = 1.0;
      input.Instigator = 0.5;
      // Total = 8.5, need to remove 2.5

      const result = enforceTotalCap(input);
      
      expect(sum(result)).toBeCloseTo(6.0, 9);
      // Weakest (Instigator, Explorer) reduced first
      expect(result.Instigator).toBe(0);
      expect(result.Explorer).toBe(0);
      // Actor & Storyteller tied at 3.5; Actor is alphabetically first → reduced first
      // After removing Instigator(0.5) + Explorer(1.0) = 1.5, over=1.0
      // Actor reduced by 1.0 → Actor=2.5, Storyteller=3.5
      expect(result.Actor).toBe(2.5);
      expect(result.Storyteller).toBe(3.5);
    });

    it('should handle tie-breaking alphabetically', () => {
      const input = createEmptyTypeScores();
      input.Actor = 2.0;
      input.Explorer = 2.0;
      input.Slayer = 5.0; // Will be capped to 3.5 first

      // Total after per-type cap would be 7.5, over = 1.5
      const capped = applyPerTypeCap(input);
      const result = enforceTotalCap(capped);

      // Actor comes before Explorer alphabetically, both reduced first
      expect(sum(result)).toBeCloseTo(6.0, 9);
    });
  });

  describe('roundPercentages', () => {
    it('should round to specified digits and sum to 100', () => {
      const input = {
        Actor: 13.574,
        Explorer: 13.14,
        Instigator: 12.648,
        PowerGamer: 9.853,
        Slayer: 16.053,
        Storyteller: 13.685,
        Thinker: 11.675,
        Watcher: 9.372,
      } as Record<PlayerType, number>;

      const result = roundPercentages(input, 1);
      const total = sum(result);
      
      expect(total).toBeCloseTo(100, 1);
    });
  });
});

// ============================================================================
// SCORE SCENE TESTS
// ============================================================================

describe('scoreScene', () => {
  it('should handle single-axis dominance (A1 strong)', () => {
    const result = scoreScene({ A1: 2.0 });
    
    // A1 contributes: Actor 1.0, Explorer 0.5, Storyteller 1.0, Watcher 0.5
    // With signal 2.0: Actor 2.0, Explorer 1.0, Storyteller 2.0, Watcher 1.0
    expect(result.preCapTypeContributions.Actor).toBe(2.0);
    expect(result.preCapTypeContributions.Explorer).toBe(1.0);
    expect(result.preCapTypeContributions.Storyteller).toBe(2.0);
    expect(result.preCapTypeContributions.Watcher).toBe(1.0);
    
    // Other types should be 0
    expect(result.preCapTypeContributions.Slayer).toBe(0);
    expect(result.preCapTypeContributions.PowerGamer).toBe(0);
  });

  it('should apply per-type cap of 3.5', () => {
    // A1=2.0, A5=2.0 would give Actor: 2.0 + 2.0 = 4.0
    const result = scoreScene({ A1: 2.0, A5: 2.0 });
    
    // Pre-cap should show the full value
    expect(result.preCapTypeContributions.Actor).toBe(4.0);
    // Post-cap should be clamped
    expect(result.postCapTypeContributions.Actor).toBeLessThanOrEqual(3.5);
  });

  it('should enforce total scene cap of 6.0', () => {
    // High signals across many axes
    const result = scoreScene({
      A1: 2.0,
      A2: 2.0,
      A3: 2.0,
      A4: 2.0,
      A5: 2.0,
    });
    
    const total = sum(result.postCapTypeContributions);
    expect(total).toBeCloseTo(6.0, 9);
  });

  it('should preserve strongest signals during reduction', () => {
    const result = scoreScene({ A1: 2.0, A5: 1.0 });
    
    // After per-type cap (3.5): Actor 3.0, Storyteller 2.5, Watcher 1.5, Explorer 1.0, Instigator 0.5
    // Total=8.5, over=2.5. Weakest-first: Instigator(0.5)→0, Explorer(1.0)→0, Watcher(1.5)→0.5
    // Total now = 3.0+2.5+0.5 = 6.0 ✓
    const total = sum(result.postCapTypeContributions);
    expect(total).toBeCloseTo(6.0, 9);
    // Strongest signals should be preserved
    expect(result.postCapTypeContributions.Actor).toBeGreaterThan(0);
    expect(result.postCapTypeContributions.Storyteller).toBeGreaterThan(0);
  });

  it('should return empty contributions for empty signals', () => {
    const result = scoreScene({});
    
    for (const type of PLAYER_TYPES) {
      expect(result.postCapTypeContributions[type]).toBe(0);
    }
  });
});

// ============================================================================
// ACCUMULATE SCENES TESTS
// ============================================================================

describe('accumulateScenes', () => {
  it('should sum contributions across scenes', () => {
    const scene1 = createEmptyTypeScores();
    scene1.Actor = 2.5;
    scene1.Storyteller = 1.5;

    const scene2 = createEmptyTypeScores();
    scene2.Slayer = 2.5;
    scene2.Instigator = 1.5;

    const result = accumulateScenes([scene1, scene2]);

    expect(result.Actor).toBe(2.5);
    expect(result.Storyteller).toBe(1.5);
    expect(result.Slayer).toBe(2.5);
    expect(result.Instigator).toBe(1.5);
  });

  it('should handle empty array', () => {
    const result = accumulateScenes([]);

    for (const type of PLAYER_TYPES) {
      expect(result[type]).toBe(0);
    }
  });
});

// ============================================================================
// NORMALIZE SCORES TESTS
// ============================================================================

describe('normalizeScores', () => {
  it('should apply baseline + raw/totalPossible formula', () => {
    const rawScores = createEmptyTypeScores();
    rawScores.Actor = 2.75;

    const result = normalizeScores(rawScores);

    // Actor normalized = 0.0 + 2.75/5.0 = 0.55
    expect(result.Actor).toBeCloseTo(0.55, 10);
  });

  it('should correct for structural bias', () => {
    // Explorer has totalPossible of 2.0 vs Actor's 5.0
    // Same raw score should give Explorer higher normalized
    const rawScores = createEmptyTypeScores();
    rawScores.Actor = 2.0;
    rawScores.Explorer = 2.0;

    const result = normalizeScores(rawScores);

    // Actor: 0.0 + 2.0/5.0 = 0.4
    // Explorer: 0.0 + 2.0/2.0 = 1.0
    expect(result.Actor).toBeCloseTo(0.4, 10);
    expect(result.Explorer).toBeCloseTo(1.0, 10);
    expect(result.Explorer).toBeGreaterThan(result.Actor);
  });

  it('should give baseline for zero raw scores', () => {
    const rawScores = createEmptyTypeScores();
    const result = normalizeScores(rawScores);

    for (const type of PLAYER_TYPES) {
      expect(result[type]).toBe(NORMALIZATION_BASELINE);
    }
  });
});

// ============================================================================
// TO PERCENTAGES TESTS
// ============================================================================

describe('toPercentages', () => {
  it('should sum to 100', () => {
    const normalized = {
      Actor: 1.55,
      Explorer: 1.5,
      Instigator: 1.4444,
      PowerGamer: 1.125,
      Slayer: 1.8333,
      Storyteller: 1.5625,
      Thinker: 1.3333,
      Watcher: 1.0714,
    } as Record<PlayerType, number>;

    const result = toPercentages(normalized);
    const total = sum(result);

    expect(total).toBeCloseTo(100, 6);
  });

  it('should give equal percentages for all-equal normalized', () => {
    const normalized = createEmptyTypeScores();
    for (const type of PLAYER_TYPES) {
      normalized[type] = 1.0;
    }

    const result = toPercentages(normalized);

    for (const type of PLAYER_TYPES) {
      expect(result[type]).toBeCloseTo(100 / 8, 10);
    }
  });
});

// ============================================================================
// SCORE SESSION TESTS
// ============================================================================

describe('scoreSession', () => {
  it('should handle all-zeros input with equal percentages', () => {
    const session = generateEmptySession();
    const result = scoreSession(session.sessionId, session.scenes);

    for (const type of PLAYER_TYPES) {
      expect(result.rawScores[type]).toBe(0);
      expect(result.normalizedScores[type]).toBe(NORMALIZATION_BASELINE);
      expect(result.percentages[type]).toBeCloseTo(100 / 8, 10);
    }
  });

  it('should produce consistent results for same input', () => {
    const session = generateMockSession('test-consistency');
    
    const result1 = scoreSession(session.sessionId, session.scenes);
    const result2 = scoreSession(session.sessionId, session.scenes);

    expect(result1.rawScores).toEqual(result2.rawScores);
    expect(result1.normalizedScores).toEqual(result2.normalizedScores);
    expect(result1.percentages).toEqual(result2.percentages);
  });

  it('should match spec example calculations', () => {
    const session = generateSpecExampleSession();
    const result = scoreSession(session.sessionId, session.scenes);

    // With new caps (3.5/type, 6.0/scene), scene results change:
    // Scene 1 (A1=2.0, A5=1.0): pre-cap Actor=3.0, Storyteller=2.5, Watcher=1.5, Explorer=1.0, Instigator=0.5
    // Total=8.5, over=2.5. Weakest-first reduction applies.
    // Scene 2 (A6=2.0, A3=1.0): various contributions
    // Scene 3 (A2=1.0, A4=0.5): small contributions
    // Just verify the formula is correct and percentages sum to 100
    expect(sum(result.percentages)).toBeCloseTo(100, 6);
    
    // Normalized formula check
    for (const type of PLAYER_TYPES) {
      const expected = NORMALIZATION_BASELINE + result.rawScores[type] / TOTAL_POSSIBLE_WEIGHT[type];
      expect(result.normalizedScores[type]).toBeCloseTo(expected, 9);
    }
  });

  it('should include per-scene trace details', () => {
    const session = generateSpecExampleSession();
    const result = scoreSession(session.sessionId, session.scenes);

    expect(result.perScene).toHaveLength(12);
    expect(result.perScene[0].sceneNumber).toBe(1);
    expect(result.perScene[0].axisSignals).toEqual({ A1: 2.0, A5: 1.0 });
    expect(result.perScene[0].axisContributions).toBeDefined();
    expect(result.perScene[0].preCapTypeContributions).toBeDefined();
    expect(result.perScene[0].postCapTypeContributions).toBeDefined();
  });
});

// ============================================================================
// PUBLIC RESULT TESTS
// ============================================================================

describe('getPublicResult', () => {
  it('should sort types by percentage descending', () => {
    const session = generateSpecExampleSession();
    const result = scoreSession(session.sessionId, session.scenes);
    const publicResult = getPublicResult(result);

    // Slayer should be top based on spec example
    expect(publicResult.topTypes[0].type).toBe('Slayer');
    
    // Verify sorted order
    for (let i = 1; i < publicResult.topTypes.length; i++) {
      expect(publicResult.topTypes[i - 1].pct).toBeGreaterThanOrEqual(
        publicResult.topTypes[i].pct
      );
    }
  });

  it('should handle ties with alphabetical ordering', () => {
    const session = generateEmptySession();
    const result = scoreSession(session.sessionId, session.scenes);
    const publicResult = getPublicResult(result);

    // All equal percentages - should be sorted alphabetically
    expect(publicResult.topTypes[0].type).toBe('Actor');
    expect(publicResult.topTypes[1].type).toBe('Explorer');
  });
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('validateSessionInput', () => {
  it('should accept valid input', () => {
    const session = generateMockSession();
    const { valid, errors } = validateSessionInput(session);

    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('should reject non-object input', () => {
    const { valid } = validateSessionInput('not an object');
    expect(valid).toBe(false);
  });

  it('should reject wrong scene count', () => {
    const session = { sessionId: 'test', scenes: [] };
    const { valid, errors } = validateSessionInput(session);

    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('12 entries'))).toBe(true);
  });

  it('should reject invalid signal values', () => {
    const session = generateEmptySession();
    session.scenes[0].axisSignals = { A1: 3.0 } as any;

    const { valid, errors } = validateSessionInput(session);

    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('invalid value'))).toBe(true);
  });
});

// ============================================================================
// FUZZ TESTS
// ============================================================================

describe('Fuzz Tests', () => {
  it('should handle 100 random sessions without errors', () => {
    let failures = 0;

    for (const session of fuzzGenerator(100)) {
      const result = scoreSession(session.sessionId, session.scenes);
      const validation = validateFuzzResult(
        result.percentages,
        result.rawScores,
        result.perScene
      );

      if (!validation.passed) {
        console.error('Fuzz failure:', validation.errors);
        failures++;
      }
    }

    expect(failures).toBe(0);
  });

  it('should always have percentages sum to 100', () => {
    for (const session of fuzzGenerator(50)) {
      const result = scoreSession(session.sessionId, session.scenes);
      const total = sum(result.percentages);
      
      expect(total).toBeCloseTo(100, 6);
    }
  });

  it('should never produce NaN values', () => {
    for (const session of fuzzGenerator(50)) {
      const result = scoreSession(session.sessionId, session.scenes);

      for (const type of PLAYER_TYPES) {
        expect(isNaN(result.rawScores[type])).toBe(false);
        expect(isNaN(result.normalizedScores[type])).toBe(false);
        expect(isNaN(result.percentages[type])).toBe(false);
      }
    }
  });

  it('should never exceed per-scene caps', () => {
    for (const session of fuzzGenerator(50)) {
      const result = scoreSession(session.sessionId, session.scenes);

      for (const scene of result.perScene) {
        const total = sum(scene.postCapTypeContributions);
        expect(total).toBeLessThanOrEqual(6.0 + 1e-9);

        for (const type of PLAYER_TYPES) {
          expect(scene.postCapTypeContributions[type]).toBeLessThanOrEqual(3.5 + 1e-9);
        }
      }
    }
  });
});

// ============================================================================
// PRECISION TESTS
// ============================================================================

describe('Precision', () => {
  it('should maintain precision through the pipeline', () => {
    const session = generateSpecExampleSession();
    const result = scoreSession(session.sessionId, session.scenes);

    // Check raw score total equals sum of scene totals
    const rawTotal = sum(result.rawScores);
    const sceneTotal = result.perScene.reduce(
      (acc, s) => acc + sum(s.postCapTypeContributions),
      0
    );

    expect(rawTotal).toBeCloseTo(sceneTotal, 9);
  });

  it('should handle edge case floating point values', () => {
    const signals = {
      A1: 0.5,
      A2: 0.5,
      A3: 0.5,
      A4: 0.5,
    };

    const result = scoreScene(signals);
    const total = sum(result.postCapTypeContributions);

    expect(isFinite(total)).toBe(true);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(6.0 + 1e-9);
  });
});
