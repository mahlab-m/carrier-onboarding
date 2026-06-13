import type { LaneContext, MarketContext } from "../types";
import marketContextData from "../../data/market_context.json";

const marketContext = marketContextData as MarketContext;

// Tool: look up benchmark rate for a lane
export function laneRateLookup(laneId: string, truckType: string): number | null {
  const lane = marketContext.lanes.find((l) => l.id === laneId);
  if (!lane) return null;
  return lane.benchmarkRates[truckType] ?? null;
}

// Tool: check capacity gap for a lane
export function capacityGapLookup(laneId: string): {
  hasGap: boolean;
  severity: "low" | "high" | null;
} {
  const lane = marketContext.lanes.find((l) => l.id === laneId);
  if (!lane) return { hasGap: false, severity: null };
  return { hasGap: lane.capacityGap, severity: lane.capacityGapSeverity };
}

// Tool: calculate supply breadth score
// More lanes + more truck types = higher score
export function supplyBreadthScore(
  lanesServed: string[],
  truckTypes: string[],
  totalTrucks: number
): number {
  const totalLanes = marketContext.lanes.length; // 4
  const totalTruckTypes = marketContext.truckTypes.length; // 5

  const laneScore = Math.min(lanesServed.length / totalLanes, 1) * 50;
  const truckTypeScore = Math.min(truckTypes.length / totalTruckTypes, 1) * 30;
  const fleetSizeScore = Math.min(totalTrucks / 8, 1) * 20; // 8 trucks = full score

  return Math.round(laneScore + truckTypeScore + fleetSizeScore);
}

// Tool: calculate pricing competitiveness score for a carrier
// Returns 0-100: 100 = at or below benchmark, 0 = 50%+ above benchmark
export function pricingCompetitivenessScore(
  carrierRates: Record<string, number>,
  lanesServed: string[]
): number {
  if (Object.keys(carrierRates).length === 0) return 50; // unknown, neutral

  let totalRatio = 0;
  let count = 0;

  for (const [truckType, carrierRate] of Object.entries(carrierRates)) {
    for (const laneId of lanesServed) {
      const benchmark = laneRateLookup(laneId, truckType);
      if (benchmark && benchmark > 0) {
        const ratio = carrierRate / benchmark;
        totalRatio += ratio;
        count++;
      }
    }
  }

  if (count === 0) return 50;

  const avgRatio = totalRatio / count;
  // ratio 1.0 = at benchmark = 100. ratio 1.5 = 50% above = 0. Linear between.
  const score = Math.max(0, Math.min(100, Math.round((1.5 - avgRatio) / 0.5 * 100)));
  return score;
}

// Anthropic tool definitions for the agent
export const agentToolDefinitions = [
  {
    name: "lane_rate_lookup",
    description:
      "Look up the benchmark PKR rate for a specific lane and truck type combination. Returns the market benchmark rate in PKR, or null if the lane/truck combo is not in the reference data.",
    input_schema: {
      type: "object" as const,
      properties: {
        lane_id: {
          type: "string",
          description: "Lane identifier: A-B, B-C, C-D, or A-D",
        },
        truck_type: {
          type: "string",
          description: "Truck type: 20ft, 40ft, flatbed, mazda, small_van",
        },
      },
      required: ["lane_id", "truck_type"],
    },
  },
  {
    name: "capacity_gap_lookup",
    description:
      "Check whether a lane has a capacity gap (more demand than available carriers). Returns hasGap boolean and severity (low/high/null).",
    input_schema: {
      type: "object" as const,
      properties: {
        lane_id: {
          type: "string",
          description: "Lane identifier: A-B, B-C, C-D, or A-D",
        },
      },
      required: ["lane_id"],
    },
  },
  {
    name: "scorecard_calculator",
    description:
      "Calculate the five performance scores and overall weighted total. Provide all available metrics. Returns per-metric scores (0-100), weighted total, and suggested tier.",
    input_schema: {
      type: "object" as const,
      properties: {
        app_adoption_score: {
          type: "number",
          description: "App adoption score 0-100. Pass null if not available.",
        },
        on_time_pickup_rate: {
          type: "number",
          description:
            "On-time pickup rate as a percentage (e.g. 85 for 85%). Pass null if not available.",
        },
        carrier_rates_pkr: {
          type: "object",
          description: "Object of truck_type: rate_in_pkr pairs for the carrier.",
        },
        lanes_served: {
          type: "array",
          items: { type: "string" },
          description: "Array of lane IDs the carrier operates on.",
        },
        fulfilment_rate: {
          type: "number",
          description: "Fulfilment rate as a percentage. Pass null if not available.",
        },
        total_trucks: {
          type: "number",
          description: "Total number of trucks in the carrier fleet.",
        },
        truck_types: {
          type: "array",
          items: { type: "string" },
          description: "Array of truck types in the carrier fleet.",
        },
      },
      required: ["lanes_served", "truck_types", "total_trucks"],
    },
  },
];

// Execute a tool call from the agent
export function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  if (toolName === "lane_rate_lookup") {
    const rate = laneRateLookup(
      toolInput.lane_id as string,
      toolInput.truck_type as string
    );
    return JSON.stringify(
      rate !== null
        ? { benchmarkRate: rate, currency: "PKR" }
        : { error: "Lane/truck combination not found in reference data" }
    );
  }

  if (toolName === "capacity_gap_lookup") {
    const gap = capacityGapLookup(toolInput.lane_id as string);
    return JSON.stringify(gap);
  }

  if (toolName === "scorecard_calculator") {
    const lanesServed = toolInput.lanes_served as string[];
    const truckTypes = toolInput.truck_types as string[];
    const totalTrucks = toolInput.total_trucks as number;
    const carrierRates = (toolInput.carrier_rates_pkr as Record<string, number>) ?? {};

    const appScore =
      typeof toolInput.app_adoption_score === "number"
        ? toolInput.app_adoption_score
        : null;
    const onTimeScore =
      typeof toolInput.on_time_pickup_rate === "number"
        ? toolInput.on_time_pickup_rate
        : null;
    const fulfilmentScore =
      typeof toolInput.fulfilment_rate === "number"
        ? toolInput.fulfilment_rate
        : null;
    const pricingScore = pricingCompetitivenessScore(carrierRates, lanesServed);
    const breadthScore = supplyBreadthScore(lanesServed, truckTypes, totalTrucks);

    const weights = marketContext.scorecardWeights;

    // For null scores (new carriers), use a neutral 50 but flag as estimated
    const effectiveApp = appScore ?? 50;
    const effectiveOnTime = onTimeScore ?? 50;
    const effectiveFulfilment = fulfilmentScore ?? 50;

    const total = Math.round(
      effectiveApp * weights.appAdoption +
        effectiveOnTime * weights.onTimePickup +
        pricingScore * weights.pricingCompetitiveness +
        effectiveFulfilment * weights.fulfilmentRate +
        breadthScore * weights.supplyBreadth
    );

    const thresholds = marketContext.tierThresholds;
    const tier =
      total >= thresholds.top ? "Top" : total >= thresholds.mid ? "Mid" : "Improvement";

    return JSON.stringify({
      scores: {
        appAdoption: appScore,
        onTimePickup: onTimeScore,
        pricingCompetitiveness: pricingScore,
        fulfilmentRate: fulfilmentScore,
        supplyBreadth: breadthScore,
      },
      effectiveScores: {
        appAdoption: effectiveApp,
        onTimePickup: effectiveOnTime,
        pricingCompetitiveness: pricingScore,
        fulfilmentRate: effectiveFulfilment,
        supplyBreadth: breadthScore,
      },
      weightedTotal: total,
      suggestedTier: tier,
      note:
        appScore === null || onTimeScore === null || fulfilmentScore === null
          ? "Some metrics unavailable (new carrier). Null metrics scored as 50 (neutral) for calculation purposes. Tier should be marked Provisional."
          : null,
    });
  }

  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}
