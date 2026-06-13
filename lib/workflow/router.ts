import type { ExtractedFields, ValidationResult, QualificationResult } from "../types";

// Scorecard 1: deterministic qualification gate
export function runQualificationGate(
  fields: ExtractedFields,
  validation: ValidationResult
): QualificationResult {
  if (!validation.passed) {
    return {
      passed: false,
      provisional: false,
      criteria: validation.fields.map((f) => ({
        criterion: f.field,
        passed: f.present && f.formatValid,
        note: f.reason,
      })),
      summary: "Carrier did not pass compliance validation. Rejected before qualification.",
    };
  }

  const criteria = [
    {
      criterion: "Tax ID",
      passed: true,
      note: `NTN ${fields.taxId} — valid 7-digit format confirmed.`,
    },
    {
      criterion: "Bank Details",
      passed: true,
      note: `${fields.bankName}, account ${fields.bankAccount} — present and recorded.`,
    },
    {
      criterion: "App Signup",
      passed: fields.appSignup === true,
      note:
        fields.appSignup === true
          ? "Carrier is registered on the app."
          : "App signup not confirmed. Follow up required.",
    },
    {
      criterion: "First Load",
      passed: fields.firstLoadCompleted !== false,
      note:
        fields.firstLoadCompleted === true
          ? "First load completed."
          : fields.firstLoadCompleted === null
          ? "First load status unknown — treat as Provisional."
          : "First load not yet completed — Provisional status until first load is done.",
    },
    {
      criterion: "Supply Breadth",
      passed: fields.lanesServed.length > 0 && fields.truckTypes.length > 0,
      note: `${fields.lanesServed.length} lane(s): ${fields.lanesServed.join(", ")}. ${fields.truckTypes.length} truck type(s): ${fields.truckTypes.join(", ")}.`,
    },
  ];

  const hardFails = criteria.filter((c) => !c.passed);
  // App signup is a soft check — missing doesn't block, just flags
  const blockingFails = hardFails.filter((c) => c.criterion !== "App Signup");

  // First load not completed = Provisional, not rejected
  const isProvisional =
    fields.firstLoadCompleted === false || fields.firstLoadCompleted === null;

  const passed = blockingFails.length === 0;

  let summary: string;
  if (!passed) {
    summary = `Qualification failed. Issues: ${blockingFails.map((c) => c.criterion).join(", ")}.`;
  } else if (isProvisional) {
    summary =
      "Carrier qualifies on all compliance criteria. Provisional status — first load not yet completed. Route to performance assessment with Provisional flag.";
  } else {
    summary =
      "Carrier passes all qualification criteria. Route to performance assessment (Scorecard 2).";
  }

  return { passed, provisional: isProvisional, criteria, summary };
}
