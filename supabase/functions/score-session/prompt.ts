/**
 * Inference prompt for axis signal extraction.
 * The LLM infers behavioral signals; our deterministic engine scores them.
 *
 * KEY DESIGN: The AI evaluates ALL 10 axes for EVERY scene, not just target axes.
 * This produces much more differentiated scores because a combat-focused response
 * will get high A6/A3 but 0 on A1/A10/A8, creating natural spread.
 */

const AXIS_DESCRIPTIONS: Record<string, string> = {
  A1: "Narrative Motivation – How invested in story, roleplay, and dramatic expression? HIGH if they narrate in-character, describe feelings, or create story beats. LOW/ZERO if they give tactical or pragmatic answers.",
  A2: "Exploration Drive – How driven to discover, wander, and uncover hidden things? HIGH if they want to investigate, explore unknown areas, or seek lore. LOW/ZERO if they stick to the obvious path.",
  A3: "Risk Tolerance – How willing to take bold, dangerous, or reckless action? HIGH if they charge in, gamble, or ignore danger. LOW/ZERO if they play it safe or cautious.",
  A4: "Cognitive Style – How analytical, strategic, and methodical? HIGH if they plan, weigh options, or mention strategy. LOW/ZERO if they act on impulse or emotion.",
  A5: "Spotlight Comfort – How comfortable being the center of attention? HIGH if they want to lead, perform, or be noticed. LOW/ZERO if they defer, observe, or support.",
  A6: "Combat Engagement – How drawn to fighting, action, and tactical challenges? HIGH if they want to fight, discuss combat tactics, or seek confrontation. LOW/ZERO if they avoid violence or prefer diplomacy.",
  A7: "Chaos Tolerance – How much do they embrace disruption and unpredictability? HIGH if they enjoy surprises, want to cause chaos, or thrive on disorder. LOW/ZERO if they want control and order.",
  A8: "Rules Orientation – How much do they value systems, mechanics, and structure? HIGH if they reference game rules, optimize builds, or think in mechanics. LOW/ZERO if they ignore rules or focus on narrative.",
  A9: "Stimulation Need – How much do they crave excitement and intensity? HIGH if they seek thrills, action, or dramatic moments. LOW/ZERO if they prefer calm, contemplation, or steady pace.",
  A10: "Character Identification – How deeply do they connect personally with their character? HIGH if they express personal feelings through character, show emotional investment. LOW/ZERO if they treat it as a game piece.",
};

export function buildInferencePrompt(
  scenes: Array<{ sceneNumber: number; promptText: string; userResponse: string }>,
): string {
  const sceneBlocks = scenes
    .map((s) => {
      return `--- SCENE ${s.sceneNumber} ---
Question asked: "${s.promptText}"
Player's response: "${s.userResponse}"`;
    })
    .join("\n\n");

  return `You are a behavioral psychometric engine analyzing D&D player-type responses.

Your job: Read each of the 12 scene responses and infer signal strengths for ALL 10 behavioral axes.

## BEHAVIORAL AXES
${Object.entries(AXIS_DESCRIPTIONS)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}

## SIGNAL STRENGTH VALUES
- 0.0 = NO signal. The response shows zero indication of this behavior. USE THIS AGGRESSIVELY. Most axes should be 0 for any given response.
- 0.5 = WEAK hint. Barely detectable undertone.
- 1.0 = CLEAR signal. The response demonstrably shows this behavior.
- 2.0 = DOMINANT signal. This behavior is the PRIMARY driver of the response. Reserve this for the 1-2 axes that MOST define the answer.

## CRITICAL RULES FOR DIFFERENTIATION
1. **EVALUATE ALL 10 AXES for every scene.** Do not skip axes.
2. **BE POLARIZED.** Most responses should have 6-8 axes at 0.0, 1-2 axes at 1.0-2.0, and maybe 1-2 at 0.5. Giving everything 0.5-1.0 is WRONG.
3. **USE 2.0 LIBERALLY** when the response clearly centers on that behavior. If someone says "I charge in and fight," A6 MUST be 2.0, A3 should be 1.0-2.0, and most others 0.
4. **USE 0.0 AGGRESSIVELY** when there is genuinely no signal. A combat-focused answer has 0.0 for Narrative Motivation (A1) unless they also narrate in-character.
5. **Each response should activate AT MOST 3-4 axes** with non-zero values. If you're giving 5+ axes non-zero, you're not being discriminating enough.
6. **Read the ACTUAL words.** Don't infer hidden motivations. Score what's explicitly shown in the text.
7. **Extract a meaningful quote** (exact words from their response, ≤20 words) that best captures the dominant signal. This quote will be shown to the user as evidence.
8. **Write a clear rationale** explaining WHY you scored the dominant axes high and others low.

## EXAMPLE OF GOOD SCORING
Response: "I draw my sword and charge at the beast, hoping to land the first blow before it notices me"
Good: A3=2.0, A6=2.0, A9=1.0, all others=0.0
Bad: A3=1.0, A6=1.0, A5=0.5, A9=0.5, A1=0.5 (too flat, not polarized enough)

Response: "I carefully examine the runes, cross-reference with what I know about ancient languages, and methodically work through the puzzle"
Good: A4=2.0, A8=1.0, all others=0.0
Bad: A4=1.0, A2=0.5, A8=0.5, A1=0.5 (too flat)

## SCENES TO ANALYZE

${sceneBlocks}

Call the "infer_axis_signals" function with your analysis. Remember: BE BOLD with 2.0s and 0.0s. Flat distributions are failures.`;
}

export const INFERENCE_TOOL = {
  type: "function" as const,
  function: {
    name: "infer_axis_signals",
    description:
      "Return inferred behavioral axis signals for all 12 scenes. Be POLARIZED: most axes should be 0.0, with 1-3 axes at strong values per scene.",
    parameters: {
      type: "object",
      properties: {
        scenes: {
          type: "array",
          description: "Array of exactly 12 scene inference results.",
          items: {
            type: "object",
            properties: {
              scene_id: { type: "integer", description: "Scene number 1-12" },
              axis_signals: {
                type: "object",
                description:
                  "Signal strengths for ALL 10 axes. Most should be 0.0. Only 1-3 should be high (1.0 or 2.0).",
                properties: {
                  A1: { type: "number", description: "Narrative Motivation (0, 0.5, 1.0, or 2.0)" },
                  A2: { type: "number", description: "Exploration Drive (0, 0.5, 1.0, or 2.0)" },
                  A3: { type: "number", description: "Risk Tolerance (0, 0.5, 1.0, or 2.0)" },
                  A4: { type: "number", description: "Cognitive Style (0, 0.5, 1.0, or 2.0)" },
                  A5: { type: "number", description: "Spotlight Comfort (0, 0.5, 1.0, or 2.0)" },
                  A6: { type: "number", description: "Combat Engagement (0, 0.5, 1.0, or 2.0)" },
                  A7: { type: "number", description: "Chaos Tolerance (0, 0.5, 1.0, or 2.0)" },
                  A8: { type: "number", description: "Rules Orientation (0, 0.5, 1.0, or 2.0)" },
                  A9: { type: "number", description: "Stimulation Need (0, 0.5, 1.0, or 2.0)" },
                  A10: { type: "number", description: "Character Identification (0, 0.5, 1.0, or 2.0)" },
                },
                required: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"],
                additionalProperties: false,
              },
              key_quote: {
                type: "string",
                description: "Exact excerpt from user response (≤20 words) that best demonstrates the dominant signal.",
              },
              rationale: {
                type: "string",
                description:
                  "Why these axes scored high and others scored low. Be specific about behavioral indicators.",
              },
            },
            required: ["scene_id", "axis_signals", "key_quote", "rationale"],
            additionalProperties: false,
          },
          minItems: 12,
          maxItems: 12,
        },
      },
      required: ["scenes"],
      additionalProperties: false,
    },
  },
};
