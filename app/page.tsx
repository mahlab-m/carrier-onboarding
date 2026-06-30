"use client";

import { useState } from "react";
import type { SyntheticCarrier, PipelineResult } from "../lib/types";
import PipelineOutput from "../components/PipelineOutput";
import CarrierDatabase from "../components/CarrierDatabase";
import carriersData from "../data/synthetic_carriers.json";

const carriers = carriersData as unknown as SyntheticCarrier[];
const labelledCarriers = carriers.filter((c) => c.isLabelled && c.submission !== null);

type Tab = "pipeline" | "database" | "about";

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
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Carrier Onboarding AI</h1>
            <p className="text-sm text-gray-600 mt-0.5">
              An AI pipeline that qualifies and tiers logistics carriers from raw WhatsApp submissions.
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Built from the manual onboarding framework I designed at Trella, deployed here as a working system.
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
          {(["pipeline", "database", "about"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "pipeline" ? "Run Pipeline" : tab === "database" ? "Carrier Database" : "About"}
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
                    onClick={() => !isDemoMode && setUseCustom(true)}
                    disabled={isDemoMode}
                    title={isDemoMode ? "Custom submissions require a live API key" : undefined}
                    className={`flex-1 py-1.5 text-xs rounded border ${
                      useCustom
                        ? "bg-gray-900 text-white border-gray-900"
                        : isDemoMode
                        ? "bg-white text-gray-300 border-gray-100 cursor-not-allowed"
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
                ) : isDemoMode ? (
                  <div className="rounded bg-gray-50 border border-gray-100 px-3 py-4 text-xs text-gray-500 text-center">
                    Custom submissions require a live API key.
                    <br />This public demo runs on preloaded carriers only.
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

        {activeTab === "about" && (
          <div className="max-w-2xl space-y-8">
            {/* What this is */}
            <div>
              <h2 className="font-semibold text-gray-800 mb-2">What this is</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                A working AI pipeline that takes a new carrier submission — a WhatsApp message from a ground team — and processes it end-to-end: extracts compliance fields, validates them, qualifies the carrier, and produces a tier decision with a written rationale and improvement plan.
              </p>
              <p className="text-sm text-gray-600 leading-relaxed mt-2">
                Built from a manual onboarding framework I designed and ran at Trella, a YC-backed logistics marketplace in Pakistan. The manual process had two problems: ops reps applying rules inconsistently, and no systematic way to tier carriers by performance. This system replaces the standard path with no manual effort.
              </p>
            </div>

            {/* How to use it */}
            <div>
              <h2 className="font-semibold text-gray-800 mb-3">How to use this demo</h2>
              <div className="space-y-3">
                {[
                  { step: "1", label: "Run Pipeline", desc: "Select any carrier from the dropdown and click Run Pipeline. You'll see the submission blob, then each stage of the pipeline: extraction, validation, qualification gate, and the agent's performance assessment. The preloaded carriers are pre-computed — no API key required." },
                  { step: "2", label: "Carrier Database", desc: "The database tab shows all 40 synthetic carrier profiles with their tiers and scores. Expand any row to see the underlying Scorecard 2 metrics. Carriers marked Rejected have no score — they were stopped at the compliance gate before the agent ran." },
                  { step: "3", label: "Try the hard cases", desc: "C016 and C017 are Urdu transliteration submissions. C018 is almost entirely abbreviations. C013 and C014 are borderline scores — one point apart on the tier threshold. C015 has all metrics poor and generates a multi-flag improvement plan." },
                ].map(({ step, label, desc }) => (
                  <div key={step} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-medium flex items-center justify-center mt-0.5">{step}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* The design decision */}
            <div>
              <h2 className="font-semibold text-gray-800 mb-2">The design decision</h2>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">
                The pipeline has two layers, and the split is deliberate.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Workflow layer</p>
                  <p className="text-sm text-gray-700 leading-relaxed">Extract → Validate → Scorecard 1. Deterministic rules. Any fail returns a specific rejection message. Compliance decisions must be auditable — an agent here would add non-determinism to a step that has to be defensible.</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">Agent layer</p>
                  <p className="text-sm text-gray-700 leading-relaxed">Scorecard 2 + improvement plans. Claude Sonnet 4.6 with tool use. Compares carrier rates against PKR lane benchmarks, assesses supply gaps, writes specific plans. No rules engine produces a rationale a human wants to read.</p>
                </div>
              </div>
            </div>

            {/* Eval */}
            <div>
              <h2 className="font-semibold text-gray-800 mb-2">Eval</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Tested against 20 synthetic carrier profiles covering the full archetype space — clean submissions, Urdu transliteration, heavy abbreviations, missing fields, borderline scores, and multi-flag improvement cases. 20/20 tier match on the authored test set. Two observed imperfections noted: C014&apos;s borderline rationale skips the fact that two metrics are below SLA, and C016&apos;s blended pricing score absorbs a 15% above-benchmark lane without flagging it.
              </p>
            </div>

            {/* Built by */}
            <div className="border-t border-gray-100 pt-6">
              <p className="text-xs text-gray-400">
                Built by Mahlab Maniar · Stack: Next.js, TypeScript, Claude Sonnet 4.6, Vercel ·{" "}
                <a href="https://github.com/mahlab-m/carrier-onboarding" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">GitHub</a>
              </p>
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
