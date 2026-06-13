export type TruckType = "20ft" | "40ft" | "flatbed" | "mazda" | "small_van";
export type LaneId = "A-B" | "B-C" | "C-D" | "A-D";
export type Tier = "Top" | "Mid" | "Improvement" | "Provisional" | "Rejected";

// Raw submission from the carrier
export interface CarrierSubmission {
  carrierName: string;
  submittedBy: string;
  contactNumber: string;
  documentBlob: string; // WhatsApp-style free text
}

// Structured fields extracted from the document blob by the LLM
export interface ExtractedFields {
  taxId: string | null;
  bankName: string | null;
  bankAccount: string | null;
  appSignup: boolean | null;
  firstLoadCompleted: boolean | null;
  lanesServed: LaneId[];
  truckTypes: TruckType[];
  totalTrucks: number | null;
  extractionNotes: string; // what the LLM flagged as ambiguous
}

// Validation result per field
export interface FieldValidation {
  field: string;
  present: boolean;
  formatValid: boolean;
  reason: string;
}

export interface ValidationResult {
  passed: boolean;
  fields: FieldValidation[];
  rejectionMessage: string | null;
}

// Scorecard 1: Qualification gate (workflow, deterministic)
export interface QualificationCriterion {
  criterion: string;
  passed: boolean;
  note: string;
}

export interface QualificationResult {
  passed: boolean;
  provisional: boolean; // true if first load not yet completed
  criteria: QualificationCriterion[];
  summary: string;
}

// Scorecard 2: Performance scoring (agent)
export interface MetricScore {
  metric: string;
  score: number; // 0-100
  weight: number; // 0.2 for each
  weightedScore: number;
  rationale: string;
}

export interface RiskFlag {
  flag: string;
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface ImprovementAction {
  action: string;
  target: string;
  deadline: string; // e.g. "30 days"
}

export interface PerformanceResult {
  metrics: MetricScore[];
  totalScore: number; // 0-100
  tier: Tier;
  riskFlags: RiskFlag[];
  improvementPlan: ImprovementAction[] | null; // populated for Improvement tier
  monitoringChecklist: string[] | null; // populated for Provisional tier
  agentRationale: string; // agent's overall reasoning
}

// Full pipeline output for a single carrier
export interface PipelineResult {
  carrierId: string;
  carrierName: string;
  timestamp: string;
  stages: {
    extract: ExtractedFields;
    validate: ValidationResult;
    qualify: QualificationResult;
    score: PerformanceResult | null; // null if rejected or qualification failed
  };
  finalTier: Tier;
  tokenUsage?: {
    extractTokens: number;
    agentTokens: number;
    totalTokens: number;
  };
}

// Synthetic carrier data shape (from JSON)
export interface SyntheticCarrier {
  id: string;
  name: string;
  evalLabel: Tier;
  isLabelled: boolean;
  knownIssues: string[];
  submission: CarrierSubmission | null;
  performanceMetrics: {
    appAdoptionScore: number | null;
    onTimePickupRate: number | null;
    averageRatePKR: Record<string, number>;
    fulfilmentRate: number | null;
    lanesServed: LaneId[];
    truckTypes: TruckType[];
    totalTrucks: number;
    firstLoadCompleted: boolean;
    appSignup: boolean;
    taxId: string | null;
    bankName: string | null;
    bankAccount: string | null;
  };
}

// Market context shape (from JSON)
export interface LaneContext {
  id: LaneId;
  name: string;
  description: string;
  capacityGap: boolean;
  capacityGapSeverity: "low" | "high" | null;
  benchmarkRates: Record<string, number>;
}

export interface MarketContext {
  lanes: LaneContext[];
  truckTypes: TruckType[];
  tierThresholds: { top: number; mid: number; improvement: number };
  scorecardWeights: {
    appAdoption: number;
    onTimePickup: number;
    pricingCompetitiveness: number;
    fulfilmentRate: number;
    supplyBreadth: number;
  };
}

// Eval result for a single carrier
export interface EvalRecord {
  carrierId: string;
  carrierName: string;
  expectedTier: Tier;
  actualTier: Tier;
  match: boolean;
  knownIssues: string[];
  extractionAccurate: boolean;
  validationCorrect: boolean;
  notes: string;
  tokenUsage: number;
}

export interface EvalSummary {
  totalCarriers: number;
  tierMatchRate: number;
  extractionAccuracy: number;
  validationCatchRate: number;
  totalTokensUsed: number;
  estimatedCostPKR: number;
  records: EvalRecord[];
}
