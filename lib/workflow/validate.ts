import type { ExtractedFields, FieldValidation, ValidationResult } from "../types";

const TAX_ID_REGEX = /^\d{7}$/;

export function validateFields(fields: ExtractedFields): ValidationResult {
  const validations: FieldValidation[] = [];

  // Tax ID: present and exactly 7 digits
  const taxPresent = fields.taxId !== null && fields.taxId.trim() !== "";
  const taxFormatValid = taxPresent ? TAX_ID_REGEX.test(fields.taxId!.trim()) : false;
  validations.push({
    field: "Tax ID",
    present: taxPresent,
    formatValid: taxFormatValid,
    reason: !taxPresent
      ? "Tax ID not found in submission. Carrier must provide their 7-digit NTN."
      : !taxFormatValid
      ? `Tax ID "${fields.taxId}" is not a valid 7-digit number. Check the NTN format.`
      : "Tax ID present and valid format.",
  });

  // Bank name
  const bankNamePresent = fields.bankName !== null && fields.bankName.trim() !== "";
  validations.push({
    field: "Bank Name",
    present: bankNamePresent,
    formatValid: bankNamePresent,
    reason: bankNamePresent
      ? "Bank name present."
      : "Bank name not found. Carrier must provide their bank name for payment processing.",
  });

  // Bank account
  const bankAccountPresent = fields.bankAccount !== null && fields.bankAccount.trim() !== "";
  validations.push({
    field: "Bank Account Number",
    present: bankAccountPresent,
    formatValid: bankAccountPresent,
    reason: bankAccountPresent
      ? "Bank account number present."
      : "Bank account number not found. Required for payment processing and withholding tax compliance.",
  });

  // App signup (soft check — missing means unknown, not a hard fail)
  const appSignupPresent = fields.appSignup === true;
  validations.push({
    field: "App Signup",
    present: appSignupPresent,
    formatValid: appSignupPresent,
    reason: fields.appSignup === true
      ? "App signup confirmed."
      : fields.appSignup === false
      ? "Carrier explicitly stated they have not signed up on the app. Required before onboarding."
      : "App signup not mentioned in submission. Confirm with carrier.",
  });

  // Supply breadth: at least one lane and one truck type
  const hasLane = fields.lanesServed.length > 0;
  const hasTruck = fields.truckTypes.length > 0;
  validations.push({
    field: "Supply Breadth",
    present: hasLane && hasTruck,
    formatValid: hasLane && hasTruck,
    reason: !hasLane && !hasTruck
      ? "No lanes or truck types declared. Carrier must specify which routes and vehicles they operate."
      : !hasLane
      ? "No lanes declared. Carrier must specify which routes they cover."
      : !hasTruck
      ? "No truck types declared. Carrier must specify their vehicle types."
      : `${fields.lanesServed.length} lane(s) and ${fields.truckTypes.length} truck type(s) declared.`,
  });

  // Hard fails: tax ID (presence + format), bank name, bank account
  // App signup and supply breadth are also required
  const hardFailFields = validations.filter(
    (v) => !v.present || !v.formatValid
  );

  const passed = hardFailFields.length === 0;

  let rejectionMessage: string | null = null;
  if (!passed) {
    const issues = hardFailFields.map((v) => `• ${v.field}: ${v.reason}`).join("\n");
    rejectionMessage = `Submission incomplete. Please provide the following before onboarding can proceed:\n\n${issues}`;
  }

  return { passed, fields: validations, rejectionMessage };
}
