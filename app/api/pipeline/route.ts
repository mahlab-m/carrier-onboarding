import { NextRequest, NextResponse } from "next/server";
import type { SyntheticCarrier, PipelineResult, Tier } from "../../../lib/types";
import { extractFields } from "../../../lib/workflow/extract";
import { validateFields } from "../../../lib/workflow/validate";
import { runQualificationGate } from "../../../lib/workflow/router";
import { runQualificationAgent } from "../../../lib/agent/index";
import staticResults from "../../../data/static_results.json";

const STATIC_RESULTS = staticResults as unknown as Record<string, PipelineResult>;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PipelineRequest {
  carrierId?: string;
  customSubmission?: {
    carrierName: string;
    submittedBy: string;
    contactNumber: string;
    documentBlob: string;
  };
}

export async function POST(req: NextRequest) {
  let body: PipelineRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Serve pre-computed static results for preloaded carriers (offline demo mode)
  if (body.carrierId && STATIC_RESULTS[body.carrierId]) {
    await delay(4500); // Simulate pipeline running time
    return NextResponse.json(STATIC_RESULTS[body.carrierId]);
  }

  // Live API path — requires ANTHROPIC_API_KEY
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  let carrier: SyntheticCarrier | null = null;
  let submission: { carrierName: string; submittedBy: string; contactNumber: string; documentBlob: string };

  if (body.carrierId) {
    const { default: carriers } = await import("../../../data/synthetic_carriers.json");
    carrier = (carriers as unknown as SyntheticCarrier[]).find((c) => c.id === body.carrierId) ?? null;
    if (!carrier || !carrier.submission) {
      return NextResponse.json({ error: "Carrier not found or has no submission" }, { status: 404 });
    }
    submission = carrier.submission;
  } else if (body.customSubmission) {
    submission = body.customSubmission;
  } else {
    return NextResponse.json({ error: "Provide carrierId or customSubmission" }, { status: 400 });
  }

  const carrierId = carrier?.id ?? "CUSTOM";
  const timestamp = new Date().toISOString();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Step 1: Extract
  const { fields: extractedFields, inputTokens: extractIn, outputTokens: extractOut } =
    await extractFields(submission.documentBlob);
  totalInputTokens += extractIn;
  totalOutputTokens += extractOut;

  // Step 2: Validate
  const validationResult = validateFields(extractedFields);

  // Step 3: Qualification gate (workflow, deterministic)
  const qualificationResult = runQualificationGate(extractedFields, validationResult);

  // If rejected at validation, return early
  if (!validationResult.passed) {
    const result: PipelineResult = {
      carrierId,
      carrierName: submission.carrierName,
      timestamp,
      stages: {
        extract: extractedFields,
        validate: validationResult,
        qualify: qualificationResult,
        score: null,
      },
      finalTier: "Rejected" as Tier,
      tokenUsage: {
        extractTokens: extractIn + extractOut,
        agentTokens: 0,
        totalTokens: extractIn + extractOut,
      },
    };
    return NextResponse.json(result);
  }

  // If qualification gate failed (shouldn't happen if validation passed, but defensive)
  if (!qualificationResult.passed) {
    const result: PipelineResult = {
      carrierId,
      carrierName: submission.carrierName,
      timestamp,
      stages: {
        extract: extractedFields,
        validate: validationResult,
        qualify: qualificationResult,
        score: null,
      },
      finalTier: "Rejected" as Tier,
      tokenUsage: {
        extractTokens: extractIn + extractOut,
        agentTokens: 0,
        totalTokens: extractIn + extractOut,
      },
    };
    return NextResponse.json(result);
  }

  // Step 4: Agent — Scorecard 2 performance assessment
  const performanceMetrics = carrier?.performanceMetrics ?? {
    appAdoptionScore: null,
    onTimePickupRate: null,
    averageRatePKR: {},
    fulfilmentRate: null,
  };

  const { result: performanceResult, inputTokens: agentIn, outputTokens: agentOut } =
    await runQualificationAgent({
      carrierName: submission.carrierName,
      extractedFields,
      qualificationResult,
      performanceMetrics: {
        appAdoptionScore: performanceMetrics.appAdoptionScore,
        onTimePickupRate: performanceMetrics.onTimePickupRate,
        averageRatePKR: performanceMetrics.averageRatePKR,
        fulfilmentRate: performanceMetrics.fulfilmentRate,
      },
    });
  totalInputTokens += agentIn;
  totalOutputTokens += agentOut;

  const result: PipelineResult = {
    carrierId,
    carrierName: submission.carrierName,
    timestamp,
    stages: {
      extract: extractedFields,
      validate: validationResult,
      qualify: qualificationResult,
      score: performanceResult,
    },
    finalTier: performanceResult.tier,
    tokenUsage: {
      extractTokens: extractIn + extractOut,
      agentTokens: agentIn + agentOut,
      totalTokens: totalInputTokens + totalOutputTokens,
    },
  };

  return NextResponse.json(result);
}
