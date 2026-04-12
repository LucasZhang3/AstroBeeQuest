# Phase 3 Scoring Engine Documentation

## Overview

The deterministic scoring engine computes player-type contributions from axis signals, applies scene-level caps, accumulates across scenes, normalizes to correct structural bias, and outputs stable percentages summing to 100.

## Core Concepts

### Axes (A1-A10)
| Axis | Name |
|------|------|
| A1 | Narrative Motivation |
| A2 | Exploration Drive |
| A3 | Risk Tolerance |
| A4 | Cognitive Style |
| A5 | Spotlight Comfort |
| A6 | Combat Engagement |
| A7 | Chaos Tolerance |
| A8 | Rules Orientation |
| A9 | Stimulation Need |
| A10 | Character Identification |

### Player Types
Actor, Explorer, Instigator, PowerGamer, Slayer, Storyteller, Thinker, Watcher

### Signal Strength Mapping
| Label | Value |
|-------|-------|
| none | 0.0 |
| weak | 0.5 |
| medium | 1.0 |
| strong | 2.0 |

## Weight Matrix

```
A1:  Actor 1.0, Explorer 0.5, Storyteller 1.0, Watcher 0.5
A2:  Explorer 1.0, Instigator 0.5, Storyteller 0.5, Thinker 0.5
A3:  Actor 0.5, Explorer 0.5, Instigator 1.0, Slayer 1.0
A4:  Actor 0.5, PowerGamer 0.5, Storyteller 0.5, Thinker 1.0, Watcher 0.5
A5:  Actor 1.0, Instigator 0.5, Storyteller 0.5, Watcher 1.0
A6:  Instigator 0.5, PowerGamer 0.5, Slayer 1.0, Thinker 0.5
A7:  Actor 0.5, Instigator 1.0
A8:  PowerGamer 1.0, Storyteller 0.5, Thinker 1.0
A9:  Actor 0.5, Instigator 1.0, Slayer 1.0, Watcher 1.0
A10: Actor 1.0, Storyteller 1.0, Watcher 0.5
```

### Total Possible Weight Per Type (for normalization)
| Type | Weight |
|------|--------|
| Actor | 5.0 |
| Instigator | 4.5 |
| Storyteller | 4.0 |
| Watcher | 3.5 |
| Slayer | 3.0 |
| Thinker | 3.0 |
| Explorer | 2.0 |
| PowerGamer | 2.0 |

## Caps

- **Per-type cap per scene**: 3.5
- **Total scene cap**: 6.0
- **Normalization baseline**: 0.0

## Algorithms

### 1. Per-Scene Scoring (`scoreScene`)

```typescript
for each axis a:
  for each type t where Weight[a][t] > 0:
    axisContribution[a][t] = signal[a] * Weight[a][t]

preCapContributions[t] = sum of axisContributions for t
```

### 2. Per-Type Cap
```typescript
if preCapContributions[t] > 2.5:
  postCapContributions[t] = 2.5
```

### 3. Total Scene Cap (Weakest-First Reduction)

```typescript
over = total - 4.0
while over > 0:
  for each type sorted by contribution (ascending):
    reducible = min(contribution[t], over)
    contribution[t] -= reducible
    over -= reducible
```

### 4. Accumulation
```typescript
rawScore[t] = sum of postCapContributions across all scenes
```

### 5. Normalization
```typescript
normalizedScore[t] = 1.0 + (rawScore[t] / totalPossibleWeight[t])
```

### 6. Percentages
```typescript
percentage[t] = (normalizedScore[t] / sum(allNormalized)) * 100
```

## API

### `scoreSession(sessionId, scenes)`

Main orchestrator function.

**Input:**
```typescript
{
  sessionId: string;
  scenes: Array<{
    sceneNumber: number;
    axisSignals: { A1?: number, A2?: number, ... }
  }>;
}
```

**Output:**
```typescript
{
  sessionId: string;
  perScene: SceneDetail[];      // Full trace for debugging
  rawScores: Record<PlayerType, number>;
  normalizedScores: Record<PlayerType, number>;
  percentages: Record<PlayerType, number>;
}
```

### `getPublicResult(result)`

Extracts user-facing result with sorted top types.

## Database Schema

```sql
CREATE TABLE public.results (
  session_id UUID PRIMARY KEY REFERENCES sessions(id),
  raw_scores JSONB NOT NULL,
  normalized_scores JSONB NOT NULL,
  percentages JSONB NOT NULL,
  per_scene_details JSONB NOT NULL,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

## Testing

Run tests with:
```bash
npx vitest
```

### Test Coverage
- Single-axis dominance
- Per-type cap enforcement
- Total scene cap enforcement
- Cross-scene accumulation
- Normalization fairness
- All-zeros edge case
- Consistency (determinism)
- Precision (sum to 100)
- Tie-breaking (alphabetical)
- Fuzz testing (100+ random sessions)

## Usage Example

```typescript
import { scoreSession, getPublicResult } from '@/lib/scoring';

const result = scoreSession('session-123', [
  { sceneNumber: 1, axisSignals: { A1: 2.0, A5: 1.0 } },
  { sceneNumber: 2, axisSignals: { A6: 2.0, A3: 1.0 } },
  // ... 12 scenes total
]);

const publicResult = getPublicResult(result);
console.log(publicResult.topTypes[0]); // { type: 'Slayer', pct: 16.1 }
```
