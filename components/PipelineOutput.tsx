"use client";

import type { PipelineResult, Tier } from "../lib/types";

const tierColors: Record<Tier, string> = {
  Top: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Mid: "bg-blue-100 text-blue-800 border-blue-300",
  Improvement: "bg-amber-100 text-amber-800 border-amber-300",
  Provisional: "bg-purple-100 text-purple-800 border-purple-300",
  Rejected: "bg-red-100 text-red-800 border-red-300",
};

const severityColors = {
  low: "bg-yellow-50 border-yellow-200 text-yellow-800",
  medium: "bg-orange-50 border-orange-200 text-orange-800",
  high: "bg-red-50 border-red-200 text-red-800",
};

function tierLabel(tier: Tier): string {
  const map: Record<Tier, string> = {
    Top: "Tier 1",
    Mid: "Tier 2",
    Improvement: "Tier 3",
    Provisional: "Provisional",
    Rejected: "Rejected",
  };
  return map[tier];
}

function formatLane(lane: string): string {
  const parts = lane.split("-");
  return parts.length === 2 ? `Lane ${parts[0]}-${parts[1]}` : lane;
}

function SectionHeader({
  label,
  badge,
  passed,
}: {
  label: string;
  badge?: string;
  passed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-800 text-sm uppercase tracking-wide">{label}</span>
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
            {badge}
          </span>
        )}
      </div>
      {passed !== undefined && (
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded border ${
            passed ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {passed ? "PASS" : "FAIL"}
        </span>
      )}
    </div>
  );
}

export default function PipelineOutput({ result }: { result: PipelineResult }) {
  const { stages } = result;
  const tierClass = tierColors[result.finalTier];

  return (
    <div className="space-y-4">
      {/* Final tier banner */}
      <div className={`rounded-lg border-2 p-4 flex items-center justify-between ${tierClass}`}>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">Final Decision</div>
          <div className="text-2xl font-bold mt-0.5">{tierLabel(result.finalTier)}</div>
        </div>
        <div className="text-right text-sm opacity-70">
          <div>{result.carrierName}</div>
          <div>{new Date(result.timestamp).toLocaleString()}</div>
        </div>
      </div>

      {/* Stage 1: Document received */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <SectionHeader label="1. Document Received" badge="Raw input" />
        <p className="text-sm text-gray-600 italic leading-relaxed bg-gray-50 rounded p-3 border border-gray-100">
          &ldquo;{result.stages.extract ? (result as unknown as { rawBlob?: string }).rawBlob ?? "-" : "-"}&rdquo;
        </p>
      </div>

      {/* Stage 2: Extract */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <SectionHeader label="2. Extract" badge="WORKFLOW" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {[
            ["Tax ID", stages.extract.taxId ?? "-"],
            ["Bank Name", stages.extract.bankName ?? "-"],
            ["Bank Account", stages.extract.bankAccount ?? "-"],
            ["App Signup", stages.extract.appSignup === true ? "Yes" : stages.extract.appSignup === false ? "No" : "Not mentioned"],
            ["First Load", stages.extract.firstLoadCompleted === true ? "Completed" : stages.extract.firstLoadCompleted === false ? "Not yet" : "Not mentioned"],
            ["Lanes", stages.extract.lanesServed.map(formatLane).join(", ") || "-"],
            ["Truck Types", stages.extract.truckTypes.join(", ") || "-"],
            ["Total Trucks", stages.extract.totalTrucks?.toString() ?? "-"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-gray-50 pb-1">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium text-gray-800">{value}</span>
            </div>
          ))}
        </div>
        {stages.extract.extractionNotes && (
          <p className="mt-2 text-xs text-gray-500 italic">{stages.extract.extractionNotes}</p>
        )}
      </div>

      {/* Stage 3: Validate */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <SectionHeader label="3. Validate" badge="WORKFLOW" passed={stages.validate.passed} />
        <div className="space-y-1.5">
          {stages.validate.fields.map((f) => (
            <div key={f.field} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 shrink-0 ${f.present && f.formatValid ? "text-green-500" : "text-red-500"}`}>
                {f.present && f.formatValid ? "✓" : "✗"}
              </span>
              <div>
                <span className="font-medium text-gray-800">{f.field}:</span>{" "}
                <span className="text-gray-600">{f.reason}</span>
              </div>
            </div>
          ))}
        </div>
        {stages.validate.rejectionMessage && (
          <div className="mt-3 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700 whitespace-pre-line">
            {stages.validate.rejectionMessage}
          </div>
        )}
      </div>

      {/* Stage 4: Qualification Gate - Scorecard 1 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <SectionHeader
          label="4. Qualification Gate - Scorecard 1"
          badge="WORKFLOW"
          passed={stages.qualify.passed}
        />
        <div className="space-y-1.5">
          {stages.qualify.criteria.map((c) => (
            <div key={c.criterion} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 shrink-0 ${c.passed ? "text-green-500" : "text-red-500"}`}>
                {c.passed ? "✓" : "✗"}
              </span>
              <div>
                <span className="font-medium text-gray-800">{c.criterion}:</span>{" "}
                <span className="text-gray-600">{c.note}</span>
              </div>
            </div>
          ))}
        </div>
        {stages.qualify.provisional && (
          <div className="mt-3 p-2.5 rounded bg-purple-50 border border-purple-200 text-sm text-purple-700">
            Provisional status - first load not yet completed. Proceeding to performance assessment.
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500 italic">{stages.qualify.summary}</p>
      </div>

      {/* Stage 5: Performance - Scorecard 2 (agent) */}
      {stages.score && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <SectionHeader
            label="5. Performance Assessment - Scorecard 2"
            badge="AGENT"
          />
          <div className="space-y-2 mb-4">
            {stages.score.metrics.map((m) => (
              <div key={m.metric}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span className="text-gray-700">{m.metric}</span>
                  <span className="font-semibold text-gray-800">{m.score ?? "N/A"}/100</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      m.score === null || m.score < 50
                        ? "bg-red-400"
                        : m.score < 75
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                    }`}
                    style={{ width: `${m.score ?? 50}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{m.rationale}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
            <div className="text-sm text-gray-600">
              Weighted total: <span className="font-bold text-gray-900">{stages.score.totalScore}/100</span>
            </div>
            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${tierColors[stages.score.tier]}`}>
              {tierLabel(stages.score.tier)}
            </span>
          </div>
        </div>
      )}

      {/* Stage 6: Decision + Risk + Plan */}
      {stages.score && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <SectionHeader label="6. Decision + Action Plan" />

          {/* Risk flags */}
          {stages.score.riskFlags.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Risk Flags</p>
              <div className="space-y-1.5">
                {stages.score.riskFlags.map((f, i) => (
                  <div key={i} className={`rounded border px-3 py-2 text-sm ${severityColors[f.severity]}`}>
                    <span className="font-medium uppercase text-xs mr-2">{f.severity}</span>
                    <span className="font-medium">{f.flag}</span>
                    <span className="text-xs block mt-0.5 opacity-80">{f.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent rationale */}
          <p className="text-sm text-gray-600 leading-relaxed mb-4 italic">
            {stages.score.agentRationale}
          </p>

          {/* Improvement plan */}
          {stages.score.improvementPlan && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">30-Day Improvement Plan</p>
              <div className="space-y-2">
                {stages.score.improvementPlan.map((action, i) => (
                  <div key={i} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                    <div className="font-medium text-amber-900">{action.action}</div>
                    <div className="text-amber-700 text-xs mt-0.5">
                      Target: {action.target} · Deadline: {action.deadline}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monitoring checklist */}
          {stages.score.monitoringChecklist && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Monitoring Checklist</p>
              <ul className="space-y-1">
                {stages.score.monitoringChecklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded border border-gray-400 bg-white" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Token usage */}
      {result.tokenUsage && (
        <div className="text-xs text-gray-400 text-right px-1">
          Tokens used: {result.tokenUsage.totalTokens.toLocaleString()} (extract: {result.tokenUsage.extractTokens.toLocaleString()}, agent: {result.tokenUsage.agentTokens.toLocaleString()})
        </div>
      )}
    </div>
  );
}
