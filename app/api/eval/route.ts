import { NextResponse } from "next/server";
import type { SyntheticCarrier, EvalRecord, EvalSummary, Tier, PipelineResult } from "../../../lib/types";
import { extractFields } from "../../../lib/workflow/extract";
import { validateFields } from "../../../lib/workflow/validate";
import { runQualificationGate } from "../../../lib/workflow/router";
import { runQualificationAgent } from "../../../lib/agent/index";

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { default: allCarriers } = await import("../../../data/synthetic_carriers.json");
  const labelledCarriers = (allCarriers as unknown as SyntheticCarrier[]).filter(
    (c) => c.isLabelled && c.submission !== null
  );

  const records: EvalRecord[] = [];
  let totalTokens = 0;

  for (const carrier of labelledCarriers) {
    if (!carrier.submission) continue;

    try {
      const { fields: extractedFields, inputTokens: extractIn, outputTokens: extractOut } =
        await extractFields(carrier.submission.documentBlob);

      const validationResult = validateFields(extractedFields);
      const qualificationResult = runQualificationGate(extractedFields, validationResult);

      let actualTier: Tier;
      let agentTokens = 0;
      let extractionAccurate = true;
      let validationCorrect = true;
      const notes: string[] = [];

      // Check extraction accuracy
      const pm = carrier.performanceMetrics;
      if (pm.taxId && extractedFields.taxId !== pm.taxId) {
        extractionAccurate = false;
        notes.push(`Tax ID mismatch: expected "${pm.taxId}", got "${extractedFields.taxId}"`);
      }
      if (pm.bankName && !extractedFields.bankName) {
        extractionAccurate = false;
        notes.push(`Bank name missing: expected "${pm.bankName}"`);
      }
      if (pm.bankAccount && !extractedFields.bankAccount) {
        extractionAccurate = false;
        notes.push(`Bank account missing: expected "${pm.bankAccount}"`);
      }

      if (!validationResult.passed) {
        actualTier = "Rejected";
        // Check if rejection was expected
        const expectedRejection = carrier.evalLabel === "Rejected";
        if (!expectedRejection) {
          validationCorrect = false;
          notes.push(`Unexpected rejection — expected ${carrier.evalLabel}`);
        }
      } else {
        // Run agent
        const { result: perfResult, inputTokens: agentIn, outputTokens: agentOut } =
          await runQualificationAgent({
            carrierName: carrier.submission.carrierName,
            extractedFields,
            qualificationResult,
            performanceMetrics: {
              appAdoptionScore: pm.appAdoptionScore,
              onTimePickupRate: pm.onTimePickupRate,
              averageRatePKR: pm.averageRatePKR,
              fulfilmentRate: pm.fulfilmentRate,
            },
          });
        agentTokens = agentIn + agentOut;
        actualTier = perfResult.tier;
      }

      const carrierTokens = extractIn + extractOut + agentTokens;
      totalTokens += carrierTokens;

      records.push({
        carrierId: carrier.id,
        carrierName: carrier.name,
        expectedTier: carrier.evalLabel,
        actualTier,
        match: actualTier === carrier.evalLabel,
        knownIssues: carrier.knownIssues,
        extractionAccurate,
        validationCorrect,
        notes: notes.join("; "),
        tokenUsage: carrierTokens,
      });
    } catch (err) {
      records.push({
        carrierId: carrier.id,
        carrierName: carrier.name,
        expectedTier: carrier.evalLabel,
        actualTier: "Rejected",
        match: false,
        knownIssues: carrier.knownIssues,
        extractionAccurate: false,
        validationCorrect: false,
        notes: `Error: ${err instanceof Error ? err.message : String(err)}`,
        tokenUsage: 0,
      });
    }
  }

  const tierMatches = records.filter((r) => r.match).length;
  const extractionCorrect = records.filter((r) => r.extractionAccurate).length;
  const validationCorrectCount = records.filter((r) => r.validationCorrect).length;

  // Validation catch rate: of carriers expected to be Rejected, how many were correctly rejected?
  const expectedRejections = records.filter((r) => r.expectedTier === "Rejected");
  const correctRejections = expectedRejections.filter((r) => r.match);

  const summary: EvalSummary = {
    totalCarriers: records.length,
    tierMatchRate: Math.round((tierMatches / records.length) * 100),
    extractionAccuracy: Math.round((extractionCorrect / records.length) * 100),
    validationCatchRate:
      expectedRejections.length > 0
        ? Math.round((correctRejections.length / expectedRejections.length) * 100)
        : 100,
    totalTokensUsed: totalTokens,
    // Rough cost estimate: Sonnet 4.6 input ~$3/M tokens, output ~$15/M tokens
    estimatedCostPKR: Math.round((totalTokens * 0.000009) * 280), // ~$0.009/1k tokens avg, PKR 280/USD
    records,
  };

  return NextResponse.json(summary);
}
