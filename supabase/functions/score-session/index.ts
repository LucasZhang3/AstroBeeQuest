import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { scoreSession, getPublicResult, PLAYER_TYPES, WEIGHT_MATRIX, AXES } from "./scoring.ts";
import { buildInferencePrompt, INFERENCE_TOOL } from "./prompt.ts";
import type { AxisSignals } from "./scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Scene prompts (mirrored from frontend)
const SCENE_PROMPTS: Record<number, string> = {
  1: "You find yourself at the entrance of a vast dungeon. The air is thick with anticipation. A weathered sign reads 'Astrobee\\'s Emporium - All Who Enter Shall Be Known.' What draws you to step inside?",
  2: "The corridor splits into three paths: one lit by flickering torches, one shrouded in complete darkness, and one where distant laughter echoes. How do you decide which path to take?",
  3: "You encounter a wounded traveler who claims to know a shortcut, but something in their eyes seems uncertain. How do you respond to their offer of guidance?",
  4: "A locked chest sits before you, covered in mysterious runes. Nearby, a riddle is carved into the stone. Do you solve the puzzle, force the lock, or move on?",
  5: "Your party faces a moral dilemma: save the village by sacrificing an ancient artifact, or keep the artifact and risk the villagers' fate. What matters most to you in this moment?",
  6: "A rival adventurer challenges you to a contest of skill. Victory promises glory, but defeat could damage your reputation. How do you approach competition?",
  7: "The dungeon master introduces a twist that completely changes your carefully laid plans. How do you adapt when the unexpected upends your strategy?",
  8: "You discover a hidden library filled with forbidden knowledge. Reading the texts could grant power, but at what cost? What drives your thirst for understanding?",
  9: "A companion in your party makes a decision you strongly disagree with. The tension is palpable. How do you navigate conflict within your group?",
  10: "You find a magical item of immense power, but it's clearly meant for another class. Do you keep it, trade it, or give it freely? What guides your choices about resources?",
  11: "The final boss offers you a deal: join them and rule together, or face almost certain defeat in battle. What principles guide you in moments of ultimate choice?",
  12: "The adventure ends, and you sit with your companions recounting the journey. What moment defined you? What would you do differently? What does this story reveal about who you are at the table?",
};

const MAX_RESPONSE_LENGTH = 5000;
const VALID_SIGNALS = new Set([0, 0.5, 1.0, 2.0]);
const VALID_AXES = new Set(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"]);

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
function validateResponses(responses: Array<{ scene_number: number; user_text: string }>): string | null {
  if (!responses || responses.length !== 12) {
    return `Need exactly 12 responses, got ${responses?.length ?? 0}`;
  }
  const seen = new Set<number>();
  for (const r of responses) {
    if (typeof r.scene_number !== "number" || r.scene_number < 1 || r.scene_number > 12) {
      return `Invalid scene_number: ${r.scene_number}`;
    }
    if (seen.has(r.scene_number)) {
      return `Duplicate scene_number: ${r.scene_number}`;
    }
    seen.add(r.scene_number);
    if (typeof r.user_text !== "string" || r.user_text.trim().length === 0) {
      return `Empty response for scene ${r.scene_number}`;
    }
    if (r.user_text.length > MAX_RESPONSE_LENGTH) {
      return `Response for scene ${r.scene_number} exceeds ${MAX_RESPONSE_LENGTH} chars`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Signal validation & cleaning
// ---------------------------------------------------------------------------
function validateAndCleanSignals(
  llmScenes: Array<{ scene_id: number; axis_signals: Record<string, number> }>,
): Array<{ sceneNumber: number; axisSignals: AxisSignals }> {
  const result: Array<{ sceneNumber: number; axisSignals: AxisSignals }> = [];

  for (let i = 1; i <= 12; i++) {
    const llmScene = llmScenes.find((s) => s.scene_id === i);
    const signals: AxisSignals = {};

    if (llmScene?.axis_signals) {
      for (const [axis, val] of Object.entries(llmScene.axis_signals)) {
        if (!VALID_AXES.has(axis)) continue;
        const numVal = typeof val === "number" ? val : parseFloat(String(val));
        if (VALID_SIGNALS.has(numVal)) {
          if (numVal > 0) signals[axis] = numVal;
        } else if (numVal > 0) {
          if (numVal <= 0.25) continue;
          else if (numVal <= 0.75) signals[axis] = 0.5;
          else if (numVal <= 1.5) signals[axis] = 1.0;
          else signals[axis] = 2.0;
        }
      }
    }

    result.push({ sceneNumber: i, axisSignals: signals });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Output validation
// ---------------------------------------------------------------------------
function validateScoringOutput(percentages: Record<string, number>): string | null {
  for (const t of PLAYER_TYPES) {
    const v = percentages[t];
    if (typeof v !== "number" || isNaN(v)) return `Missing or non-numeric percentage for ${t}`;
    if (v < 0) return `Negative percentage for ${t}: ${v}`;
    if (v > 100) return `Percentage > 100 for ${t}: ${v}`;
  }
  const total = Object.values(percentages).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 0.01) return `Percentages sum to ${total}, not 100`;
  return null;
}

// ---------------------------------------------------------------------------
// LLM call with retry
// ---------------------------------------------------------------------------
async function callLLM(prompt: string, apiKey: string, attempt = 1): Promise<{ scenes: Array<any> }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
      tools: [INFERENCE_TOOL],
      tool_choice: { type: "function", function: { name: "infer_axis_signals" } },
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const body = await response.text();
    console.error(`LLM error (attempt ${attempt}):`, status, body);

    if (status === 429) throw Object.assign(new Error("Rate limited. Please try again in a moment."), { status: 429 });
    if (status === 402) throw Object.assign(new Error("Service credits exhausted. Please add credits."), { status: 402 });
    throw Object.assign(new Error("Inference failed"), { status: 500 });
  }

  const llmData = await response.json();
  const toolCall = llmData.choices?.[0]?.message?.tool_calls?.[0];
  const finishReason = llmData.choices?.[0]?.finish_reason;
  console.log(`LLM finish_reason: ${finishReason}, usage: ${JSON.stringify(llmData.usage)}`);

  if (!toolCall?.function?.arguments) {
    console.error("No tool call found. Message:", JSON.stringify(llmData.choices?.[0]?.message).slice(0, 500));
    if (attempt < 2) {
      console.warn("Retrying...");
      return callLLM(prompt, apiKey, attempt + 1);
    }
    throw Object.assign(new Error("Did not return structured output after retry"), { status: 500 });
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    const sampleScene = parsed.scenes?.[0];
    console.log(`Parsed ${parsed.scenes?.length} scenes. Scene 1 full:`, JSON.stringify(sampleScene));
    return parsed;
  } catch (e) {
    console.error("JSON parse failed on:", toolCall.function.arguments.slice(0, 200));
    if (attempt < 2) {
      console.warn("Retrying...");
      return callLLM(prompt, apiKey, attempt + 1);
    }
    throw Object.assign(new Error("Invalid response format after retry"), { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { session_id } = await req.json();
    if (!session_id || typeof session_id !== "string" || !UUID_REGEX.test(session_id)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check existing results
    const { data: existing } = await supabase
      .from("results")
      .select("percentages")
      .eq("session_id", session_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ already_scored: true, percentages: existing.percentages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomically claim scoring — prevents concurrent/repeated LLM calls
    const { data: claimed, error: claimError } = await supabase
      .from("sessions")
      .update({ scoring_requested: true })
      .eq("id", session_id)
      .eq("scoring_requested", false)
      .select("id")
      .maybeSingle();

    if (claimError || !claimed) {
      return new Response(JSON.stringify({ error: "Session already scored or not found" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all 12 responses
    const { data: responses, error: respError } = await supabase
      .from("responses")
      .select("scene_number, user_text")
      .eq("session_id", session_id)
      .order("scene_number", { ascending: true });

    if (respError) {
      return new Response(JSON.stringify({ error: "Failed to fetch responses" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate input
    const inputError = validateResponses(responses || []);
    if (inputError) {
      console.warn("Validation failed:", inputError);
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build prompt & call LLM (with retry)
    const sceneData = responses!.map((r) => ({
      sceneNumber: r.scene_number,
      promptText: SCENE_PROMPTS[r.scene_number] || "",
      userResponse: r.user_text,
    }));

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const startTime = Date.now();
    const prompt = buildInferencePrompt(sceneData);
    const inferenceResult = await callLLM(prompt, OPENAI_API_KEY);
    const elapsed = Date.now() - startTime;
    console.log(`LLM inference completed in ${elapsed}ms`);

    // Validate, clean, score
    const cleanedScenes = validateAndCleanSignals(inferenceResult.scenes || []);
    const scoringResult = scoreSession(session_id, cleanedScenes);
    const publicResult = getPublicResult(scoringResult);

    // Validate output
    const outputError = validateScoringOutput(scoringResult.percentages);
    if (outputError) {
      console.error("Output validation failed:", outputError);
      return new Response(JSON.stringify({ error: "classification_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Validation passed. Distribution:", JSON.stringify(scoringResult.percentages));

    // Build quotes for ALL types — each gets up to 3 distinct quotes.
    // Top-ranked types get first pick of the most impactful quotes.
    const usedQuotes = new Set<number>(); // track scene_ids already assigned

    // Pre-compute relevance scores: for each type, rank all scenes by relevance
    const typeRelevanceMap: Record<string, Array<{ scene_id: number; quote: string; relevance: number }>> = {};
    for (const tt of publicResult.topTypes) {
      const scored: Array<{ scene_id: number; quote: string; relevance: number }> = [];
      for (const llmScene of inferenceResult.scenes || []) {
        if (!llmScene.key_quote) continue;
        const signals = llmScene.axis_signals || {};
        let relevance = 0;
        for (const axis of AXES) {
          const sig = signals[axis] ?? 0;
          if (sig === 0) continue;
          const weight = WEIGHT_MATRIX[axis]?.[tt.type] ?? 0;
          relevance += sig * weight;
        }
        if (relevance > 0) {
          scored.push({ scene_id: llmScene.scene_id, quote: llmScene.key_quote, relevance });
        }
      }
      // Sort by relevance descending so top types claim the best quotes first
      scored.sort((a, b) => b.relevance - a.relevance);
      typeRelevanceMap[tt.type] = scored;
    }

    // Assign quotes in rank order (top types pick first)
    const topTypes = publicResult.topTypes.map((tt) => {
      const candidates = typeRelevanceMap[tt.type] || [];
      const quotes: Array<{ scene_id: number; quote: string }> = [];
      for (const c of candidates) {
        if (quotes.length >= 3) break;
        if (usedQuotes.has(c.scene_id)) continue;
        quotes.push({ scene_id: c.scene_id, quote: c.quote });
        usedQuotes.add(c.scene_id);
      }
      return { ...tt, quotes };
    });

    // Store results
    const { error: insertError } = await supabase.from("results").upsert({
      session_id,
      raw_scores: scoringResult.rawScores,
      normalized_scores: scoringResult.normalizedScores,
      percentages: scoringResult.percentages,
      per_scene_details: {
        perScene: scoringResult.perScene,
        inference: inferenceResult.scenes,
      },
    });

    if (insertError) {
      console.error("Error storing results:", insertError);
    }

    return new Response(
      JSON.stringify({
        percentages: scoringResult.percentages,
        top_types: topTypes,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    console.error("score-session error:", e);
    return new Response(JSON.stringify({ error: "Unable to process request. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
