"use client";

import { useState, Fragment } from "react";
import type { SyntheticCarrier, Tier, PipelineResult } from "../lib/types";
import staticResultsRaw from "../data/static_results.json";

const STATIC_RESULTS = staticResultsRaw as unknown as Record<string, PipelineResult>;

const tierColors: Record<Tier, string> = {
  Top: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Mid: "bg-blue-100 text-blue-700 border-blue-200",
  Improvement: "bg-amber-100 text-amber-700 border-amber-200",
  Provisional: "bg-purple-100 text-purple-700 border-purple-200",
  Rejected: "bg-red-100 text-red-700 border-red-200",
};

const TIER_KEY: { tier: Tier; label: string; description: string }[] = [
  { tier: "Top", label: "Tier 1", description: "Top performers — priority load allocation" },
  { tier: "Mid", label: "Tier 2", description: "Solid mid-range — steady allocation" },
  { tier: "Improvement", label: "Tier 3", description: "Needs improvement — action plan required" },
  { tier: "Provisional", label: "Provisional", description: "New carriers — under 90-day monitoring" },
  { tier: "Rejected", label: "Rejected", description: "Failed compliance check — cannot onboard" },
];

function tierLabel(tier: Tier): string {
  const found = TIER_KEY.find((k) => k.tier === tier);
  return found?.label ?? tier;
}

function formatLane(lane: string): string {
  const parts = lane.split("-");
  return parts.length === 2 ? `Lane ${parts[0]}–${parts[1]}` : lane;
}

function computeScorecard2(carrier: SyntheticCarrier): {
  appAdoption: number | null;
  onTime: number | null;
  fulfilment: number | null;
  supplyBreadth: number;
} {
  const pm = carrier.performanceMetrics;
  const lanes = pm.lanesServed.length;
  const trucks = pm.truckTypes.length;
  const supplyBreadth = Math.round(
    Math.min(lanes / 4, 1) * 50 +
    Math.min(trucks / 5, 1) * 30 +
    Math.min(pm.totalTrucks / 8, 1) * 20
  );
  return {
    appAdoption: pm.appAdoptionScore,
    onTime: pm.onTimePickupRate,
    fulfilment: pm.fulfilmentRate,
    supplyBreadth,
  };
}

function MiniBar({ value, label }: { value: number | null; label: string }) {
  const pct = value ?? 0;
  const color = value === null ? "bg-gray-200" : value < 50 ? "bg-red-400" : value < 75 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right font-medium text-gray-700">{value !== null ? `${value}` : "—"}</span>
    </div>
  );
}

function overallScore(carrier: SyntheticCarrier): { score: number; canonical: boolean } | null {
  // Rejected carriers never reach Scorecard 2 — no score exists
  if (carrier.evalLabel === "Rejected") return null;
  // Use authoritative pipeline score if available
  const staticScore = STATIC_RESULTS[carrier.id]?.stages?.score?.totalScore;
  if (staticScore !== undefined) return { score: staticScore, canonical: true };
  // Estimated score (excludes pricing) for display-only carriers
  const pm = carrier.performanceMetrics;
  if (!pm.appAdoptionScore && !pm.onTimePickupRate && !pm.fulfilmentRate) return null;
  const { appAdoption, onTime, fulfilment, supplyBreadth } = computeScorecard2(carrier);
  const app = appAdoption ?? 50;
  const ot = onTime ?? 50;
  const ful = fulfilment ?? 50;
  return { score: Math.round((app + ot + 70 + ful + supplyBreadth) / 5), canonical: false };
}

interface Props {
  carriers: SyntheticCarrier[];
  onSelectCarrier?: (id: string) => void;
}

export default function CarrierDatabase({ carriers, onSelectCarrier }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const SHOW = 20;
  const shown = carriers.slice(0, SHOW);
  const remaining = carriers.length - SHOW;

  return (
    <div>
      {/* Tier legend table */}
      <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 font-medium text-gray-500 uppercase tracking-wide w-28">Tier</th>
              <th className="text-left px-4 py-2 font-medium text-gray-500 uppercase tracking-wide">Meaning</th>
              <th className="text-left px-4 py-2 font-medium text-gray-500 uppercase tracking-wide">Allocation</th>
            </tr>
          </thead>
          <tbody>
            {TIER_KEY.map(({ tier, label, description }, i) => {
              const allocation: Record<string, string> = {
                Top: "Priority — first offer on all loads",
                Mid: "Steady — regular volume, monitored",
                Improvement: "Restricted — action plan required before scale-up",
                Provisional: "Limited — monitored for 90 days post-first-load",
                Rejected: "None — cannot be onboarded until compliance is resolved",
              };
              return (
                <tr key={tier} className={i < TIER_KEY.length - 1 ? "border-b border-gray-100" : ""}>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded border font-medium ${tierColors[tier]}`}>{label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{description}</td>
                  <td className="px-4 py-2.5 text-gray-500">{allocation[tier]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th className="pb-2 pr-3 w-4"></th>
              <th className="pb-2 pr-4">ID</th>
              <th className="pb-2 pr-4">Carrier</th>
              <th className="pb-2 pr-4">Lanes</th>
              <th className="pb-2 pr-4">Trucks</th>
              <th className="pb-2 pr-4 text-right">Score</th>
              <th className="pb-2 pr-4">Tier</th>
              <th className="pb-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const scoreResult = overallScore(c);
              const isExpanded = expandedId === c.id;
              const sc2 = computeScorecard2(c);
              // Rejected carriers never ran Scorecard 2 — no metrics to show
              const hasMetrics = c.evalLabel !== "Rejected" &&
                (c.performanceMetrics.appAdoptionScore !== null || c.performanceMetrics.onTimePickupRate !== null);

              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 pr-3 text-center">
                      {hasMetrics && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                          className="text-gray-500 hover:text-gray-800 transition-colors text-sm"
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-400 font-mono text-xs">{c.id}</td>
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{c.name}</td>
                    <td className="py-2.5 pr-4 text-gray-600">
                      {c.performanceMetrics.lanesServed.map(formatLane).join(", ") || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">
                      {c.performanceMetrics.truckTypes.join(", ") || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {scoreResult !== null ? (
                        <span className="font-semibold text-gray-800">
                          {scoreResult.score}
                          {!scoreResult.canonical && (
                            <span className="text-gray-400 font-normal text-xs ml-0.5">est.</span>
                          )}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded border ${tierColors[c.evalLabel]}`}>
                        {tierLabel(c.evalLabel)}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {c.isLabelled && c.submission ? (
                        <button
                          onClick={() => onSelectCarrier?.(c.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Run pipeline →
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>

                  {isExpanded && hasMetrics && (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={8} className="px-8 py-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                          Scorecard 2 — Performance Metrics
                        </p>
                        <div className="space-y-1.5 max-w-sm">
                          <MiniBar value={sc2.appAdoption} label="App Adoption" />
                          <MiniBar value={sc2.onTime} label="On-Time Pickup" />
                          <MiniBar value={sc2.fulfilment} label="Fulfilment Rate" />
                          <MiniBar value={sc2.supplyBreadth} label="Supply Breadth" />
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-28 shrink-0 text-gray-500">Pricing</span>
                            <span className="text-gray-400 italic">Run pipeline for pricing assessment</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {remaining > 0 && (
              <tr>
                <td colSpan={8} className="py-3 text-center text-sm text-gray-400 italic">
                  + {remaining} more carriers in the database
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Showing {Math.min(SHOW, carriers.length)} of {carriers.length} carriers. Scores from a full pipeline run are shown as-is; scores marked <span className="italic">est.</span> exclude pricing (run the pipeline for the full score). Rejected carriers have no score — they never reached Scorecard 2.
      </p>
    </div>
  );
}
