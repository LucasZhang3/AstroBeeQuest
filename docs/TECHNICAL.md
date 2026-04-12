# Astrobee's Emporium - Technical Handoff Document

An interactive, narrative-driven web assessment that classifies users into one of eight D&D player archetypes through freeform storytelling, behavioral inference, and a deterministic scoring engine.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Application Flow - Phase by Phase](#2-application-flow--phase-by-phase)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Session Management & Persistence](#5-session-management--persistence)
6. [Database Schema & Row-Level Security](#6-database-schema--row-level-security)
7. [Edge Function: score-session](#7-edge-function-score-session)
8. [Edge Function: verify-bypass](#8-edge-function-verify-bypass)
9. [LLM Integration - Prompt Engineering & Tool Calling](#9-llm-integration--prompt-engineering--tool-calling)
10. [Deterministic Scoring Engine](#10-deterministic-scoring-engine)
11. [Quote Assignment Algorithm](#11-quote-assignment-algorithm)
12. [Results Visualization](#12-results-visualization)
13. [Animated Background System](#13-animated-background-system)
14. [Directory Layout](#14-directory-layout)
15. [Configuration & Secrets](#15-configuration--secrets)
16. [Testing](#16-testing)
17. [Build, Deploy & CI/CD](#17-build-deploy--cicd)
18. [Security Model](#18-security-model)
19. [Observability & Debugging](#19-observability--debugging)
20. [Runbook & Troubleshooting](#20-runbook--troubleshooting)
21. [Dual Scoring Engine Copies](#21-dual-scoring-engine-copies)
22. [Known Quirks & Design Decisions](#22-known-quirks--design-decisions)
23. [Handoff Checklist](#23-handoff-checklist)

---

## 1. High-Level Overview

Astrobee's Emporium presents users with 12 atmospheric D&D-themed scenarios. Users type freeform responses describing what they'd do in each situation. After all 12 scenes, the user provides an email address (or enters a secret admin bypass phrase), and the system computes their player identity.

**The pipeline:**

```
User writes 12 freeform responses
  → Responses stored in database
  → Edge function fetches all 12 responses
  → Prompt is constructed and sent to OpenAI GPT-4o
  → GPT-4o returns structured axis signals (10 behavioral axes × 12 scenes)
  → Signals are validated, cleaned, and snapped to valid values
  → Deterministic scoring engine computes 8 player-type percentages
  → Results + full audit trace are persisted
  → Client renders a radial orbital visualization with ranked types and evidence quotes
```

**Eight player types:** Actor, Explorer, Instigator, PowerGamer, Slayer, Storyteller, Thinker, Watcher.

**Ten behavioral axes:** Narrative Motivation (A1), Exploration Drive (A2), Risk Tolerance (A3), Cognitive Style (A4), Spotlight Comfort (A5), Combat Engagement (A6), Chaos Tolerance (A7), Rules Orientation (A8), Stimulation Need (A9), Character Identification (A10).

**Key guarantees:**
- Identical input always produces identical output (deterministic).
- Percentages always sum to exactly 100 (within floating-point tolerance of ±0.01).
- Full calculation trace is stored for every session (auditability).
- No user authentication is required (anonymous sessions).
- Email is insert-only with no public read access (privacy).

---

## 2. Application Flow - Phase by Phase

The app is a single-page React application with a four-phase state machine managed by the `Index` page component (`src/pages/Index.tsx`).

```typescript
type AppPhase = 'landing' | 'questionnaire' | 'email' | 'results';
```

### Phase 1: Landing (`LandingContent`)

**File:** `src/components/LandingContent.tsx`

- Full-screen hero with animated UnicornStudio particle background (desktop) or CSS starfield (mobile).
- Single CTA button: "BEGIN THE CLIMB".
- On click: 350ms fade-out animation, then transitions to `questionnaire` phase.
- The `BackgroundLayout` wrapper receives `animated={true}` only during this phase, controlling whether the heavy WebGL background renders.

### Phase 2: Questionnaire (`QuestionnaireContent`)

**File:** `src/components/QuestionnaireContent.tsx`

- Renders 12 scenes sequentially using data from `src/data/scenes.ts`.
- Each scene has a `promptText` (the narrative scenario) and a `characterLimit` (all currently 500 characters).
- The `useSession` hook manages all database persistence.
- On mount: creates or resumes a session (session ID stored in `localStorage` under key `astrobee_session_id`).
- The user's current response is pre-populated if they've previously answered that scene (session resumption).
- On "NEXT"/"SUBMIT": calls `saveResponseAndAdvance(inputValue, currentScene)` which:
  1. Upserts the response (using `session_id + scene_number` as the conflict key).
  2. Updates the session's `current_scene` and `status`.
  3. If scene 12, sets status to `completed`.
- Focus management: heading receives focus on scene change for accessibility (`tabIndex={-1}`, `headingRef.current?.focus()`).
- Progress bar: `(currentScene / 12) * 100`.
- When `status` becomes `completed`, calls `onComplete(sessionId)` which transitions to the `email` phase.

**ResponseInput component** (`src/components/ResponseInput.tsx`):
- Auto-resizing `<Textarea>` (min 52px, max 200px height).
- Hard character limit enforced client-side.
- Color-coded remaining character count: white/30 (normal) → yellow (≤50 remaining) → red (at limit).
- Enter key is suppressed (prevents accidental submit); only the explicit button submits.

### Phase 3: Email Gate (`EmailGate`)

**File:** `src/components/EmailGate.tsx`

- Collects a single email address before revealing results.
- **Validation flow:**
  1. If input passes `isValidEmail()` regex: insert into `email_captures` table.
  2. If input fails email regex: assume it might be an admin bypass phrase → call `verify-bypass` edge function.
  3. If bypass returns `{ valid: true }`: skip email collection and proceed.
  4. If bypass returns `{ valid: false }` or errors: show "Please enter a valid email address."
- **Email insert:** uses `supabase.from('email_captures').insert(...)`. Duplicate submissions (same session_id) are handled by catching Postgres unique violation error code `23505` and silently proceeding.
- On success: transitions to `results` phase.
- The `email_captures` table is cast with `as any` because the TypeScript types don't allow direct access (RLS blocks SELECT/UPDATE), but INSERT is permitted.

### Phase 4: Results (`ResultsContent`)

**File:** `src/components/ResultsContent.tsx`

- On mount: invokes the `score-session` edge function with `{ session_id }`.
- Handles three response patterns:
  - `data.already_scored`: session was previously scored, percentages returned from stored results.
  - `data.percentages + data.top_types`: fresh scoring result.
  - `data.error`: displays error message.
- Renders a `RadialOrbitalTimeline` component with all 8 types.
- "BEGIN ANEW" button: clears `localStorage` session ID and reloads the page.

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React SPA - Vite + TypeScript)                │
│  ┌──────────┐ ┌──────────────────┐ ┌──────────────────┐ │
│  │ Landing   │→│ Questionnaire    │→│ EmailGate        │ │
│  │ Content   │ │ (12 scenes)      │ │                  │ │
│  └──────────┘ └──────────────────┘ └────────┬─────────┘ │
│                                             │           │
│                                    ┌────────▼─────────┐ │
│                                    │ ResultsContent    │ │
│                                    │ (radial viz)      │ │
│                                    └──────────────────┘ │
└──────────┬──────────────────────────────────────────────┘
           │ Supabase JS SDK (anon key)
           ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase (Cloud Backend)                                │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐          │
│  │ sessions │ │responses │ │ email_captures  │          │
│  └──────────┘ └──────────┘ └─────────────────┘          │
│  ┌──────────┐                                            │
│  │ results  │ ← written by edge function (service role) │
│  └──────────┘                                            │
│                                                          │
│  Edge Functions:                                         │
│   • score-session  → LLM inference + deterministic score │
│   • verify-bypass  → admin bypass phrase check           │
└──────────────────────────────────────────────────────────┘
           │
           ▼
     OpenAI API (GPT-4o, tool calling, temperature=0)
```

---

## 4. Frontend Architecture

### Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 (dev server on port 8080) |
| Styling | Tailwind CSS 3 + tailwindcss-animate |
| Components | shadcn/ui (accordion, dialog, toast, textarea, etc.) |
| Routing | react-router-dom v6 (single route `/` + 404 catch-all) |
| State | React Query (QueryClient provider, though not actively used for data fetching - edge function calls use direct `supabase.functions.invoke`) |
| Notifications | Sonner + shadcn toast (both providers mounted in `App.tsx`) |
| Icons | Lucide React |

### Component Tree

```
App.tsx
├── QueryClientProvider
├── TooltipProvider
├── Toaster (shadcn)
├── Sonner
└── BrowserRouter
    └── Routes
        ├── / → Index.tsx
        │   └── BackgroundLayout (animated={phase === 'landing'})
        │       ├── LandingContent
        │       ├── QuestionnaireContent
        │       │   ├── useSession() hook
        │       │   ├── AnimatedPanel
        │       │   └── ResponseInput
        │       ├── EmailGate
        │       │   └── AnimatedPanel
        │       └── ResultsContent
        │           ├── AnimatedPanel
        │           └── RadialOrbitalTimeline
        └── * → NotFound
```

### AnimatedPanel

**File:** `src/components/ui/AnimatedPanel.tsx`

A reusable transition wrapper. When `panelKey` changes:
1. Sets `visible = false` (triggers CSS `opacity-0 translate-y-2`).
2. After 50ms, sets `visible = true` (triggers CSS `opacity-100 translate-y-0`).
3. CSS transition: 500ms cubic-bezier(0.16, 1, 0.3, 1).

This creates a consistent "float in from below" entrance animation for all content panels.

---

## 5. Session Management & Persistence

**File:** `src/hooks/useSession.ts`

The `useSession` hook is the core state machine for the assessment flow. It manages the full lifecycle of a user's session.

### State Shape

```typescript
interface SessionState {
  sessionId: string | null;
  currentScene: number;          // 1-12
  status: "in_progress" | "completed";
  currentResponse: string;       // Pre-populated text for current scene
  isLoading: boolean;
  error: string | null;
}
```

### Initialization Sequence (on mount)

```
1. Check localStorage for 'astrobee_session_id'
2. If found:
   a. Fetch session from DB (SELECT current_scene, status WHERE id = stored_id)
   b. If session not found or error → clear localStorage, create new session
   c. If session found → fetch existing response for current scene
   d. Populate state with session data
3. If not found:
   a. INSERT new session (current_scene=1, status='in_progress')
   b. Store new session ID in localStorage
   c. Set state to scene 1
```

### saveResponseAndAdvance(userText, sceneNumber)

This is called when the user clicks "NEXT" or "SUBMIT":

```
1. Determine next state:
   - If sceneNumber === 12: nextScene = 12, nextStatus = 'completed'
   - Else: nextScene = sceneNumber + 1, nextStatus = 'in_progress'

2. Upsert response:
   - INSERT INTO responses (session_id, scene_number, user_text)
   - ON CONFLICT (session_id, scene_number) DO UPDATE
   - This allows users to go back to a scene and change their answer (though the UI doesn't currently support going back)

3. Update session:
   - UPDATE sessions SET current_scene = nextScene, status = nextStatus WHERE id = sessionId

4. Pre-fetch next scene's response (if not last scene):
   - SELECT user_text FROM responses WHERE session_id AND scene_number = nextScene
   - This supports session resumption: if the user previously answered scene 5, their text will pre-populate

5. Update local state
```

### Session Resumption

If a user closes the browser and returns:
- `localStorage` has their session ID.
- The hook fetches their session state from the DB.
- If their session is `in_progress` at scene 7, they resume at scene 7 with their previous response pre-filled.
- If their session is `completed`, the `QuestionnaireContent` component detects `status === 'completed'` and immediately calls `onComplete(sessionId)`, skipping to the email gate.

### Session Reset

The "BEGIN ANEW" button on the results page:
```javascript
localStorage.removeItem('astrobee_session_id');
window.location.reload();
```
This creates a brand new session. The old session data remains in the database.

---

## 6. Database Schema & Row-Level Security

### Tables

#### `sessions`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | `gen_random_uuid()` | Primary key |
| `created_at` | timestamptz | `now()` | Creation timestamp |
| `current_scene` | integer | `1` | Current scene number (1-12) |
| `scoring_requested` | boolean | `false` | Atomic flag to prevent duplicate LLM calls |
| `status` | text | `'in_progress'` | Either `'in_progress'` or `'completed'` |

**RLS Policies:**
| Policy | Command | Type | Condition |
|--------|---------|------|-----------|
| Allow public insert | INSERT | RESTRICTIVE | `true` (anyone can create) |
| Allow public select | SELECT | RESTRICTIVE | `true` (anyone can read) |
| Scoped update | UPDATE | RESTRICTIVE | `USING: status = 'in_progress'` / `WITH CHECK: status IN ('in_progress', 'completed')` |
| No public delete | DELETE | RESTRICTIVE | `false` |

**Key behavior:** Sessions can only be updated while `in_progress`. Once set to `completed`, the session is frozen. The update policy's `WITH CHECK` allows the transition from `in_progress` → `completed` but prevents reverting back.

#### `responses`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | `gen_random_uuid()` | Primary key |
| `session_id` | uuid | - | FK → sessions.id |
| `scene_number` | integer | - | 1-12 |
| `user_text` | text | - | The user's freeform response |
| `created_at` | timestamptz | `now()` | Creation timestamp |

**Unique constraint:** `(session_id, scene_number)` - one response per scene per session.

**RLS Policies:**
| Policy | Command | Type | Condition |
|--------|---------|------|-----------|
| Allow public insert | INSERT | RESTRICTIVE | `true` |
| Scoped select | SELECT | RESTRICTIVE | `EXISTS (SELECT 1 FROM sessions s WHERE s.id = responses.session_id AND s.status = 'in_progress')` |
| Scoped update | UPDATE | RESTRICTIVE | Same as SELECT |
| No public delete | DELETE | RESTRICTIVE | `false` |

**Key behavior:** Responses can only be read/updated while the session is `in_progress`. Once the session is `completed`, responses become invisible to the client. The edge function uses a **service-role key** to bypass this restriction when fetching responses for scoring.

#### `results`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `session_id` | uuid | - | PK, FK → sessions.id, one-to-one |
| `raw_scores` | jsonb | `'{}'` | Raw accumulated scores per type |
| `normalized_scores` | jsonb | `'{}'` | Scores after column normalization |
| `percentages` | jsonb | `'{}'` | Final percentages (sum to 100) |
| `per_scene_details` | jsonb | `'[]'` | Full audit trace including LLM inference output |
| `computed_at` | timestamptz | `now()` | When scoring was computed |

**RLS Policies:**
| Policy | Command | Type | Condition |
|--------|---------|------|-----------|
| No public delete | DELETE | RESTRICTIVE | `false` |

**No SELECT, INSERT, or UPDATE policies exist for public users.** The `results` table is only readable/writable by the edge function using the service-role key. This protects score integrity.

**Stored `per_scene_details` structure:**
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
      "preCapTypeContributions": { "Actor": 3.0, "Explorer": 1.0, ... },
      "postCapTypeContributions": { "Actor": 3.0, "Explorer": 1.0, ... }
    }
  ],
  "inference": [
    {
      "scene_id": 1,
      "axis_signals": { "A1": 2.0, "A5": 1.0, "A2": 0, ... },
      "key_quote": "I step inside drawn by the mystery",
      "rationale": "Strong narrative investment and desire for spotlight..."
    }
  ]
}
```

This means every scored session has a complete, reconstructable audit trail: the raw LLM output, the cleaned signals, and every intermediate calculation step.

#### `email_captures`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | `gen_random_uuid()` | Primary key |
| `session_id` | uuid | - | FK → sessions.id, unique |
| `email` | text | - | User's email address |
| `created_at` | timestamptz | `now()` | When captured |

**Unique constraint:** `session_id` - one email per session.

**RLS Policies:**
| Policy | Command | Type | Condition |
|--------|---------|------|-----------|
| Allow public insert | INSERT | RESTRICTIVE | `true` |
| No public delete | DELETE | RESTRICTIVE | `false` |

**No SELECT or UPDATE policies.** Emails are write-once, read-never (from the client's perspective). Only service-role or direct DB access can read them.

### Important RLS Note

All policies are **RESTRICTIVE** (not PERMISSIVE). In Postgres, RESTRICTIVE policies are combined with AND logic against any PERMISSIVE policies. Since there are no PERMISSIVE policies on these tables, the RESTRICTIVE policies effectively act as the sole access rules. This is an intentional design choice but is worth noting if you add new policies - you may need to make them RESTRICTIVE as well, or add a baseline PERMISSIVE policy.

---

## 7. Edge Function: score-session

**File:** `supabase/functions/score-session/index.ts`

This is the core backend function. It orchestrates the entire scoring pipeline.

### Request

```
POST /functions/v1/score-session
Content-Type: application/json
Authorization: Bearer <anon_key>

{ "session_id": "550e8400-e29b-41d4-a716-446655440000" }
```

### Full Execution Flow

```
1. CORS preflight handling (OPTIONS → 200)

2. INPUT VALIDATION
   - Parse JSON body
   - Validate session_id is a valid UUID (regex: /^[0-9a-f]{8}-...$/i)
   - If invalid → 400 { error: "Invalid request" }

3. CREATE SUPABASE CLIENT (service-role key)
   - Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from Deno.env
   - Service-role bypasses all RLS

4. CHECK FOR EXISTING RESULTS
   - SELECT percentages FROM results WHERE session_id = ?
   - If found → 200 { already_scored: true, percentages: {...} }
   - This makes scoring idempotent: clicking "Reveal Results" multiple times is safe

5. ATOMIC CLAIM
   - UPDATE sessions SET scoring_requested = true
     WHERE id = session_id AND scoring_requested = false
   - Must return exactly one row (RETURNING id)
   - If no row returned → 409 { error: "Session already scored or not found" }
   - This prevents race conditions: if two requests arrive simultaneously,
     only one can flip the flag from false → true

6. FETCH ALL 12 RESPONSES
   - SELECT scene_number, user_text FROM responses
     WHERE session_id = ? ORDER BY scene_number ASC
   - Uses service-role key (responses are invisible to anon after session completion)

7. VALIDATE RESPONSES
   - Must have exactly 12 responses
   - Each scene_number must be 1-12, no duplicates
   - Each user_text must be non-empty and ≤ 5000 characters
   - If invalid → 400 { error: "Invalid request" }

8. BUILD LLM PROMPT
   - Constructs prompt using buildInferencePrompt() from prompt.ts
   - Includes all 12 scene prompts + user responses
   - Includes axis descriptions, signal value definitions, and scoring examples

9. CALL OpenAI GPT-4o
   - Model: gpt-4o
   - Temperature: 0 (deterministic)
   - max_tokens: 4096
   - Tool calling: forces use of "infer_axis_signals" tool
   - Parses tool_call response
   - On malformed response: automatic retry (max 1 retry)
   - Logs: finish_reason, token usage, latency

10. VALIDATE & CLEAN AXIS SIGNALS
    - For each scene (1-12), for each axis (A1-A10):
      - Skip unknown axis names
      - If value is in {0, 0.5, 1.0, 2.0}: use as-is
      - If value is out-of-range: snap to nearest valid value:
        - ≤ 0.25 → skip (treat as 0)
        - ≤ 0.75 → 0.5
        - ≤ 1.5 → 1.0
        - > 1.5 → 2.0
      - Zero values are omitted from the signal object (sparse representation)

11. DETERMINISTIC SCORING
    - scoreSession(session_id, cleanedScenes) → full ScoringResult
    - getPublicResult(scoringResult) → sorted types with percentages

12. VALIDATE OUTPUT
    - All 8 types present with numeric percentages
    - No negatives, no values > 100
    - Sum within ±0.01 of 100
    - If invalid → 500 { error: "classification_failed" }

13. ASSIGN QUOTES (see Section 11)

14. PERSIST RESULTS
    - UPSERT into results table:
      - raw_scores, normalized_scores, percentages, per_scene_details
      - per_scene_details includes BOTH the scoring trace AND the raw LLM inference output

15. RETURN RESPONSE
    - 200 { percentages: {...}, top_types: [...] }
```

### Error Responses

| Status | Body | When |
|--------|------|------|
| 400 | `{ error: "Invalid request" }` | Bad UUID, missing responses, validation failure |
| 409 | `{ error: "Session already scored or not found" }` | Duplicate scoring attempt (atomic claim failed) |
| 500 | `{ error: "Unable to process request. Please try again." }` | LLM failure, internal error |
| 200 | `{ already_scored: true, percentages: {...} }` | Results already exist for this session |

### CORS Configuration

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, ..."
};
```

All origins are allowed. This is intentional for a public SPA with no user authentication.

---

## 8. Edge Function: verify-bypass

**File:** `supabase/functions/verify-bypass/index.ts`

A simple server-side comparison of a user-provided phrase against the `BYPASS_SECRET` environment variable.

### Request/Response

```
POST /functions/v1/verify-bypass
{ "phrase": "some-secret-phrase" }

→ { "valid": true }  or  { "valid": false }
```

### Logic

```typescript
const valid = phrase === secret;  // exact string comparison
```

### Why it exists

The email gate is mandatory for all users. During development/testing, manually entering an email each time is tedious. The bypass lets testers skip the email gate by typing the secret phrase instead of an email. The phrase is stored server-side only - it never appears in client code.

---

## 9. LLM Integration - Prompt Engineering & Tool Calling

**File:** `supabase/functions/score-session/prompt.ts`

### Model Configuration

- **Model:** `gpt-4o`
- **Temperature:** `0` (fully deterministic - same input produces same output across calls)
- **max_tokens:** `4096`
- **Tool calling:** Forced to use `infer_axis_signals` function (no free-text response allowed)

### Prompt Structure

The prompt has five sections:

1. **Role:** "You are a behavioral psychometric engine analyzing D&D player-type responses."

2. **Axis Descriptions:** All 10 axes with detailed descriptions of what HIGH and LOW/ZERO signals mean. For example:
   - A1 (Narrative Motivation): "HIGH if they narrate in-character, describe feelings, or create story beats. LOW/ZERO if they give tactical or pragmatic answers."
   - A6 (Combat Engagement): "HIGH if they want to fight, discuss combat tactics, or seek confrontation. LOW/ZERO if they avoid violence or prefer diplomacy."

3. **Signal Strength Values:**
   - `0.0` = NO signal (use aggressively)
   - `0.5` = WEAK hint
   - `1.0` = CLEAR signal
   - `2.0` = DOMINANT signal (reserve for 1-2 axes per scene)

4. **Critical Rules for Differentiation:** Six rules that push the model toward polarized, discriminating outputs:
   - Evaluate ALL 10 axes for every scene
   - Be polarized (6-8 axes at 0.0, 1-2 at 1.0-2.0)
   - Use 2.0 liberally for dominant behaviors
   - Use 0.0 aggressively when no signal exists
   - Max 3-4 non-zero axes per response
   - Read actual words, don't infer hidden motivations
   - Extract a ≤20-word quote as evidence
   - Write a rationale

5. **Worked Examples:** Two examples showing good vs. bad scoring:
   ```
   Response: "I draw my sword and charge at the beast..."
   Good: A3=2.0, A6=2.0, A9=1.0, all others=0.0
   Bad:  A3=1.0, A6=1.0, A5=0.5, A9=0.5, A1=0.5  (too flat)
   ```

6. **Scenes:** All 12 scene prompts paired with the user's response.

### Tool Definition

The `infer_axis_signals` tool enforces structured output:

```json
{
  "scenes": [
    {
      "scene_id": 1,
      "axis_signals": {
        "A1": 0.0, "A2": 0.0, "A3": 2.0, "A4": 0.0, "A5": 0.0,
        "A6": 2.0, "A7": 0.0, "A8": 0.0, "A9": 1.0, "A10": 0.0
      },
      "key_quote": "I draw my sword and charge",
      "rationale": "Direct combat approach with high risk tolerance..."
    }
  ]
}
```

All 10 axes are required in the schema (`required: ["A1", ..., "A10"]`). This ensures complete coverage and prevents the model from silently omitting axes.

### Retry Logic

If the first LLM call fails to produce a valid tool call:
- On missing `tool_calls` in response: retry once.
- On JSON parse failure of `tool_calls[0].function.arguments`: retry once.
- After second failure: throw error → 500 response.

### Signal Cleaning

After receiving LLM output, signals are cleaned before scoring:

```
For each scene (1-12):
  For each axis in the LLM output:
    - Skip if axis name not in {A1..A10}
    - Parse to number
    - If value ∈ {0, 0.5, 1.0, 2.0}: keep
    - If 0 < value ≤ 0.25: drop (treat as noise)
    - If 0.25 < value ≤ 0.75: snap to 0.5
    - If 0.75 < value ≤ 1.5: snap to 1.0
    - If value > 1.5: snap to 2.0
    - Zero values are not stored (sparse representation)
```

This handles edge cases where the model returns non-standard values like 0.3 or 1.7 despite being instructed to use only {0, 0.5, 1.0, 2.0}.

---

## 10. Deterministic Scoring Engine

The scoring engine is a pure-function pipeline with no randomness, no external dependencies, and no side effects. Given the same axis signals, it always produces the same percentages.

**Files:**
- `src/lib/scoring/constants.ts` - All constants, types, and the weight matrix
- `src/lib/scoring/helpers.ts` - Utility functions (sum, caps, rounding)
- `src/lib/scoring/scorer.ts` - Core scoring functions
- `src/lib/scoring/index.ts` - Barrel export
- `supabase/functions/score-session/scoring.ts` - Deno port (duplicated for edge function runtime)

### Step 1: Weight Matrix Multiplication

Each axis contributes to specific player types with defined weights:

```
A1  (Narrative Motivation):   Actor 1.0, Explorer 0.5, Storyteller 1.0, Watcher 0.5
A2  (Exploration Drive):      Explorer 1.0, Instigator 0.5, Storyteller 0.5, Thinker 0.5
A3  (Risk Tolerance):         Actor 0.5, Explorer 0.5, Instigator 1.0, Slayer 1.0
A4  (Cognitive Style):        Actor 0.5, PowerGamer 0.5, Storyteller 0.5, Thinker 1.0, Watcher 0.5
A5  (Spotlight Comfort):      Actor 1.0, Instigator 0.5, Storyteller 0.5, Watcher 1.0
A6  (Combat Engagement):      Instigator 0.5, PowerGamer 0.5, Slayer 1.0, Thinker 0.5
A7  (Chaos Tolerance):        Actor 0.5, Instigator 1.0
A8  (Rules Orientation):      PowerGamer 1.0, Storyteller 0.5, Thinker 1.0
A9  (Stimulation Need):       Actor 0.5, Instigator 1.0, Slayer 1.0, Watcher 1.0
A10 (Character Identification): Actor 1.0, Storyteller 1.0, Watcher 0.5
```

For each scene, the contribution of each axis to each type is:

```
contribution(axis, type) = signal_strength(axis) × weight(axis, type)
```

These are summed per type:

```
preCapContribution(type) = Σ over all axes: signal(axis) × weight(axis, type)
```

**Floating point note:** After summation, values are rounded to 10 decimal places (`Math.round(x * 1e10) / 1e10`) to prevent drift accumulation.

### Step 2: Per-Type Cap (4.0 per type per scene)

```typescript
if (preCapContribution[type] > 4.0) {
  postCapContribution[type] = 4.0;
}
```

This prevents any single scene from excessively inflating one type. For example, if someone's response triggers `A1=2.0, A5=2.0, A7=2.0, A10=2.0`, the Actor's raw contribution would be `2×1.0 + 2×1.0 + 2×0.5 + 2×1.0 = 7.0`, but it's capped to 4.0.

### Step 3: Total Scene Cap (8.0 total per scene) - Weakest-First Reduction

If the sum of all post-per-type-cap contributions exceeds 8.0, the excess must be removed. The algorithm preserves the strongest signals by reducing the weakest first:

```
1. Calculate excess: over = total - 8.0
2. While over > 0:
   a. Sort types by contribution ascending (weakest first)
   b. For ties: sort alphabetically (deterministic)
   c. For each type (weakest first):
      - Reduce by min(contribution, remaining excess)
      - Update contribution and remaining excess
3. Final cleanup: if floating-point drift causes total ≠ 8.0,
   adjust the largest contributor by the residual
```

**Why weakest-first?** If a scene strongly activates both Slayer and Actor, we want to preserve both strong signals. By cutting from the weakest types first (e.g., a 0.25 Explorer contribution), the dominant signals survive intact.

### Step 4: Accumulation Across 12 Scenes

```
rawScore(type) = Σ over all 12 scenes: postCapContribution(scene, type)
```

Rounded to 10 decimal places after summation.

### Step 5: Column Normalization

Different player types have different total possible weights (sum of weights across all axes). Actor has 5.0 total possible weight while Explorer has only 2.0. Without normalization, Actor would structurally dominate.

```
normalizedScore(type) = NORMALIZATION_BASELINE + rawScore(type) / TOTAL_POSSIBLE_WEIGHT(type)
```

Where `NORMALIZATION_BASELINE = 0.0` and:

```
Total Possible Weight:
  Actor:      5.0
  Instigator: 4.5
  Storyteller: 4.0
  Watcher:    3.5
  Slayer:     3.0
  Thinker:    3.0
  Explorer:   2.0
  PowerGamer: 2.0
```

This means Explorer needs fewer raw points to achieve the same normalized score as Actor, correcting for the structural bias in the weight matrix.

### Step 6: Percentage Conversion

```
percentage(type) = (normalizedScore(type) / Σ allNormalizedScores) × 100
```

**Edge case:** If all normalized scores are 0 (all-zeros input), distribute equally: `100 / 8 = 12.5%` per type.

### Tie-Breaking

When types have identical percentages, they are sorted alphabetically. This is deterministic:
```typescript
.sort((a, b) => {
  const diff = b.pct - a.pct;
  if (Math.abs(diff) < 1e-9) {
    return a.type.localeCompare(b.type);  // alphabetical for ties
  }
  return diff;
})
```

### Expected Score Distribution

With the 0.0 baseline and current cap values, results typically show:
- **Dominant types:** 25-40% (types strongly supported by the user's responses)
- **Mid-range types:** 10-15% (some signal but not dominant)
- **Low types:** 3-8% (minimal or no signal)
- **Distribution shape:** Roughly normal, with clear differentiation between top and bottom types

---

## 11. Quote Assignment Algorithm

**File:** `supabase/functions/score-session/index.ts` (lines 272-310)

Each type in the results gets up to 3 evidence quotes - actual excerpts from the user's responses that demonstrate why they scored that way.

### Algorithm

```
1. PRE-COMPUTE RELEVANCE
   For each type (all 8, sorted by percentage descending):
     For each scene (1-12) that has a key_quote from LLM:
       relevance = Σ over axes: signal(axis) × weight(axis, type)
       If relevance > 0: add to candidate list
     Sort candidates by relevance descending

2. ASSIGN QUOTES (rank-priority)
   Track globally used scene_ids (each scene's quote used only once)
   For each type in rank order (highest percentage first):
     Pick up to 3 quotes from candidates where scene_id not yet used
     Mark picked scene_ids as used

3. RESULT
   Top-ranked types get first pick of the most relevant quotes
   Lower-ranked types get remaining quotes
   Some types may get 0 quotes if all relevant scenes are claimed
```

**Why rank-priority?** The top types are the most important to the user. They should get the best, most relevant quotes. Lower types get whatever is left, which is acceptable since users primarily care about their top 3.

---

## 12. Results Visualization

**File:** `src/components/ui/radial-orbital-timeline.tsx`

An interactive radial orbit display where 8 player types are arranged in a circle.

### Visual Design

- **Orbit:** Types rotate slowly (0.3° every 50ms) in a 360px-diameter circle.
- **Auto-rotate:** Enabled by default; pauses when a node is expanded.
- **Node sizing:** Top 3 types have larger nodes (44px) than others (34px); expanded = 52px.
- **Color coding:** Top 3 use distinct colors:
  - #1: Amber/gold (`#fbbf24`)
  - #2: Sky blue (`#38bdf8`)
  - #3: Copper/orange (`#fb923c`)
  - Others: white at 50% opacity

### Interaction

- **Tap a node:** Stops rotation, rotates to center that node at the top (270° offset), expands a detail panel.
- **Detail panel shows:**
  - Type name and percentage
  - Description of the archetype
  - Score bar (visual, width = `min(energy * 2, 100)%`)
  - Evidence quotes (from the quote assignment algorithm)
  - Related types (clickable, navigates to that node)
- **Tap empty space:** Closes detail panel, resumes auto-rotation.

### 3D Effect

Nodes are positioned with a pseudo-3D effect:
```typescript
const scale = 0.7 + 0.3 * ((1 + Math.sin(radian)) / 2);       // smaller at top, larger at bottom
const opacity = 0.35 + 0.65 * ((1 + Math.sin(radian)) / 2);    // dimmer at top, brighter at bottom
const zIndex = Math.round(100 + 50 * Math.cos(radian));         // layering
```

### Related Types

Hardcoded relationships between types:
```typescript
const TYPE_RELATIONS = {
  Actor:      ['Storyteller', 'Watcher', 'Instigator'],
  Explorer:   ['Storyteller', 'Instigator', 'Thinker'],
  Instigator: ['Slayer', 'Actor', 'Explorer'],
  PowerGamer: ['Thinker', 'Slayer'],
  Slayer:     ['Instigator', 'PowerGamer', 'Watcher'],
  Storyteller:['Actor', 'Explorer', 'Thinker'],
  Thinker:    ['PowerGamer', 'Storyteller', 'Explorer'],
  Watcher:    ['Actor', 'Storyteller', 'Slayer'],
};
```

When a node is expanded, dashed SVG lines are drawn from it to its related nodes.

---

## 13. Animated Background System

**File:** `src/components/ui/BackgroundLayout.tsx`

### UnicornStudio Integration

The landing page uses a WebGL particle animation from UnicornStudio (project ID: `OMzqyUv6M3kSnv0JeAtC`).

**Loading mechanism:**
1. On mount (when `animated=true`), injects a `<script>` that loads `/vendor/unicornStudio.umd.js`.
2. Once loaded, calls `UnicornStudio.init()` which finds `[data-us-project]` elements and renders WebGL canvases into them.
3. The UMD script is bundled locally in `public/vendor/` (no external CDN dependency).

**Branding removal:**
The component aggressively hides UnicornStudio branding:
- CSS rules hiding elements with specific class patterns (`brand`, `credit`, `watermark`).
- JavaScript interval (every 50ms) + deferred timeouts that scan for elements containing "Made with" or "unicorn" and remove them.
- Canvas clip-path crops bottom 10% to hide the watermark area.

**Mobile fallback:**
On screens below `md` breakpoint, a CSS class `hero-stars-bg` is shown instead of the WebGL animation (defined in `src/index.css`).

**Performance:**
- The WebGL background only renders during the `landing` phase.
- When transitioning to `questionnaire`, `animated` becomes `false`, and the entire background unmounts (cleanup function removes injected scripts and styles).

### Layout Structure

```
BackgroundLayout
├── Animated background (z-0, absolute, landing only)
├── HeroHeader (z-10, relative)
│   └── "ASTROBEE · EST. 2026" + coordinates
├── CornerAccents (z-10, absolute)
│   └── 4 corner brackets (top-left, top-right, bottom-left, bottom-right)
├── <main> (z-10, flex-1)
│   └── {children} ← phase content renders here
└── FooterStatus (z-20, absolute, bottom 5vh)
    └── "SYSTEM.ACTIVE · V1.0.0" + animation dots
```

---

## 14. Directory Layout

```
├── docs/
│   ├── README.md               ← This file
│   ├── README_PUBLIC.md         ← Public-facing README for GitHub
│   ├── SCORING.md               ← Exhaustive scoring algorithm docs
│   └── scoring-engine.md        ← Concise scoring reference
├── public/
│   ├── vendor/
│   │   └── unicornStudio.umd.js ← Bundled WebGL animation library
│   ├── placeholder.svg
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── EmailGate.tsx        ← Email collection + bypass
│   │   ├── LandingContent.tsx   ← Hero screen
│   │   ├── QuestionnaireContent.tsx ← 12-scene questionnaire
│   │   ├── ResponseInput.tsx    ← Auto-resizing textarea
│   │   ├── ResultsContent.tsx   ← Results display + edge fn invocation
│   │   ├── Assessment.tsx       ← (Legacy, unused)
│   │   ├── CompletionScreen.tsx ← (Legacy, unused)
│   │   ├── SceneDisplay.tsx     ← (Legacy, unused)
│   │   ├── NavLink.tsx          ← (Legacy, unused)
│   │   ├── ProgressBar.tsx      ← (Legacy, unused)
│   │   └── ui/
│   │       ├── AnimatedPanel.tsx       ← Fade/slide transition wrapper
│   │       ├── BackgroundLayout.tsx    ← Full-page layout + UnicornStudio
│   │       ├── radial-orbital-timeline.tsx ← Results orbital visualization
│   │       └── ... (shadcn/ui components)
│   ├── data/
│   │   └── scenes.ts            ← 12 scene definitions (prompts + char limits)
│   ├── hooks/
│   │   └── useSession.ts        ← Session state machine
│   ├── integrations/supabase/
│   │   ├── client.ts            ← Auto-generated Supabase client (DO NOT EDIT)
│   │   └── types.ts             ← Auto-generated DB types (DO NOT EDIT)
│   ├── lib/scoring/
│   │   ├── constants.ts         ← Axes, types, weight matrix, caps, types
│   │   ├── helpers.ts           ← sum, caps, rounding, validation
│   │   ├── scorer.ts            ← scoreScene, scoreSession, getPublicResult
│   │   ├── mocks.ts             ← Test data generators
│   │   ├── scorer.test.ts       ← Unit tests
│   │   ├── verification.test.ts ← Cross-verification tests
│   │   └── index.ts             ← Barrel export
│   ├── pages/
│   │   ├── Index.tsx            ← Main page (4-phase state machine)
│   │   └── NotFound.tsx         ← 404 page
│   ├── App.tsx                  ← Root component + providers
│   ├── main.tsx                 ← Entry point
│   └── index.css                ← Design tokens, Tailwind base
├── supabase/
│   ├── config.toml              ← Auto-managed config (DO NOT EDIT)
│   ├── migrations/              ← SQL migrations (auto-applied, READ ONLY)
│   └── functions/
│       ├── score-session/
│       │   ├── index.ts         ← Edge function entry point
│       │   ├── scoring.ts       ← Deno port of scoring engine
│       │   └── prompt.ts        ← LLM prompt + tool definition
│       └── verify-bypass/
│           └── index.ts         ← Admin bypass verification
├── .env                         ← Auto-managed (DO NOT EDIT)
├── index.html                   ← SPA entry with meta tags
├── package.json
├── tailwind.config.ts
├── vite.config.ts
└── vitest.config.ts
```

---

## 15. Configuration & Secrets

### Environment Variables (auto-managed, DO NOT EDIT)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Backend API base URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/public key for client SDK |
| `VITE_SUPABASE_PROJECT_ID` | Project identifier |

### Edge Function Secrets

| Secret | Purpose | How to Rotate |
|--------|---------|---------------|
| `OPENAI_API_KEY` | GPT-4o inference in `score-session` | Update via cloud secrets management |
| `BYPASS_SECRET` | Admin bypass phrase for email gate | Update via cloud secrets management |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge function DB writes (bypasses RLS) | Auto-provisioned, managed by platform |
| `SUPABASE_URL` | Edge function DB access | Auto-provisioned |
| `SUPABASE_ANON_KEY` | Auto-provisioned | Managed by platform |
| `PLATFORM_API_KEY` | Platform integration | Auto-provisioned |

### Files You Must Never Edit

- `src/integrations/supabase/client.ts` - auto-generated
- `src/integrations/supabase/types.ts` - auto-generated
- `supabase/config.toml` - auto-managed
- `.env` - auto-managed
- `supabase/migrations/` - read-only after creation

---

## 16. Testing

### Running Tests

```bash
# All tests
npx vitest run

# Watch mode
npx vitest

# Specific file
npx vitest run src/lib/scoring/scorer.test.ts
```

### Test Suites

**`src/lib/scoring/scorer.test.ts`:**
- Single-axis dominance (e.g., A6=2.0 → Slayer should be highest)
- Per-type cap enforcement (verify no type exceeds 4.0 per scene)
- Total scene cap enforcement (verify no scene exceeds 8.0 total)
- Cross-scene accumulation (12 scenes aggregate correctly)
- Normalization fairness (Explorer with 2.0 weight isn't disadvantaged vs Actor with 5.0)
- All-zeros edge case (equal distribution: 12.5% each)
- Determinism (same input → bitwise identical output)
- Sum-to-100 precision (`|Σ - 100| < 0.01`)
- Tie-breaking (alphabetical ordering for equal percentages)
- Fuzz testing (100+ randomly generated sessions, all validated)

**`src/lib/scoring/verification.test.ts`:**
- Cross-verification of scoring invariants

### Mock Data

**File:** `src/lib/scoring/mocks.ts`

Provides generators for test data:
- `generateMockSession(id, preset)` - creates 12-scene session with preset signal patterns
- Presets: `actor-heavy`, `explorer-heavy`, `slayer-heavy`, `thinker-heavy`, `balanced`, `low-signal`, `high-signal`, `random`
- `generateEmptySession()` - all-zeros
- `generateSpecExampleSession()` - the 3-scene example from the spec (padded to 12)
- `fuzzGenerator(count)` - generator yielding `count` random sessions
- `validateFuzzResult()` - validates percentages sum, no NaNs/negatives, cap enforcement

---

## 17. Build, Deploy & CI/CD

### Local Development

```bash
npm install
npm run dev        # → http://localhost:8080
```

### Production Build

```bash
npm run build      # Output: dist/
npm run preview    # Preview locally
```

### Deployment

- Frontend changes require clicking "Update" in the publish dialog.
- Edge functions deploy automatically when code changes.
- Database migrations apply automatically on deploy.

### CI Pipeline (recommended)

| Stage | Command | Expected Output |
|-------|---------|-----------------|
| Lint | `npm run lint` | Zero errors/warnings |
| Typecheck | `tsc --noEmit` | Clean compilation |
| Test | `npx vitest run` | All tests pass |
| Build | `npm run build` | `dist/` produced, zero errors |
| Deploy | Auto-deploy | Preview URL updated |

### Rollback

Restore to a previous Git commit in version history. For edge functions, re-deploy the previous version. For database changes, a new migration may be needed to revert.

---

## 18. Security Model

| Control | Implementation |
|---------|---------------|
| **API key protection** | `OPENAI_API_KEY` stored as edge function secret; never sent to client |
| **Prompt protection** | Inference prompt lives server-side only in `score-session/prompt.ts` |
| **Row Level Security** | All 4 tables have RLS enabled; `results` has no public access; `email_captures` is insert-only |
| **Input validation** | UUID regex on session_id; 12-response count check; max 5000 char per response; signal value whitelist {0, 0.5, 1.0, 2.0} |
| **Email PII** | Insert-only; no public SELECT/UPDATE/DELETE |
| **Scoring idempotency** | Atomic `scoring_requested` flag (UPDATE WHERE scoring_requested = false) prevents duplicate LLM calls |
| **Admin bypass** | Server-side string comparison only; bypass phrase never in client code |
| **CORS** | `Access-Control-Allow-Origin: *` (acceptable for unauthenticated public SPA) |
| **Transport** | HTTPS enforced by platform |

### Scoring Integrity

The scoring pipeline is protected against manipulation:
1. **Client cannot send axis signals.** The client only submits `session_id`; the edge function fetches responses and runs inference server-side.
2. **Client cannot read results directly.** The `results` table has no public SELECT policy. Results are only returned through the `score-session` edge function response.
3. **Duplicate scoring is prevented.** The atomic `scoring_requested` flag ensures only one LLM call per session, even under race conditions.
4. **Signal values are validated.** Out-of-range values from the LLM are snapped to the nearest valid value or dropped.
5. **Output is validated.** If percentages don't sum to 100 or contain invalid values, the request fails with a 500 error rather than returning bad data.

---

## 19. Observability & Debugging

### Edge Function Logs

Key log lines from `score-session`:

| Log Line | What It Tells You |
|----------|-------------------|
| `LLM finish_reason: stop, usage: {prompt_tokens: X, completion_tokens: Y}` | Token consumption and whether the model finished normally |
| `LLM inference completed in Xms` | End-to-end LLM latency |
| `Parsed 12 scenes. Scene 1 full: {...}` | The raw LLM output for scene 1 (useful for debugging signal quality) |
| `Validation passed. Distribution: {...}` | Final percentages - confirms scoring succeeded |
| `Output validation failed: ...` | Something went wrong with the scoring output |
| `LLM error (attempt N): STATUS BODY` | OpenAI API error (rate limit, credits, etc.) |
| `Retrying...` | First LLM attempt failed, trying again |
| `Error storing results: ...` | Database write failed (check RLS, constraints) |

### Debugging Common Issues

**Session stuck / can't advance:**
```javascript
// Browser console
localStorage.getItem('astrobee_session_id');  // Current session ID
localStorage.removeItem('astrobee_session_id');  // Force new session
location.reload();
```

**Check session state in database:**
Query the `sessions` table for the session ID. Check `status`, `current_scene`, and `scoring_requested` values.

**Inspect stored results:**
Query the `results` table for the session ID. The `per_scene_details` JSONB column contains the full LLM inference output and scoring trace.

---

## 20. Runbook & Troubleshooting

### Common Failures

| Symptom | Likely Cause | Mitigation |
|---------|-------------|------------|
| "Something went wrong" on email submit | RLS policy blocking INSERT on `email_captures` | Check policy exists, is RESTRICTIVE with `true` check |
| "Failed to compute results" | `score-session` edge function error | Check edge function logs; verify `OPENAI_API_KEY` is set and funded |
| "Session already scored or not found" (409) | Duplicate scoring request | Expected for repeat clicks; results already exist |
| Blank results page | `score-session` returned empty `top_types` | Check LLM response quality; verify signal cleaning logic |
| Session not resuming | `localStorage` cleared or different browser | Expected; sessions are browser-local |
| RLS "new row violates policy" | Policy is RESTRICTIVE and conditions aren't met | Check that session status is `in_progress` for response writes |
| Infinite loading spinner | Network error or edge function timeout | Check browser console for errors; verify edge function is deployed |
| OpenAI 402 error | API credits exhausted | Add credits to OpenAI account; update API key if needed |
| OpenAI 429 error | Rate limited | Wait and retry; edge function has built-in retry for this |

### Emergency: Reset a User's Session

```javascript
// In browser console
localStorage.removeItem('astrobee_session_id');
location.reload();
```

### Emergency: Reprocess a Session's Scores

Currently there is no re-scoring mechanism. To re-score:
1. Delete the existing results row for the session (requires service-role access).
2. Set `scoring_requested = false` on the session.
3. Have the user click "Reveal Results" again to trigger re-scoring.

---

## 21. Dual Scoring Engine Copies

The scoring engine exists in two copies that **must be kept in sync manually**:

| Copy | Location | Runtime | Purpose |
|------|----------|---------|---------|
| Primary | `src/lib/scoring/` | Node/Vite (TypeScript) | Unit tests, development |
| Deno port | `supabase/functions/score-session/scoring.ts` | Deno (edge function) | Production scoring |

### What's different between the copies

The Deno port (`scoring.ts`) is a single-file consolidation of `constants.ts` + `helpers.ts` + `scorer.ts`. The logic is identical, but:
- Types are defined inline rather than imported.
- Helper functions are defined in the same file.
- No barrel export - functions are exported directly.

### Sync procedure

When changing scoring logic:
1. Make the change in `src/lib/scoring/` (primary copy).
2. Run `npx vitest run` to verify tests pass.
3. Port the exact same change to `supabase/functions/score-session/scoring.ts`.
4. Manually verify the logic matches.

**There are no automated checks that the two copies are in sync.** This is a known maintenance burden.

---

## 22. Known Quirks & Design Decisions

### TypeScript `as any` Casts

In `EmailGate.tsx`:
```typescript
supabase.from('email_captures' as any).insert({...} as any)
```
This is because the auto-generated types may not include `email_captures` or its RLS policies make the TypeScript SDK think inserts aren't possible. The cast is intentional.

### RESTRICTIVE vs PERMISSIVE RLS

All policies are RESTRICTIVE. This is unusual - most Supabase projects use PERMISSIVE policies. The behavior is:
- PERMISSIVE: "Allow if ANY permissive policy matches"
- RESTRICTIVE: "Deny unless ALL restrictive policies pass"

Since there are no PERMISSIVE policies, the RESTRICTIVE policies are the sole gatekeepers. New policies should also be RESTRICTIVE for consistency.

### No Back Navigation

Users cannot go back to previous scenes in the questionnaire. The `useSession` hook only supports forward progression. Previous responses are preserved in the database (upsert on conflict), but the UI doesn't expose a "Previous" button.

### No User Authentication

Sessions are anonymous. The only identifier is the UUID in `localStorage`. If a user clears their browser data or uses a different device, they get a new session with no way to resume the old one.

### Legacy Components

Several components exist in `src/components/` but are unused:
- `Assessment.tsx`
- `CompletionScreen.tsx`
- `SceneDisplay.tsx`
- `NavLink.tsx`
- `ProgressBar.tsx`

These are remnants from earlier iterations. They can be safely removed.

### Scene Prompts Duplicated

The 12 scene prompts exist in two places:
1. `src/data/scenes.ts` - used by the frontend to display prompts.
2. `supabase/functions/score-session/index.ts` (lines 14-27) - hardcoded in `SCENE_PROMPTS` record, used to build the LLM prompt.

These must match. If you change a scene prompt, update both locations.

### Fuzz Test Cap Values

The fuzz test validator in `mocks.ts` uses older cap values (3.5 per-type cap, 6.0 total scene cap) that don't match the current constants (4.0 and 8.0). The actual scoring engine uses the values from `constants.ts`, so the fuzz validator may report false positives if the difference matters. The unit tests in `scorer.test.ts` use the correct values.

---

## 23. Handoff Checklist

As an incoming developer:

- [ ] Run `npm install && npm run dev` and complete a full 12-scene assessment
- [ ] Run `npx vitest run` - all tests should pass
- [ ] Read the 12 scene prompts in `src/data/scenes.ts`
- [ ] Read the weight matrix in `src/lib/scoring/constants.ts` and understand how axes map to types
- [ ] Read the scoring pipeline in `src/lib/scoring/scorer.ts`
- [ ] Read the edge function in `supabase/functions/score-session/index.ts`
- [ ] Read the LLM prompt in `supabase/functions/score-session/prompt.ts`
- [ ] Understand the dual-copy requirement (Section 21)
- [ ] Review edge function logs after your test assessment
- [ ] Verify `OPENAI_API_KEY` is funded and active
- [ ] Know how to reset a session: `localStorage.removeItem('astrobee_session_id'); location.reload()`
- [ ] Review the database schema and RLS policies (Section 6)
- [ ] Note the scene prompts duplication (frontend + edge function) documented in Section 22
- [ ] Identify the legacy/unused components that can be cleaned up (Section 22)

---

*Last updated: March 2026*
