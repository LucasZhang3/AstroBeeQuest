# Scoring Engine - Deterministic D&D Player-Type Classification

A pure-function, deterministic scoring engine that transforms LLM-inferred behavioral axis signals into eight player-type percentages summing to exactly 100.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Terminology and Glossary](#2-terminology-and-glossary)
3. [Design Principles and Requirements](#3-design-principles-and-requirements)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Score Model Taxonomy](#5-score-model-taxonomy)
6. [Formal Definitions and Math](#6-formal-definitions-and-math)
7. [Step-by-Step Computations (Worked Examples)](#7-step-by-step-computations-worked-examples)
8. [Implementation Details](#8-implementation-details)
9. [Calibration and Thresholds](#9-calibration-and-thresholds)
10. [Composite Scores and Weighting](#10-composite-scores-and-weighting)
11. [Uncertainty, Confidence, and Explanation](#11-uncertainty-confidence-and-explanation)
12. [Fairness and Bias Mitigation](#12-fairness-and-bias-mitigation)
13. [Storage, Versioning, and Metadata](#13-storage-versioning-and-metadata)
14. [API Contract](#14-api-contract)
15. [Testing and Validation](#15-testing-and-validation)
16. [Monitoring, SLOs, and Alerting](#16-monitoring-slos-and-alerting)
17. [Scalability and Performance](#17-scalability-and-performance)
18. [Security and Privacy](#18-security-and-privacy)
19. [Operations and Runbook](#19-operations-and-runbook)
20. [Change Management and Versioning](#20-change-management-and-versioning)
21. [Sample Dataset and End-to-End Run](#21-sample-dataset-and-end-to-end-run)
22. [Appendix](#22-appendix)
23. [Quick Reference](#23-quick-reference)
24. [Immediate Next Steps](#24-immediate-next-steps)

---

## 1. Executive Summary

The scoring engine classifies D&D players into eight archetypes (Actor, Explorer, Instigator, PowerGamer, Slayer, Storyteller, Thinker, Watcher) from free-text responses to 12 narrative prompts. An LLM (GPT-4o, temperature 0) infers signal strengths across 10 behavioral axes per scene. A deterministic, pure-function scorer applies a weight matrix, enforces per-type and per-scene caps using a weakest-first reduction algorithm, normalizes for structural bias, and converts to percentages. The engine guarantees: identical input produces identical output (100% determinism), percentages sum to 100 within |Σ − 100| < 0.01, no NaN or negative values, and full per-scene audit traces are persisted. Consumers are the results visualization UI and the `results` database table.

---

## 2. Terminology and Glossary

| Term | Definition |
|------|-----------|
| **Axis** | One of 10 behavioral dimensions (A1–A10) measuring a specific trait (e.g., A1 = Narrative Motivation). |
| **Signal** | A numeric value ∈ {0.0, 0.5, 1.0, 2.0} assigned to an axis for a scene by the LLM. |
| **Signal label** | Human-readable mapping: none=0.0, weak=0.5, medium=1.0, strong=2.0. |
| **Player type** | One of 8 archetypes: Actor, Explorer, Instigator, PowerGamer, Slayer, Storyteller, Thinker, Watcher. |
| **Weight matrix** | A 10×8 matrix W[axis][type] ∈ {0, 0.5, 1.0} mapping axis signals to type contributions. |
| **Contribution** | The product signal(a) × W[a][t] for axis `a` and type `t`. |
| **Per-type cap** | Maximum contribution for any single type in a single scene: 4.0. |
| **Total scene cap** | Maximum sum of all type contributions in a single scene: 8.0. |
| **Weakest-first reduction** | Algorithm that reduces excess contributions starting from the smallest, preserving strongest signals. |
| **Raw score** | Sum of post-cap contributions for a type across all 12 scenes. |
| **Total possible weight** | Precomputed column sum of the weight matrix for a type; used for normalization. |
| **Normalized score** | baseline + (raw_score / total_possible_weight), where baseline = 0.0. |
| **Percentage** | (normalized_score / Σ normalized_scores) × 100. |
| **Scene** | One of 12 narrative prompts presented sequentially to the user. |
| **Session** | A complete 12-scene assessment for one user, identified by UUID. |
| **LLM inference** | The GPT-4o call that reads user responses and outputs axis signals via tool calling. |
| **Signal snapping** | Correcting out-of-range LLM signal values to the nearest valid value. |
| **Float tolerance** | 1e-9, used for floating-point comparisons throughout. |

---

## 3. Design Principles and Requirements

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Correctness** | Pure functions, no side effects, no randomness. Same input → same output, always. |
| **Reproducibility** | Engine is stateless; full input (12 scenes × 10 axes) determines output completely. |
| **Explainability** | Full per-scene trace persisted: axis signals, pre-cap contributions, post-cap contributions, raw scores, normalized scores, percentages. |
| **Auditability** | `results.per_scene_details` stores the complete calculation trace and LLM inference output. |
| **Separation of concerns** | LLM performs inference only (signal extraction). Scoring is entirely deterministic and independent. |
| **Structural fairness** | Column normalization corrects for the fact that some types have more weight-matrix entries than others. |

### Non-Functional Requirements

| Requirement | Target |
|------------|--------|
| Scoring engine latency (excluding LLM) | < 1 ms per session |
| LLM + scoring end-to-end (p95) | < 15 s |
| Determinism | 100% - byte-identical output for identical input |
| Percentage sum accuracy | |Σ − 100| < 0.01 |
| No NaN, Infinity, or negative percentages | 100% |
| Per-scene cap enforcement | 100% of scenes ≤ 8.0 total, ≤ 4.0 per type |
| Storage | Full trace persisted for every scored session |
| Availability | Coupled to edge function and database availability (platform SLA) |

---

## 4. High-Level Architecture

```
User free-text responses (12 scenes)
        │
        ▼
┌─────────────────────────────────┐
│  LLM Inference (GPT-4o)        │
│  Temperature: 0                 │
│  Output: tool_call with         │
│    12 scenes × 10 axis signals  │
│    + key_quote + rationale      │
└───────────────┬─────────────────┘
                │ validated & cleaned signals
                ▼
┌─────────────────────────────────┐
│  Signal Cleaning                │
│  - Snap to {0, 0.5, 1.0, 2.0}  │
│  - Fill missing scenes          │
│  - Strip invalid axes           │
└───────────────┬─────────────────┘
                │ SceneInput[12]
                ▼
┌─────────────────────────────────┐
│  Per-Scene Scoring              │
│  For each of 12 scenes:         │
│    1. Multiply signals × weights│
│    2. Apply per-type cap (4.0)  │
│    3. Apply total cap (8.0)     │
│       via weakest-first reduce  │
└───────────────┬─────────────────┘
                │ postCapContributions[12][8]
                ▼
┌─────────────────────────────────┐
│  Accumulation                   │
│  rawScore[t] = Σ scenes         │
└───────────────┬─────────────────┘
                │ rawScores[8]
                ▼
┌─────────────────────────────────┐
│  Column Normalization           │
│  norm[t] = raw[t] / totalW[t]  │
└───────────────┬─────────────────┘
                │ normalizedScores[8]
                ▼
┌─────────────────────────────────┐
│  Percentage Conversion          │
│  pct[t] = norm[t] / Σnorm × 100│
└───────────────┬─────────────────┘
                │ percentages[8] (sum = 100)
                ▼
┌─────────────────────────────────┐
│  Persistence & Response         │
│  - Upsert to results table      │
│  - Return percentages + quotes  │
└─────────────────────────────────┘
```

**Rationale for each stage:**

- **LLM Inference**: Humans write freeform text. An LLM is the only viable tool for extracting structured behavioral signals from unstructured prose. Temperature 0 maximizes reproducibility.
- **Signal Cleaning**: LLMs occasionally produce out-of-spec values. Snapping ensures downstream determinism.
- **Per-Scene Scoring**: The weight matrix encodes expert-designed mappings from behavior to archetype. Caps prevent any single extreme scene from dominating the total.
- **Weakest-First Reduction**: When total contributions exceed the scene cap, reducing the weakest signals first preserves the user's strongest behavioral indicators.
- **Column Normalization**: Actor has weight entries in 7/10 axes (total 5.0), while Explorer has only 3/10 (total 2.0). Without normalization, Actor would structurally dominate. Dividing by total possible weight corrects this.
- **Percentage Conversion**: Users expect results that sum to 100% and are immediately interpretable.

---

## 5. Score Model Taxonomy

### 5.1 Axis Signal (input)

| Property | Value |
|----------|-------|
| Purpose | Quantify strength of a behavioral trait in one scene response |
| Domain | {0.0, 0.5, 1.0, 2.0} |
| Range | [0.0, 2.0] |
| Unit | Dimensionless intensity |
| Source | LLM inference |
| Example | A6 = 2.0 means "Combat Engagement is the dominant trait in this response" |

### 5.2 Pre-Cap Type Contribution (intermediate)

| Property | Value |
|----------|-------|
| Purpose | Sum of weighted axis signals for one type in one scene, before capping |
| Domain | [0.0, 20.0] theoretically (10 axes × 2.0 signal × 1.0 weight) |
| Range | [0.0, ∞) before cap |
| Unit | Weighted contribution points |
| Example | Actor pre-cap = A1×1.0 + A3×0.5 + A4×0.5 + A5×1.0 + A7×0.5 + A9×0.5 + A10×1.0 |

### 5.3 Post-Cap Type Contribution (intermediate)

| Property | Value |
|----------|-------|
| Purpose | Capped contribution for one type in one scene |
| Domain | [0.0, 4.0] (per-type cap) |
| Constraint | Sum across all types ≤ 8.0 (total scene cap) |
| Unit | Capped contribution points |

### 5.4 Raw Score (intermediate)

| Property | Value |
|----------|-------|
| Purpose | Accumulated post-cap contributions across all 12 scenes |
| Domain | [0.0, 48.0] max (12 scenes × 4.0 per-type cap) |
| Unit | Accumulated contribution points |

### 5.5 Normalized Score (intermediate)

| Property | Value |
|----------|-------|
| Purpose | Bias-corrected score accounting for weight matrix structure |
| Formula | 0.0 + (raw_score / total_possible_weight) |
| Domain | [0.0, ∞) |
| Unit | Normalized ratio |

### 5.6 Percentage (output)

| Property | Value |
|----------|-------|
| Purpose | User-facing archetype strength |
| Formula | (normalized / Σ normalized) × 100 |
| Domain | [0.0, 100.0] |
| Constraint | Σ percentages = 100.0 (within ±0.01) |
| Unit | Percent |
| Special case | All zeros → equal 12.5% each |

---

## 6. Formal Definitions and Math

### 6.1 Variables

| Symbol | Definition |
|--------|-----------|
| S | Set of 12 scenes, s ∈ {1, 2, ..., 12} |
| A | Set of 10 axes, a ∈ {A1, A2, ..., A10} |
| T | Set of 8 player types, t ∈ {Actor, Explorer, ...} |
| σ(s, a) | Signal value for scene s, axis a; σ ∈ {0.0, 0.5, 1.0, 2.0} |
| W(a, t) | Weight matrix entry; W ∈ {0, 0.5, 1.0} |
| C_pre(s, t) | Pre-cap contribution for scene s, type t |
| C_post(s, t) | Post-cap contribution for scene s, type t |
| R(t) | Raw score for type t |
| P(t) | Total possible weight for type t |
| N(t) | Normalized score for type t |
| %(t) | Final percentage for type t |

### 6.2 Per-Scene Contribution (pre-cap)

```
C_pre(s, t) = Σ_{a ∈ A} σ(s, a) × W(a, t)
```

### 6.3 Per-Type Cap

```
C_typecap(s, t) = min(C_pre(s, t), 4.0)
```

### 6.4 Total Scene Cap (weakest-first reduction)

Given C_typecap(s, ·) for all types in scene s:

```
total = Σ_t C_typecap(s, t)
if total ≤ 8.0:
    C_post(s, t) = C_typecap(s, t)  ∀t
else:
    excess = total − 8.0
    Sort types ascending by C_typecap(s, t), breaking ties alphabetically
    For each type t in sorted order:
        reduction = min(C_post(s, t), excess)
        C_post(s, t) -= reduction
        excess -= reduction
        if excess ≤ 0: break
```

### 6.5 Accumulation

```
R(t) = Σ_{s ∈ S} C_post(s, t)
```

### 6.6 Total Possible Weight

Precomputed column sums of W:

```
P(t) = Σ_{a ∈ A} W(a, t)
```

| Type | P(t) |
|------|------|
| Actor | 5.0 |
| Instigator | 4.5 |
| Storyteller | 4.0 |
| Watcher | 3.5 |
| Slayer | 3.0 |
| Thinker | 3.0 |
| Explorer | 2.0 |
| PowerGamer | 2.0 |

### 6.7 Normalization

```
N(t) = 0.0 + R(t) / P(t)
```

The baseline of 0.0 means types with zero raw signal receive 0.0 normalized score.

### 6.8 Percentage Conversion

```
if Σ_t N(t) = 0:
    %(t) = 100 / 8 = 12.5  ∀t
else:
    %(t) = N(t) / Σ_t N(t) × 100
```

### 6.9 Edge Cases

| Case | Behavior |
|------|----------|
| All signals = 0 across all scenes | Equal 12.5% for all 8 types |
| Single axis activated in one scene | Only types with non-zero weight for that axis get contribution |
| Signal value out of range from LLM | Snapped: ≤0.25→skip, ≤0.75→0.5, ≤1.5→1.0, >1.5→2.0 |
| Missing scene from LLM | Filled with all-zero signals |

### 6.10 Numerical Stability

- All intermediate values rounded to 10 decimal places: `Math.round(x * 1e10) / 1e10`
- Float tolerance for comparisons: 1e-9
- Final adjustment: if `|Σ post-cap − 8.0| > 1e-9`, the largest contributor is adjusted to force exact sum

---

## 7. Step-by-Step Computations (Worked Examples)

### 7.1 Sample Dataset

**Three-scene example** (scenes 4–12 are empty, contributing zero):

```json
{
  "sessionId": "example-001",
  "scenes": [
    { "sceneNumber": 1, "axisSignals": { "A1": 2.0, "A5": 1.0 } },
    { "sceneNumber": 2, "axisSignals": { "A6": 2.0, "A3": 1.0 } },
    { "sceneNumber": 3, "axisSignals": { "A2": 1.0, "A4": 0.5 } },
    { "sceneNumber": 4, "axisSignals": {} },
    { "sceneNumber": 5, "axisSignals": {} },
    { "sceneNumber": 6, "axisSignals": {} },
    { "sceneNumber": 7, "axisSignals": {} },
    { "sceneNumber": 8, "axisSignals": {} },
    { "sceneNumber": 9, "axisSignals": {} },
    { "sceneNumber": 10, "axisSignals": {} },
    { "sceneNumber": 11, "axisSignals": {} },
    { "sceneNumber": 12, "axisSignals": {} }
  ]
}
```

Equivalent CSV:

```csv
scene,A1,A2,A3,A4,A5,A6,A7,A8,A9,A10
1,2.0,0,0,0,1.0,0,0,0,0,0
2,0,0,1.0,0,0,2.0,0,0,0,0
3,0,1.0,0,0.5,0,0,0,0,0,0
4,0,0,0,0,0,0,0,0,0,0
5,0,0,0,0,0,0,0,0,0,0
6,0,0,0,0,0,0,0,0,0,0
7,0,0,0,0,0,0,0,0,0,0
8,0,0,0,0,0,0,0,0,0,0
9,0,0,0,0,0,0,0,0,0,0
10,0,0,0,0,0,0,0,0,0,0
11,0,0,0,0,0,0,0,0,0,0
12,0,0,0,0,0,0,0,0,0,0
```

### 7.2 Scene 1: A1=2.0, A5=1.0

**Step 1: Compute axis contributions**

A1 weights: Actor=1.0, Explorer=0.5, Storyteller=1.0, Watcher=0.5

```
A1 contributions:
  Actor:       2.0 × 1.0 = 2.0
  Explorer:    2.0 × 0.5 = 1.0
  Storyteller: 2.0 × 1.0 = 2.0
  Watcher:     2.0 × 0.5 = 1.0
```

A5 weights: Actor=1.0, Instigator=0.5, Storyteller=0.5, Watcher=1.0

```
A5 contributions:
  Actor:       1.0 × 1.0 = 1.0
  Instigator:  1.0 × 0.5 = 0.5
  Storyteller: 1.0 × 0.5 = 0.5
  Watcher:     1.0 × 1.0 = 1.0
```

**Step 2: Sum pre-cap contributions**

```
Actor:       2.0 + 1.0 = 3.0
Explorer:    1.0 + 0.0 = 1.0
Instigator:  0.0 + 0.5 = 0.5
PowerGamer:  0.0
Slayer:      0.0
Storyteller: 2.0 + 0.5 = 2.5
Thinker:     0.0
Watcher:     1.0 + 1.0 = 2.0
─────────────────────────
Total pre-cap: 3.0 + 1.0 + 0.5 + 0 + 0 + 2.5 + 0 + 2.0 = 9.0
```

**Step 3: Apply per-type cap (4.0)**

All values ≤ 4.0, so no clamping needed. Values unchanged.

**Step 4: Apply total scene cap (8.0)**

```
Total = 9.0 > 8.0
Excess = 9.0 − 8.0 = 1.0

Sort ascending by contribution (ties alphabetical):
  PowerGamer: 0.0
  Slayer:     0.0
  Thinker:    0.0
  Instigator: 0.5
  Explorer:   1.0
  Watcher:    2.0
  Storyteller:2.5
  Actor:      3.0

Reduce weakest first:
  PowerGamer: 0.0 (nothing to reduce)
  Slayer:     0.0 (nothing to reduce)
  Thinker:    0.0 (nothing to reduce)
  Instigator: reduce min(0.5, 1.0) = 0.5 → 0.0; excess = 1.0 − 0.5 = 0.5
  Explorer:   reduce min(1.0, 0.5) = 0.5 → 0.5; excess = 0.5 − 0.5 = 0.0
  STOP (excess = 0)

Post-cap contributions:
  Actor:       3.0
  Explorer:    0.5
  Instigator:  0.0
  PowerGamer:  0.0
  Slayer:      0.0
  Storyteller: 2.5
  Thinker:     0.0
  Watcher:     2.0
  ─────────────────
  Total: 3.0 + 0.5 + 0 + 0 + 0 + 2.5 + 0 + 2.0 = 8.0 ✓
```

### 7.3 Scene 2: A6=2.0, A3=1.0

**Axis contributions:**

A6 weights: Instigator=0.5, PowerGamer=0.5, Slayer=1.0, Thinker=0.5

```
A6 contributions:
  Instigator:  2.0 × 0.5 = 1.0
  PowerGamer:  2.0 × 0.5 = 1.0
  Slayer:      2.0 × 1.0 = 2.0
  Thinker:     2.0 × 0.5 = 1.0
```

A3 weights: Actor=0.5, Explorer=0.5, Instigator=1.0, Slayer=1.0

```
A3 contributions:
  Actor:       1.0 × 0.5 = 0.5
  Explorer:    1.0 × 0.5 = 0.5
  Instigator:  1.0 × 1.0 = 1.0
  Slayer:      1.0 × 1.0 = 1.0
```

**Pre-cap sums:**

```
Actor:       0.5
Explorer:    0.5
Instigator:  1.0 + 1.0 = 2.0
PowerGamer:  1.0
Slayer:      2.0 + 1.0 = 3.0
Storyteller: 0.0
Thinker:     1.0
Watcher:     0.0
─────────────────
Total: 0.5 + 0.5 + 2.0 + 1.0 + 3.0 + 0 + 1.0 + 0 = 8.0
```

Total = 8.0 = cap. No reduction needed. Post-cap = pre-cap.

### 7.4 Scene 3: A2=1.0, A4=0.5

**Axis contributions:**

A2 weights: Explorer=1.0, Instigator=0.5, Storyteller=0.5, Thinker=0.5

```
A2 contributions:
  Explorer:    1.0 × 1.0 = 1.0
  Instigator:  1.0 × 0.5 = 0.5
  Storyteller: 1.0 × 0.5 = 0.5
  Thinker:     1.0 × 0.5 = 0.5
```

A4 weights: Actor=0.5, PowerGamer=0.5, Storyteller=0.5, Thinker=1.0, Watcher=0.5

```
A4 contributions:
  Actor:       0.5 × 0.5 = 0.25
  PowerGamer:  0.5 × 0.5 = 0.25
  Storyteller: 0.5 × 0.5 = 0.25
  Thinker:     0.5 × 1.0 = 0.5
  Watcher:     0.5 × 0.5 = 0.25
```

**Pre-cap sums:**

```
Actor:       0.25
Explorer:    1.0
Instigator:  0.5
PowerGamer:  0.25
Slayer:      0.0
Storyteller: 0.5 + 0.25 = 0.75
Thinker:     0.5 + 0.5  = 1.0
Watcher:     0.25
─────────────────
Total: 0.25 + 1.0 + 0.5 + 0.25 + 0 + 0.75 + 1.0 + 0.25 = 4.0
```

Total = 4.0 ≤ 8.0. No reduction needed.

### 7.5 Scenes 4–12: All zeros

All contributions = 0. No computation needed.

### 7.6 Accumulation (Raw Scores)

```
R(Actor)       = 3.0   + 0.5  + 0.25 = 3.75
R(Explorer)    = 0.5   + 0.5  + 1.0  = 2.0
R(Instigator)  = 0.0   + 2.0  + 0.5  = 2.5
R(PowerGamer)  = 0.0   + 1.0  + 0.25 = 1.25
R(Slayer)      = 0.0   + 3.0  + 0.0  = 3.0
R(Storyteller) = 2.5   + 0.0  + 0.75 = 3.25
R(Thinker)     = 0.0   + 1.0  + 1.0  = 2.0
R(Watcher)     = 2.0   + 0.0  + 0.25 = 2.25
```

### 7.7 Normalization

```
N(Actor)       = 0.0 + 3.75 / 5.0 = 0.75
N(Explorer)    = 0.0 + 2.0  / 2.0 = 1.0
N(Instigator)  = 0.0 + 2.5  / 4.5 = 0.5555555...
N(PowerGamer)  = 0.0 + 1.25 / 2.0 = 0.625
N(Slayer)      = 0.0 + 3.0  / 3.0 = 1.0
N(Storyteller) = 0.0 + 3.25 / 4.0 = 0.8125
N(Thinker)     = 0.0 + 2.0  / 3.0 = 0.6666666...
N(Watcher)     = 0.0 + 2.25 / 3.5 = 0.6428571...
```

Note: Explorer has raw=2.0 and Actor has raw=3.75, but Explorer's normalized score (1.0) exceeds Actor's (0.75) because Explorer's total possible weight is only 2.0 vs Actor's 5.0. This is the structural bias correction working as intended.

### 7.8 Percentage Conversion

```
Σ N = 0.75 + 1.0 + 0.5556 + 0.625 + 1.0 + 0.8125 + 0.6667 + 0.6429
    = 6.0527

Step-by-step sum:
  0.75 + 1.0 = 1.75
  1.75 + 0.5556 = 2.3056
  2.3056 + 0.625 = 2.9306
  2.9306 + 1.0 = 3.9306
  3.9306 + 0.8125 = 4.7431
  4.7431 + 0.6667 = 5.4097
  5.4097 + 0.6429 = 6.0526

%(Actor)       = 0.75     / 6.0526 × 100 = 12.39%
%(Explorer)    = 1.0      / 6.0526 × 100 = 16.52%
%(Instigator)  = 0.5556   / 6.0526 × 100 =  9.18%
%(PowerGamer)  = 0.625    / 6.0526 × 100 = 10.33%
%(Slayer)      = 1.0      / 6.0526 × 100 = 16.52%
%(Storyteller) = 0.8125   / 6.0526 × 100 = 13.42%
%(Thinker)     = 0.6667   / 6.0526 × 100 = 11.02%
%(Watcher)     = 0.6429   / 6.0526 × 100 = 10.62%

Verification: 12.39 + 16.52 + 9.18 + 10.33 + 16.52 + 13.42 + 11.02 + 10.62 = 100.00 ✓
```

**Ranking (descending):**
1. Explorer: 16.52%
2. Slayer: 16.52% (tie, alphabetically after Explorer)
3. Storyteller: 13.42%
4. Actor: 12.39%
5. Thinker: 11.02%
6. Watcher: 10.62%
7. PowerGamer: 10.33%
8. Instigator: 9.18%

---

## 8. Implementation Details

### 8.1 Weight Matrix (complete)

```typescript
const WEIGHT_MATRIX: Record<Axis, Partial<Record<PlayerType, number>>> = {
  A1:  { Actor: 1.0, Explorer: 0.5, Storyteller: 1.0, Watcher: 0.5 },
  A2:  { Explorer: 1.0, Instigator: 0.5, Storyteller: 0.5, Thinker: 0.5 },
  A3:  { Actor: 0.5, Explorer: 0.5, Instigator: 1.0, Slayer: 1.0 },
  A4:  { Actor: 0.5, PowerGamer: 0.5, Storyteller: 0.5, Thinker: 1.0, Watcher: 0.5 },
  A5:  { Actor: 1.0, Instigator: 0.5, Storyteller: 0.5, Watcher: 1.0 },
  A6:  { Instigator: 0.5, PowerGamer: 0.5, Slayer: 1.0, Thinker: 0.5 },
  A7:  { Actor: 0.5, Instigator: 1.0 },
  A8:  { PowerGamer: 1.0, Storyteller: 0.5, Thinker: 1.0 },
  A9:  { Actor: 0.5, Instigator: 1.0, Slayer: 1.0, Watcher: 1.0 },
  A10: { Actor: 1.0, Storyteller: 1.0, Watcher: 0.5 },
};
```

### 8.2 Core Scoring Function (TypeScript)

```typescript
function scoreScene(axisSignals: AxisSignals): SceneScoreResult {
  const axisContributions: Record<string, Partial<Record<PlayerType, number>>> = {};
  const preCapTypeContributions = createEmptyTypeScores();

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

  const afterPerTypeCap = applyPerTypeCap(preCapTypeContributions, 4.0);
  const postCapTypeContributions = enforceTotalCap(afterPerTypeCap, 8.0);

  return { axisContributions, preCapTypeContributions, postCapTypeContributions };
}
```

### 8.3 Weakest-First Reduction (TypeScript)

```typescript
function enforceTotalCap(
  contribs: Record<PlayerType, number>,
  totalCap: number = 8.0
): Record<PlayerType, number> {
  const result = { ...contribs };
  let total = sum(result);
  if (total <= totalCap) return result;
  let over = total - totalCap;

  while (over > 1e-9) {
    const sortedTypes = PLAYER_TYPES
      .filter(type => result[type] > 1e-9)
      .sort((a, b) => {
        const diff = result[a] - result[b];
        if (Math.abs(diff) < 1e-9) return a.localeCompare(b); // alphabetical tie-break
        return diff; // ascending
      });

    if (sortedTypes.length === 0) break;

    for (const type of sortedTypes) {
      if (over <= 1e-9) break;
      const reducible = Math.min(result[type], over);
      result[type] -= reducible;
      over -= reducible;
      result[type] = Math.round(result[type] * 1e10) / 1e10;
      over = Math.round(over * 1e10) / 1e10;
    }
  }

  // Final correction for floating point residual
  const finalTotal = sum(result);
  if (Math.abs(finalTotal - totalCap) > 1e-9 && finalTotal > 0) {
    const largest = PLAYER_TYPES
      .filter(type => result[type] > 0)
      .sort((a, b) => result[b] - result[a])[0];
    if (largest) {
      result[largest] -= (finalTotal - totalCap);
      result[largest] = Math.round(result[largest] * 1e10) / 1e10;
    }
  }

  return result;
}
```

### 8.4 Signal Snapping (Deno Edge Function)

When LLM returns out-of-range values:

```typescript
function snapSignal(val: number): number | null {
  if (val <= 0.25) return null;  // treat as no signal
  if (val <= 0.75) return 0.5;
  if (val <= 1.5)  return 1.0;
  return 2.0;
}
```

### 8.5 SQL Equivalent (Postgres-compatible)

```sql
-- Compute raw score for a single type from pre-computed per_scene_details JSONB
SELECT
  session_id,
  SUM((scene->>'postCapTypeContributions'->>'Actor')::float) AS raw_actor
FROM results,
  jsonb_array_elements(per_scene_details->'perScene') AS scene
GROUP BY session_id;

-- Index recommendation for results lookups
CREATE INDEX idx_results_session_id ON results (session_id);
```

### 8.6 Dual Copy Architecture

The scoring engine exists in two identical implementations:

| Location | Runtime | Purpose |
|----------|---------|---------|
| `src/lib/scoring/` | Vite/TypeScript | Unit tests via Vitest, development verification |
| `supabase/functions/score-session/scoring.ts` | Deno | Production scoring in edge function |

**Critical**: Any change to scoring logic must be applied to both files. The `src/lib/scoring/` version is the source of truth; tests validate it. The Deno port must be manually synchronized.

---

## 9. Calibration and Thresholds

This scoring system is **not probabilistic**. It does not produce probabilities or calibrated confidence scores. The percentages represent relative strength of behavioral alignment, not probability of belonging to a class.

**There is no threshold-based classification.** All 8 types are returned with their percentages. The UI displays them ranked by percentage.

**Optional: Future calibration.** If a ground-truth labeled dataset of self-identified player types is collected, Platt scaling or isotonic regression could calibrate the percentages to true probabilities. I cannot confirm this would improve user experience without empirical testing.

---

## 10. Composite Scores and Weighting

### 10.1 Weight Matrix Design

The weight matrix W[axis][type] was designed with the following principles:

- **Primary affinity (1.0)**: The axis is a defining characteristic of the type.
- **Secondary affinity (0.5)**: The axis correlates with but does not define the type.
- **No affinity (0 / absent)**: No meaningful relationship.

### 10.2 Normalization Strategy

Column normalization (dividing by total possible weight) is the chosen strategy because:

- **Problem**: Actor participates in 7 axes with total weight 5.0, while Explorer participates in 3 axes with total weight 2.0. Without normalization, Actor would structurally dominate.
- **Solution**: Dividing by P(t) scales each type to the proportion of its maximum possible contribution that was actually observed.
- **Alternative considered**: Z-score normalization. Rejected because it requires population statistics and varies with the dataset.
- **Alternative considered**: Rank-based fusion. Rejected because it discards magnitude information.

### 10.3 Weight Verification

The total possible weight constants are independently verifiable:

```
Actor:       A1(1.0) + A3(0.5) + A4(0.5) + A5(1.0) + A7(0.5) + A9(0.5) + A10(1.0) = 5.0 ✓
Explorer:    A1(0.5) + A2(1.0) + A3(0.5)                                             = 2.0 ✓
Instigator:  A2(0.5) + A3(1.0) + A5(0.5) + A6(0.5) + A7(1.0) + A9(1.0)             = 4.5 ✓
PowerGamer:  A4(0.5) + A6(0.5) + A8(1.0)                                             = 2.0 ✓
Slayer:      A3(1.0) + A6(1.0) + A9(1.0)                                             = 3.0 ✓
Storyteller: A1(1.0) + A2(0.5) + A4(0.5) + A5(0.5) + A8(0.5) + A10(1.0)            = 4.0 ✓
Thinker:     A2(0.5) + A4(1.0) + A6(0.5) + A8(1.0)                                  = 3.0 ✓
Watcher:     A1(0.5) + A4(0.5) + A5(1.0) + A9(1.0) + A10(0.5)                       = 3.5 ✓
```

This is tested programmatically in `verification.test.ts` (Category 10).

---

## 11. Uncertainty, Confidence, and Explanation

### 11.1 Explainability

The system provides multiple layers of explanation:

1. **Per-scene key quotes**: The LLM extracts a ≤20-word quote from each response that best demonstrates the dominant behavioral signal.
2. **Per-scene rationale**: The LLM explains why specific axes were scored high or low.
3. **Full calculation trace**: The `per_scene_details` JSONB column stores axis signals, pre-cap contributions, post-cap contributions, and the raw LLM inference for every scene.

### 11.2 Quote Assignment Algorithm

Quotes are assigned to types using a rank-priority system:

1. For each type (in percentage rank order, highest first), compute relevance to each scene: Σ(signal × weight for that type's axes).
2. Sort candidate scenes by relevance descending.
3. Assign up to 3 quotes per type, skipping scenes already assigned to higher-ranked types.
4. This ensures top types get the most relevant quotes, and no quote is reused.

### 11.3 Confidence

The system does not compute confidence intervals. The LLM operates at temperature 0 for maximum reproducibility, but LLM outputs are not guaranteed deterministic across API versions. The deterministic scorer guarantees identical output for identical axis signals.

**Optional**: Bootstrap confidence could be estimated by re-running LLM inference N times and computing variance in final percentages. I cannot confirm this would be cost-effective given GPT-4o pricing.

---

## 12. Fairness and Bias Mitigation

### 12.1 Structural Bias

The primary fairness concern is **structural bias in the weight matrix**: types with more axis connections accumulate more raw points. This is mitigated by column normalization (Section 6.7).

### 12.2 LLM Bias

The LLM may exhibit systematic biases in signal inference (e.g., interpreting certain writing styles as higher A1). Mitigation strategies:

- Temperature 0 reduces variance but does not eliminate systematic bias.
- The prompt explicitly instructs polarized scoring (6-8 axes at 0.0, 1-2 at 1.0-2.0).
- Signal snapping constrains output to a discrete set.

### 12.3 Verification

The fuzz test suite (10,000 random sessions) verifies that no single type dominates > 80% of top positions across random inputs. This is a proxy for detecting extreme structural bias.

### 12.4 Demographic Fairness

This system does not collect demographic data and does not classify users into protected groups. The assessment is anonymous (no login required). Demographic parity analysis is not applicable in the current design. If demographic data were collected in the future, per-group calibration could be performed.

---

## 13. Storage, Versioning, and Metadata

### 13.1 Results Table Schema

```sql
CREATE TABLE public.results (
    session_id UUID PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
    raw_scores JSONB NOT NULL DEFAULT '{}',
    normalized_scores JSONB NOT NULL DEFAULT '{}',
    percentages JSONB NOT NULL DEFAULT '{}',
    per_scene_details JSONB NOT NULL DEFAULT '{}',
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS: No public access. Written only by service-role edge function.
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- Index
CREATE INDEX idx_results_session_id ON public.results (session_id);
```

### 13.2 Column Descriptions

| Column | Type | Description |
|--------|------|-------------|
| `session_id` | UUID PK | References the assessed session |
| `raw_scores` | JSONB | `{ "Actor": 3.75, "Explorer": 2.0, ... }` - accumulated post-cap sums |
| `normalized_scores` | JSONB | `{ "Actor": 0.75, ... }` - bias-corrected scores |
| `percentages` | JSONB | `{ "Actor": 12.39, ... }` - final user-facing percentages |
| `per_scene_details` | JSONB | `{ "perScene": [...], "inference": [...] }` - full audit trace including LLM output |
| `computed_at` | TIMESTAMPTZ | When scoring was performed |

### 13.3 Audit Trace Structure

The `per_scene_details` column contains:

```json
{
  "perScene": [
    {
      "sceneNumber": 1,
      "axisSignals": { "A1": 2.0, "A5": 1.0 },
      "axisContributions": {
        "A1": { "Actor": 2.0, "Explorer": 1.0, "Storyteller": 2.0, "Watcher": 1.0 },
        "A5": { "Actor": 1.0, "Instigator": 0.5, "Storyteller": 0.5, "Watcher": 1.0 }
      },
      "preCapTypeContributions": { "Actor": 3.0, "Explorer": 1.0, "Instigator": 0.5, "Storyteller": 2.5, "Watcher": 2.0, ... },
      "postCapTypeContributions": { "Actor": 3.0, "Explorer": 0.5, "Instigator": 0.0, "Storyteller": 2.5, "Watcher": 2.0, ... }
    }
  ],
  "inference": [
    {
      "scene_id": 1,
      "axis_signals": { "A1": 2.0, "A2": 0, ... },
      "key_quote": "drawn by the mystery of the unknown",
      "rationale": "Strong narrative motivation..."
    }
  ]
}
```

### 13.4 Versioning

Currently, scoring logic is unversioned. There is no `score_version` column.

**Recommended migration if scoring logic changes:**

```sql
ALTER TABLE public.results ADD COLUMN score_version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE public.results ADD COLUMN config_hash TEXT;
```

When scoring logic changes:
1. Increment `score_version` in the edge function.
2. New sessions get the new version.
3. Old results are preserved with their original version.
4. Optional: batch-rescore historical sessions and store with new version.

### 13.5 Retention

No automatic retention policy is configured. Results are stored indefinitely. To implement retention:

```sql
-- Optional: scheduled function to purge results older than 90 days
DELETE FROM public.results
WHERE computed_at < now() - interval '90 days';
```

---

## 14. API Contract

### 14.1 POST - Score a Session

**Endpoint**: `POST /functions/v1/score-session` (via `supabase.functions.invoke('score-session', ...)`)

**Authentication**: Supabase anon key in Authorization header. The function uses service-role internally.

**Request:**

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Validation:**
- `session_id` must match UUID regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- Session must have exactly 12 responses with non-empty text ≤ 5000 chars each

**Success Response (200):**

```json
{
  "percentages": {
    "Actor": 12.39,
    "Explorer": 16.52,
    "Instigator": 9.18,
    "PowerGamer": 10.33,
    "Slayer": 16.52,
    "Storyteller": 13.42,
    "Thinker": 11.02,
    "Watcher": 10.62
  },
  "top_types": [
    {
      "type": "Explorer",
      "pct": 16.52,
      "quotes": [
        { "scene_id": 3, "quote": "I want to investigate every path" }
      ]
    },
    {
      "type": "Slayer",
      "pct": 16.52,
      "quotes": [
        { "scene_id": 2, "quote": "I draw my sword and charge" }
      ]
    }
  ]
}
```

**Already Scored (200):**

```json
{
  "already_scored": true,
  "percentages": { ... }
}
```

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Invalid request" }` | Bad UUID, wrong response count, empty text, text too long |
| 409 | `{ "error": "Session already scored or not found" }` | `scoring_requested` already true (concurrent/duplicate call) |
| 500 | `{ "error": "Unable to process request. Please try again." }` | LLM failure, output validation failure, internal error |

**Rate Limiting:** One scoring attempt per session (enforced by atomic `scoring_requested` flag).

---

## 15. Testing and Validation

### 15.1 Test Files

| File | Description |
|------|-------------|
| `src/lib/scoring/scorer.test.ts` | Core unit tests (543 lines) |
| `src/lib/scoring/verification.test.ts` | Stress tests across 10 categories (539 lines) |

### 15.2 Run Commands

```bash
# All tests
npx vitest run

# Watch mode
npx vitest

# Specific file
npx vitest run src/lib/scoring/scorer.test.ts

# With coverage
npx vitest run --coverage
```

### 15.3 Test Categories

| Category | Tests | What it validates |
|----------|-------|-------------------|
| Helpers | sum, applyPerTypeCap, enforceTotalCap, roundPercentages | Basic utility correctness |
| scoreScene | Single-axis, per-type cap, total cap, strongest preserved, empty | Per-scene scoring invariants |
| accumulateScenes | Multi-scene sum, empty array | Cross-scene accumulation |
| normalizeScores | Formula, structural bias correction, zero baseline | Normalization correctness |
| toPercentages | Sum to 100, equal for equal input | Percentage conversion |
| scoreSession | All-zeros, consistency, spec example, trace completeness | Full pipeline |
| getPublicResult | Descending sort, alphabetical tie-break | Output formatting |
| validateSessionInput | Valid, non-object, wrong count, invalid signals | Input validation |
| Fuzz (100 sessions) | Random sessions: no NaN, no negatives, sum=100, caps enforced | Robustness |
| Precision | Pipeline precision, edge-case floats | Numerical stability |

### 15.4 Verification Test Categories (10 categories)

| # | Category | Key assertions |
|---|----------|---------------|
| 1 | Determinism | 100 identical runs → byte-identical JSON output |
| 2 | Cap Enforcement | Per-type ≤ 4.0, total ≤ 8.0 for all inputs |
| 3 | Structural Bias | Actor < 40% even with Actor-heavy input; PowerGamer amplified by normalization |
| 4 | Uniform Activation | All-medium input → bounded, finite percentages |
| 5 | All-Zero Input | 12.5% equal distribution |
| 6 | Fuzz (10,000 sessions) | No invariant violations, no type > 80% of top positions |
| 7 | Floating Precision | 0.5 accumulation, repeating fractions, no > 100 or < 0 |
| 8 | Weakest-First Correctness | Strict ascending order, tie alphabetical, no-op at cap |
| 9 | Performance | 100,000 sessions with no degradation; no batch > 10× average |
| 10 | Trace Integrity | raw = Σ scenes, normalized matches formula, percentages derived from normalized, weight matrix column sums match constants |

### 15.5 Pass Criteria

- All tests green (zero failures)
- Percentage sums within ±0.01 of 100 across all fuzz inputs
- No NaN, Infinity, or negative values in any output
- Deterministic: `JSON.stringify(result1) === JSON.stringify(result2)` for 100 runs
- Performance: 100,000 sessions < 120 seconds

---

## 16. Monitoring, SLOs, and Alerting

### 16.1 SLOs

| Metric | Target |
|--------|--------|
| `score_session` p95 latency (end-to-end) | < 15 s |
| Scoring engine determinism | 100% |
| Percentage sum accuracy | |Σ − 100| < 0.01 |
| Output validation pass rate | > 99% |
| Edge function error rate | < 5% |

### 16.2 Key Log Lines (structured)

The edge function emits these structured log entries:

```
LLM finish_reason: stop, usage: {"prompt_tokens": 2500, "completion_tokens": 1200}
LLM inference completed in 4523ms
Validation passed. Distribution: {"Actor":12.39,"Explorer":16.52,...}
Output validation failed: Percentages sum to 99.5, not 100
score-session error: Error: OPENAI_API_KEY not configured
```

### 16.3 Metrics (Optional - Prometheus-compatible names)

```
score_session_duration_seconds{status="200"}         # histogram
score_session_llm_duration_seconds                    # histogram
score_session_llm_tokens_total{type="prompt"}         # counter
score_session_llm_tokens_total{type="completion"}     # counter
score_session_errors_total{error_type="llm_failure"}  # counter
score_session_errors_total{error_type="validation"}   # counter
score_session_errors_total{error_type="db_write"}     # counter
score_session_requests_total{status="200"}            # counter
score_session_requests_total{status="409"}            # counter
score_session_already_scored_total                    # counter
```

### 16.4 Alert Rules (Optional)

| Alert | Condition | Severity | Runbook |
|-------|-----------|----------|---------|
| High error rate | `score_session_errors_total / score_session_requests_total > 0.10` over 5 min | Critical | Check OPENAI_API_KEY, LLM availability |
| High latency | `score_session_duration_seconds p95 > 20s` over 10 min | Warning | Check OpenAI status page, consider retry tuning |
| Credits exhausted | HTTP 402 from OpenAI | Critical | Add OpenAI credits immediately |
| Validation failures | `score_session_errors_total{error_type="validation"} > 5` in 1 hour | Warning | LLM may be producing malformed output; check prompt |

### 16.5 Drift Detection

Since the scoring engine is deterministic, drift can only occur in:

1. **LLM output drift**: OpenAI model updates may change signal inference. Detection: compare signal distributions across time windows.
2. **Input drift**: Changes in user response patterns. Detection: monitor average signal strength per axis over rolling windows.

I cannot confirm specific statistical tests without empirical baseline data.

---

## 17. Scalability and Performance

### 17.1 Benchmarks

From verification tests (Category 9):

- 100,000 sessions scored in < 120 seconds
- No performance degradation across batches
- Scoring engine alone: sub-millisecond per session

### 17.2 Bottleneck

The LLM call dominates latency (typically 3–10 seconds). The scoring engine itself is negligible.

### 17.3 Optimizations

- **Idempotency**: Atomic `scoring_requested` flag prevents duplicate LLM calls.
- **Existing results check**: Returns cached results if already scored.
- **No vectorization needed**: Pure arithmetic on 10×8 matrix, 12 scenes. Standard loops are faster than library overhead.

---

## 18. Security and Privacy

### 18.1 Data Classification

| Data | Classification | Access |
|------|---------------|--------|
| User response text | PII-adjacent (freeform text may contain personal info) | Service-role only (via edge function) |
| Axis signals | Internal analytical data | Stored in `per_scene_details`, not publicly accessible |
| Percentages | Non-sensitive | Stored in `results`, not publicly readable (service-role only) |
| Email | PII | Separate `email_captures` table, insert-only, no public SELECT |

### 18.2 Access Control

- `results` table: RLS denies all public access. Only the `score-session` edge function (using `SUPABASE_SERVICE_ROLE_KEY`) can read/write.
- LLM API key: Stored as edge function secret, never exposed to client.
- Inference prompt: Server-side only (`supabase/functions/score-session/prompt.ts`), never sent to client.

### 18.3 Input Validation

- Session ID: UUID regex validated before any DB query.
- Response count: Exactly 12 required.
- Response length: Max 5000 characters per response.
- Signal values: Only {0, 0.5, 1.0, 2.0} accepted; others snapped or rejected.

### 18.4 GDPR/CCPA

To delete a user's scoring data:

```sql
-- Delete results for a specific session
DELETE FROM public.results WHERE session_id = 'REPLACE_WITH_SESSION_ID';
-- Also delete the session and responses
DELETE FROM public.responses WHERE session_id = 'REPLACE_WITH_SESSION_ID';
DELETE FROM public.email_captures WHERE session_id = 'REPLACE_WITH_SESSION_ID';
DELETE FROM public.sessions WHERE id = 'REPLACE_WITH_SESSION_ID';
```

Note: RLS policies currently deny DELETE for all tables. These operations must be performed with service-role credentials.

---

## 19. Operations and Runbook

### 19.1 Common Failure Modes

| Failure | Symptom | Immediate Mitigation |
|---------|---------|---------------------|
| OPENAI_API_KEY not set | 500 error, log: "OPENAI_API_KEY not configured" | Set the secret in edge function configuration |
| OpenAI credits exhausted | 500 error, log: "402" | Add credits to OpenAI account |
| OpenAI rate limited | 500 error, log: "429" | Wait and retry; increase rate limit tier |
| LLM returns no tool call | 500 after 1 retry | Check if OpenAI API changed tool calling format |
| Output validation fails | 500, log: "Output validation failed" | Check LLM response quality; review signal cleaning |
| Duplicate scoring | 409 (expected) | Normal behavior for repeat clicks |
| Session not found | 409 | Session may not exist or already scored |

### 19.2 Reset a Session for Re-scoring

```sql
-- Service-role only
UPDATE public.sessions SET scoring_requested = false WHERE id = 'REPLACE_WITH_SESSION_ID';
DELETE FROM public.results WHERE session_id = 'REPLACE_WITH_SESSION_ID';
```

### 19.3 Client-Side Session Reset

```javascript
localStorage.removeItem('astrobee_session_id');
location.reload();
```

### 19.4 Inspect Scoring Results

```sql
-- Fetch full scoring trace
SELECT
  session_id,
  percentages,
  raw_scores,
  normalized_scores,
  computed_at,
  jsonb_array_length(per_scene_details->'perScene') as scene_count
FROM public.results
WHERE session_id = 'REPLACE_WITH_SESSION_ID';
```

---

## 20. Change Management and Versioning

### 20.1 Scoring Logic Change Checklist

1. Modify `src/lib/scoring/` (source of truth)
2. Run `npx vitest run` - all tests must pass
3. Port changes to `supabase/functions/score-session/scoring.ts` (Deno)
4. Verify both files are in sync (manual diff)
5. Consider adding `score_version` column if output semantics change
6. Deploy via  (edge functions auto-deploy)

### 20.2 Migration Strategy for Historical Scores

If scoring logic changes materially:

```sql
-- Add version column
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS score_version TEXT DEFAULT 'v1';

-- Option A: Keep old scores, mark new version
-- (new sessions automatically get 'v2' from edge function)

-- Option B: Rescore historical sessions (batch job)
-- Requires fetching responses and re-running the pipeline
-- Store new results alongside old with different version
```

---

## 21. Sample Dataset and End-to-End Run

### 21.1 Synthetic Dataset (10 rows)

```json
[
  { "scene": 1,  "A1": 2.0, "A2": 0, "A3": 0, "A4": 0, "A5": 1.0, "A6": 0, "A7": 0, "A8": 0, "A9": 0, "A10": 0 },
  { "scene": 2,  "A1": 0, "A2": 0, "A3": 1.0, "A4": 0, "A5": 0, "A6": 2.0, "A7": 0, "A8": 0, "A9": 0, "A10": 0 },
  { "scene": 3,  "A1": 0, "A2": 1.0, "A3": 0, "A4": 0.5, "A5": 0, "A6": 0, "A7": 0, "A8": 0, "A9": 0, "A10": 0 },
  { "scene": 4,  "A1": 0, "A2": 0, "A3": 0, "A4": 2.0, "A5": 0, "A6": 0, "A7": 0, "A8": 2.0, "A9": 0, "A10": 0 },
  { "scene": 5,  "A1": 1.0, "A2": 0, "A3": 0, "A4": 0, "A5": 0, "A6": 0, "A7": 0, "A8": 0, "A9": 0, "A10": 2.0 },
  { "scene": 6,  "A1": 0, "A2": 0, "A3": 2.0, "A4": 0, "A5": 0, "A6": 1.0, "A7": 0.5, "A8": 0, "A9": 2.0, "A10": 0 },
  { "scene": 7,  "A1": 0, "A2": 0, "A3": 0, "A4": 0, "A5": 0, "A6": 0, "A7": 2.0, "A8": 0, "A9": 0, "A10": 0 },
  { "scene": 8,  "A1": 0, "A2": 2.0, "A3": 0, "A4": 1.0, "A5": 0, "A6": 0, "A7": 0, "A8": 0, "A9": 0, "A10": 0 },
  { "scene": 9,  "A1": 0.5, "A2": 0, "A3": 0, "A4": 0, "A5": 2.0, "A6": 0, "A7": 0, "A8": 0, "A9": 1.0, "A10": 0.5 },
  { "scene": 10, "A1": 0, "A2": 0, "A3": 0, "A4": 0, "A5": 0, "A6": 0, "A7": 0, "A8": 0, "A9": 0, "A10": 0 },
  { "scene": 11, "A1": 0, "A2": 0, "A3": 0.5, "A4": 0, "A5": 0, "A6": 2.0, "A7": 0, "A8": 1.0, "A9": 0, "A10": 0 },
  { "scene": 12, "A1": 1.0, "A2": 0, "A3": 0, "A4": 0, "A5": 0, "A6": 0, "A7": 0, "A8": 0, "A9": 0, "A10": 1.0 }
]
```

This dataset includes:
- Empty scene (scene 10) - edge case
- High combat scenes (2, 6, 11) - tests Slayer/Instigator clustering
- Analytical scenes (4, 8) - tests Thinker/PowerGamer
- Narrative/character scenes (5, 9, 12) - tests Actor/Storyteller
- Mixed signals (scene 6: A3=2.0, A6=1.0, A7=0.5, A9=2.0) - tests cap enforcement
- Weak signal (scene 9: A1=0.5) - tests half-value propagation

### 21.2 End-to-End Flow

```
1. Client submits session_id → edge function
2. Edge function fetches 12 responses from DB
3. Validates: 12 responses, non-empty, ≤ 5000 chars each
4. Builds prompt with scene text + user responses
5. Calls GPT-4o (temp=0, tool_call=infer_axis_signals)
6. Parses tool call JSON → 12 scenes × 10 axes
7. Cleans signals: snap to {0, 0.5, 1.0, 2.0}
8. Runs scoreSession() → full trace
9. Validates output: sum=100, no NaN, no negatives
10. Assigns quotes (rank-priority)
11. Upserts to results table
12. Returns { percentages, top_types }
```

**Example structured log output:**

```json
{
  "event": "score_complete",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "llm_duration_ms": 4523,
  "total_duration_ms": 4890,
  "llm_tokens": { "prompt": 2500, "completion": 1200 },
  "top_type": "Slayer",
  "top_pct": 16.52,
  "pct_sum": 100.0
}
```

---

## 22. Appendix

### 22.1 Glossary (restated)

See [Section 2](#2-terminology-and-glossary).

### 22.2 References

- Robin Laws' player types taxonomy (original D&D player classification framework)
- "Platt scaling" - John Platt, Probabilistic Outputs for Support Vector Machines (1999)
- "Isotonic regression" - standard non-parametric calibration method
- IEEE 754 floating-point arithmetic standard

### 22.3 Weight Matrix (tabular)

|       | Actor | Explorer | Instigator | PowerGamer | Slayer | Storyteller | Thinker | Watcher |
|-------|-------|----------|------------|------------|--------|-------------|---------|---------|
| A1    | 1.0   | 0.5      |            |            |        | 1.0         |         | 0.5     |
| A2    |       | 1.0      | 0.5        |            |        | 0.5         | 0.5     |         |
| A3    | 0.5   | 0.5      | 1.0        |            | 1.0    |             |         |         |
| A4    | 0.5   |          |            | 0.5        |        | 0.5         | 1.0     | 0.5     |
| A5    | 1.0   |          | 0.5        |            |        | 0.5         |         | 1.0     |
| A6    |       |          | 0.5        | 0.5        | 1.0    |             | 0.5     |         |
| A7    | 0.5   |          | 1.0        |            |        |             |         |         |
| A8    |       |          |            | 1.0        |        | 0.5         | 1.0     |         |
| A9    | 0.5   |          | 1.0        |            | 1.0    |             |         | 1.0     |
| A10   | 1.0   |          |            |            |        | 1.0         |         | 0.5     |
| **Σ** | **5.0** | **2.0** | **4.5**   | **2.0**    | **3.0** | **4.0**    | **3.0** | **3.5** |

---

## 23. Quick Reference

### Formulas

```
contribution(s,t) = Σ_a signal(s,a) × weight(a,t)
per_type_cap     = min(contribution, 4.0)
total_scene_cap  = weakest_first_reduce_to(8.0)
raw(t)           = Σ_s post_cap(s,t)
normalized(t)    = raw(t) / total_possible(t)
percentage(t)    = normalized(t) / Σ normalized × 100
```

### Constants

```
PER_TYPE_CAP        = 4.0
TOTAL_SCENE_CAP     = 8.0
BASELINE            = 0.0
FLOAT_TOLERANCE     = 1e-9
VALID_SIGNALS       = {0.0, 0.5, 1.0, 2.0}
SCENES              = 12
AXES                = 10
TYPES               = 8
```

### Commands

```bash
npx vitest run                     # Run all tests
npx vitest run --coverage          # With coverage
npm run build                      # Production build
```

### Files

```
src/lib/scoring/constants.ts       # Axes, types, weights, caps
src/lib/scoring/helpers.ts         # sum, caps, reduction
src/lib/scoring/scorer.ts          # Core scoring functions
src/lib/scoring/mocks.ts           # Test data generators
src/lib/scoring/scorer.test.ts     # Unit tests
src/lib/scoring/verification.test.ts # Stress tests (10 categories)
supabase/functions/score-session/  # Deno edge function (production)
```

---

## 24. Immediate Next Steps

1. Run `npx vitest run` to confirm all scoring tests pass.
2. Read the weight matrix table (Section 22.3) and verify the column sums match `TOTAL_POSSIBLE_WEIGHT` constants.
3. Trace through the worked example (Section 7) with a calculator to build intuition.
4. If modifying scoring logic: edit `src/lib/scoring/` first, run tests, then port to `supabase/functions/score-session/scoring.ts`.
5. If adding score versioning: add `score_version` column per Section 13.4.
6. Review edge function logs after a test scoring run to understand the LLM → scorer → storage pipeline end-to-end.
