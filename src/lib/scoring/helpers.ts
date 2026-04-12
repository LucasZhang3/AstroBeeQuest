/**
 * Phase 3 Scoring Engine Helper Utilities
 * Pure functions for common operations
 */

import {
  PLAYER_TYPES,
  PER_TYPE_CAP,
  TOTAL_SCENE_CAP,
  FLOAT_TOLERANCE,
  PlayerType,
} from './constants';

// ============================================================================
// sum: Numeric sum over object values
// ============================================================================

export function sum(obj: Record<string, number>): number {
  return Object.values(obj).reduce((acc, val) => acc + val, 0);
}

// ============================================================================
// applyPerTypeCap: Clamps per-type values to the cap
// ============================================================================

export function applyPerTypeCap(
  contribs: Record<PlayerType, number>,
  cap: number = PER_TYPE_CAP
): Record<PlayerType, number> {
  const result = { ...contribs };
  for (const type of PLAYER_TYPES) {
    if (result[type] > cap) {
      result[type] = cap;
    }
  }
  return result;
}

// ============================================================================
// enforceTotalCap: Weakest-first reduction algorithm
// Reduces contributions until total <= totalCap
// Preserves strongest signals by reducing weakest first
// ============================================================================

export function enforceTotalCap(
  contribs: Record<PlayerType, number>,
  totalCap: number = TOTAL_SCENE_CAP
): Record<PlayerType, number> {
  const result = { ...contribs };
  let total = sum(result);

  if (total <= totalCap) {
    return result;
  }

  let over = total - totalCap;

  // Keep iterating until we've reduced enough
  while (over > FLOAT_TOLERANCE) {
    // Build sorted list of types with positive contributions
    // Sort ascending by contribution value, then alphabetically for ties
    const sortedTypes = PLAYER_TYPES
      .filter(type => result[type] > FLOAT_TOLERANCE)
      .sort((a, b) => {
        const diff = result[a] - result[b];
        if (Math.abs(diff) < FLOAT_TOLERANCE) {
          // Tie: sort alphabetically for determinism
          return a.localeCompare(b);
        }
        return diff;
      });

    if (sortedTypes.length === 0) break;

    // Iterate through sorted list, reducing from weakest
    for (const type of sortedTypes) {
      if (over <= FLOAT_TOLERANCE) break;

      const reducible = Math.min(result[type], over);
      result[type] -= reducible;
      over -= reducible;

      // Round to avoid floating point drift
      result[type] = Math.round(result[type] * 1e10) / 1e10;
      over = Math.round(over * 1e10) / 1e10;
    }
  }

  // Final floating point cleanup - ensure total is exactly totalCap
  const finalTotal = sum(result);
  if (Math.abs(finalTotal - totalCap) > FLOAT_TOLERANCE && finalTotal > 0) {
    // Find the largest contributor and adjust
    const largestType = PLAYER_TYPES
      .filter(type => result[type] > 0)
      .sort((a, b) => result[b] - result[a])[0];
    
    if (largestType) {
      result[largestType] -= (finalTotal - totalCap);
      result[largestType] = Math.round(result[largestType] * 1e10) / 1e10;
    }
  }

  return result;
}

// ============================================================================
// roundPercentages: Round percentages ensuring sum equals 100
// Uses largest remainder method for fair rounding
// ============================================================================

export function roundPercentages(
  percentObj: Record<PlayerType, number>,
  digits: number = 1
): Record<PlayerType, number> {
  const multiplier = Math.pow(10, digits);
  
  // Calculate floor values and remainders
  const entries = PLAYER_TYPES.map(type => ({
    type,
    value: percentObj[type],
    floored: Math.floor(percentObj[type] * multiplier) / multiplier,
    remainder: (percentObj[type] * multiplier) % 1,
  }));

  // Calculate how much we need to distribute
  const flooredSum = entries.reduce((acc, e) => acc + e.floored, 0);
  const target = 100;
  let toDistribute = Math.round((target - flooredSum) * multiplier);

  // Sort by remainder descending (largest remainder method)
  entries.sort((a, b) => b.remainder - a.remainder);

  // Build result
  const result = {} as Record<PlayerType, number>;
  for (const entry of entries) {
    if (toDistribute > 0) {
      result[entry.type] = entry.floored + (1 / multiplier);
      toDistribute--;
    } else {
      result[entry.type] = entry.floored;
    }
  }

  return result;
}

// ============================================================================
// prettyTrace: Format per-scene trace for logs and admin UI
// ============================================================================

export function prettyTrace(sceneDetail: {
  sceneNumber: number;
  axisSignals: Record<string, number>;
  preCapTypeContributions: Record<PlayerType, number>;
  postCapTypeContributions: Record<PlayerType, number>;
}): string {
  const lines: string[] = [];
  lines.push(`\n=== Scene ${sceneDetail.sceneNumber} ===`);
  
  lines.push('Axis Signals:');
  for (const [axis, value] of Object.entries(sceneDetail.axisSignals)) {
    if (value > 0) {
      lines.push(`  ${axis}: ${value}`);
    }
  }

  lines.push('Pre-Cap Contributions:');
  for (const type of PLAYER_TYPES) {
    const val = sceneDetail.preCapTypeContributions[type];
    if (val > 0) {
      lines.push(`  ${type}: ${val.toFixed(4)}`);
    }
  }

  lines.push('Post-Cap Contributions:');
  for (const type of PLAYER_TYPES) {
    const val = sceneDetail.postCapTypeContributions[type];
    if (val > 0) {
      lines.push(`  ${type}: ${val.toFixed(4)}`);
    }
  }

  const total = sum(sceneDetail.postCapTypeContributions);
  lines.push(`Total: ${total.toFixed(4)}`);

  return lines.join('\n');
}

// ============================================================================
// validateSignalValue: Check if a signal value is valid
// ============================================================================

export function isValidSignalValue(value: number): boolean {
  return [0.0, 0.5, 1.0, 2.0].some(v => Math.abs(v - value) < FLOAT_TOLERANCE);
}

// ============================================================================
// cloneDeep: Simple deep clone for plain objects
// ============================================================================

export function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
