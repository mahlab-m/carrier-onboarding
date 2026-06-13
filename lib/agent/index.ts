import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFields, QualificationResult, PerformanceResult, Tier } from "../types";
import { agentToolDefinitions, executeToolCall } from "./tools";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface AgentInput {
  carrierName: string;
  extractedFields: ExtractedFields;
  qualificationResult: QualificationResult;
  performanceMetrics: {
    appAdoptionScore: number | null;
    onTimePickupRate: number | null;
    averageRatePKR: Record<string, number>;
    fulfilmentRate: number | null;
  };
}

const SYSTEM_PROMPT = `You are a carrier qualification agent for a logistics marketplace in Pakistan. Your job is to assess a carrier's performance using the Scorecard 2 (Performance Scorecard) and produce a tier decision with a clear rationale.

You have access to three tools:
- lane_rate_lookup: get the PKR benchmark rate for any lane/truck combination
- capacity_gap_lookup: check if a lane has a capacity shortage
- scorecard_calculator: calculate the five performance scores and overall tier

Your process:
1. Look up lane rates for the carrier's lanes and truck types to assess pricing competitiveness
2. Check capacity gaps on the carrier's lanes
3. Run the scorecard calculator with all available metrics
4. Decide the tier: Top (≥75), Mid (50-74), Improvement (<50), or Provisional (if first load not completed or performance data missing)
5. Identify risk flags with severity (low/medium/high)
6. For Improvement tier: write a specific improvement plan (target specific metrics, specific lanes, specific PKR numbers)
7. For Provisional tier: write a 30/60/90-day monitoring checklist

Be specific. Use actual PKR numbers. Name specific lanes. Give quantified targets.

Return your final assessment as JSON in this exact structure:
{
  "metrics": [
    { "metric": "App Adoption", "score": 0-100, "weight": 0.2, "weightedScore": 0-20, "rationale": "..." },
    { "metric": "On-Time Pickup", "score": 0-100, "weight": 0.2, "weightedScore": 0-20, "rationale": "..." },
    { "metric": "Pricing Competitiveness", "score": 0-100, "weight": 0.2, "weightedScore": 0-20, "rationale": "..." },
    { "metric": "Fulfilment Rate", "score": 0-100, "weight": 0.2, "weightedScore": 0-20, "rationale": "..." },
    { "metric": "Supply Breadth", "score": 0-100, "weight": 0.2, "weightedScore": 0-20, "rationale": "..." }
  ],
  "totalScore": 0-100,
  "tier": "Top" | "Mid" | "Improvement" | "Provisional",
  "riskFlags": [
    { "flag": "...", "severity": "low" | "medium" | "high", "detail": "..." }
  ],
  "improvementPlan": [
    { "action": "...", "target": "...", "deadline": "30 days" }
  ] or null,
  "monitoringChecklist": ["..."] or null,
  "agentRationale": "..."
}`;

export async function runQualificationAgent(
  input: AgentInput
): Promise<{ result: PerformanceResult; inputTokens: number; outputTokens: number }> {
  const userMessage = `Carrier: ${input.carrierName}

Extracted profile:
- Lanes served: ${input.extractedFields.lanesServed.join(", ") || "None declared"}
- Truck types: ${input.extractedFields.truckTypes.join(", ") || "None declared"}
- Total trucks: ${input.extractedFields.totalTrucks ?? "Unknown"}
- First load completed: ${input.extractedFields.firstLoadCompleted === true ? "Yes" : input.extractedFields.firstLoadCompleted === false ? "No" : "Not confirmed"}

Performance data:
- App adoption score: ${input.performanceMetrics.appAdoptionScore ?? "Not available"}
- On-time pickup rate: ${input.performanceMetrics.onTimePickupRate !== null ? `${input.performanceMetrics.onTimePickupRate}%` : "Not available"}
- Carrier rates (PKR): ${JSON.stringify(input.performanceMetrics.averageRatePKR)}
- Fulfilment rate: ${input.performanceMetrics.fulfilmentRate !== null ? `${input.performanceMetrics.fulfilmentRate}%` : "Not available"}

Qualification result: ${input.qualificationResult.provisional ? "PROVISIONAL (first load not completed)" : "QUALIFIED"}

Use your tools to assess this carrier, then return your JSON assessment.`;

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let inputTokens = 0;
  let outputTokens = 0;

  // Agentic loop — runs until the model produces a final_response (stop_reason: end_turn)
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: agentToolDefinitions as Anthropic.Tool[],
      messages,
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "end_turn") {
      // Extract the JSON from the final text response
      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock ? textBlock.text : "";
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;

      let parsed: PerformanceResult;
      try {
        parsed = JSON.parse(jsonStr.trim());
      } catch {
        // Fallback if JSON parse fails
        parsed = buildFallbackResult(input);
      }

      // Enforce tier based on first load status
      if (input.qualificationResult.provisional) {
        parsed.tier = "Provisional" as Tier;
        parsed.improvementPlan = null;
        if (!parsed.monitoringChecklist) {
          parsed.monitoringChecklist = [
            "Day 1: Confirm first load is scheduled",
            "Day 30: Review on-time pickup rate from first 5 loads",
            "Day 60: Assess app adoption and fulfilment rate",
            "Day 90: Full Scorecard 2 assessment and tier assignment",
          ];
        }
      }

      return { result: parsed, inputTokens, outputTokens };
    }

    if (response.stop_reason === "tool_use") {
      // Add assistant message with tool calls
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool call and collect results
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = executeToolCall(block.name, block.input as Record<string, unknown>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    } else {
      // Unexpected stop reason
      break;
    }
  }

  return {
    result: buildFallbackResult(input),
    inputTokens,
    outputTokens,
  };
}

function buildFallbackResult(input: AgentInput): PerformanceResult {
  return {
    metrics: [
      { metric: "App Adoption", score: 50, weight: 0.2, weightedScore: 10, rationale: "Could not assess." },
      { metric: "On-Time Pickup", score: 50, weight: 0.2, weightedScore: 10, rationale: "Could not assess." },
      { metric: "Pricing Competitiveness", score: 50, weight: 0.2, weightedScore: 10, rationale: "Could not assess." },
      { metric: "Fulfilment Rate", score: 50, weight: 0.2, weightedScore: 10, rationale: "Could not assess." },
      { metric: "Supply Breadth", score: 50, weight: 0.2, weightedScore: 10, rationale: "Could not assess." },
    ],
    totalScore: 50,
    tier: input.qualificationResult.provisional ? "Provisional" : "Mid",
    riskFlags: [{ flag: "Assessment error", severity: "medium", detail: "Agent could not complete assessment." }],
    improvementPlan: null,
    monitoringChecklist: null,
    agentRationale: "Agent assessment failed — manual review required.",
  };
}
