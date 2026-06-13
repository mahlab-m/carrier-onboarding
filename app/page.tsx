"use client";

import { useState } from "react";
import type { SyntheticCarrier, PipelineResult } from "../lib/types";
import PipelineOutput from "../components/PipelineOutput";
import CarrierDatabase from "../components/CarrierDatabase";
import carriersData from "../data/synthetic_carriers.json";

const carriers = carriersData as unknown as SyntheticCarrier[];
const labelledCarriers = carriers.filter((c) => c.isLabelled && c.submission !== null);

type Tab = "pipeline" | "database";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");
  const [selectedId, setSelectedId] = useState<string>(labelledCarriers[0]?.id ?? "");
  const [customBlob, setCustomBlob] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const PIPELINE_STAGES = [
    { label: "Processing document…", icon: "📄", delay: 300 },
    { label: "Extracting fields…", icon: "🔍", delay: 900 },
    { label: "Validating compliance…", icon: "✅", delay: 1700 },
    { label: "Running qualification gate…", icon: "🚦", delay: 2400 },
    { label: "Agent assessing performance…", icon: "🤖", delay: 3200 },
  ];

  async function runPipeline() {
    setLoading(true);
    setLoadingStage(0);
    setResult(null);
    setError(null);

    // Kick off stage timers
    PIPELINE_STAGES.forEach((stage, i) => {
      setTimeout(() => setLoadingStage(i), stage.delay);
    });

    try {
      const body = useCustom
        ? {
            customSubmission: {
              carrierName: "Custom Submission",
              submittedBy: "—",
              contactNumber: "—",
              documentBlob: customBlob,
            },
          }
        : { carrierId: selectedId };

      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Pipeline failed");
        return;
      }

      const data: PipelineResult = await res.json();
      // Attach the raw blob for display
      if (!useCustom) {
        const carrier = carriers.find((c) => c.id === selectedId);
        if (carrier?.submission) {
          (data as unknown as Record<string, unknown>).rawBlob = carrier.submission.documentBlob;
        }
      } else {
        (data as unknown as Record<string, unknown>).rawBlob = customBlob;
      }
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleSelectFromDB(id: string) {
    setSelectedId(id);
    setUseCustom(false);
    setActiveTab("pipeline");
    setResult(null);
  }

  const selectedCarrier = carriers.find((c) => c.id === selectedId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Carrier Onboarding AI</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Deterministic workflow + agent qualification pipeline
            </p>
          </div>
          <div className="text-xs text-gray-400 text-right">
            <div>Model: claude-sonnet-4-6</div>
            <div>{carriers.length} carriers in database</div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-6 pt-4">
        <div className="flex border-b border-gray-200">
          {(["pipeline", "database"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "pipeline" ? "Run Pipeline" : "Carrier Database"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {activeTab === "pipeline" && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            {/* Left panel: submission selector */}
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="font-semibold text-gray-800 mb-3 text-sm">Submission</h2>

                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setUseCustom(false)}
                    className={`flex-1 py-1.5 text-xs rounded border ${
                      !useCustom
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Preloaded
                  </button>
                  <button
                    onClick={() => setUseCustom(true)}
                    className={`flex-1 py-1.5 text-xs rounded border ${
                      useCustom
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Paste your own
                  </button>
                </div>

                {!useCustom ? (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Select carrier</label>
                    <select
                      value={selectedId}
                      onChange={(e) => {
                        setSelectedId(e.target.value);
                        setResult(null);
                      }}
                      className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      {labelledCarriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id} — {c.name}
                        </option>
                      ))}
                    </select>

                    {selectedCarrier?.submission && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 mb-1">Document blob</p>
                        <p className="text-xs text-gray-600 italic bg-gray-50 rounded p-2.5 border border-gray-100 leading-relaxed">
                          &ldquo;{selectedCarrier.submission.documentBlob}&rdquo;
                        </p>
                      </div>
                    )}

                    {selectedCarrier?.knownIssues.length ? (
                      <div className="mt-3 text-xs text-gray-400">
                        <span className="font-medium">Known issues:</span>{" "}
                        {selectedCarrier.knownIssues.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Paste a WhatsApp-style submission
                    </label>
                    <textarea
                      value={customBlob}
                      onChange={(e) => setCustomBlob(e.target.value)}
                      placeholder="e.g. Hi, we are ABC Transport. Tax 1234567, bank MCB 0012345678. 2x 40ft trucks on City A to B lane. App registered. First load done."
                      rows={6}
                      className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
                    />
                  </div>
                )}

                <button
                  onClick={runPipeline}
                  disabled={loading || (useCustom && !customBlob.trim())}
                  className="mt-4 w-full py-2 text-sm font-medium rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Running pipeline…" : "Run Pipeline"}
                </button>

                {error && (
                  <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {error}
                  </div>
                )}
              </div>

            </div>

            {/* Right panel: results */}
            <div>
              {loading && (
                <div className="bg-white rounded-lg border border-gray-200 p-8">
                  <div className="max-w-sm mx-auto">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-5">Pipeline Running</p>
                    <div className="space-y-3">
                      {PIPELINE_STAGES.map((stage, i) => {
                        const done = i < loadingStage;
                        const active = i === loadingStage;
                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-3 text-sm transition-opacity duration-300 ${
                              done ? "opacity-100" : active ? "opacity-100" : "opacity-25"
                            }`}
                          >
                            <span className="w-5 text-center">
                              {done ? (
                                <span className="text-green-500 font-bold">✓</span>
                              ) : active ? (
                                <span className="animate-spin inline-block">⟳</span>
                              ) : (
                                <span className="text-gray-300">○</span>
                              )}
                            </span>
                            <span className={done ? "text-gray-400 line-through" : active ? "text-gray-800 font-medium" : "text-gray-300"}>
                              {stage.label}
                            </span>
                            {active && i === PIPELINE_STAGES.length - 1 && (
                              <span className="text-gray-400 text-xs animate-pulse">thinking…</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-6 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-800 rounded-full transition-all duration-700"
                        style={{ width: `${((loadingStage + 1) / PIPELINE_STAGES.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {!loading && !result && (
                <div className="flex items-center justify-center h-64 bg-white rounded-lg border border-gray-200 border-dashed">
                  <p className="text-sm text-gray-400">Select a carrier and run the pipeline to see results.</p>
                </div>
              )}
              {!loading && result && <PipelineOutput result={result} />}
            </div>
          </div>
        )}

        {activeTab === "database" && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-800">Carrier Database</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {carriers.length} carriers — what the operational deployment looks like at scale
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                {(["Top", "Mid", "Improvement", "Provisional"] as const).map((t) => {
                  const count = carriers.filter((c) => c.evalLabel === t).length;
                  const label: Record<string, string> = { Top: "Tier 1", Mid: "Tier 2", Improvement: "Tier 3", Provisional: "Provisional" };
                  return (
                    <span key={t} className="px-2 py-1 rounded border bg-gray-50 text-gray-600">
                      {label[t]}: {count}
                    </span>
                  );
                })}
              </div>
            </div>
            <CarrierDatabase carriers={carriers} onSelectCarrier={handleSelectFromDB} />
          </div>
        )}
      </div>
    </div>
  );
}
