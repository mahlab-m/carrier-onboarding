import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFields, LaneId, TruckType } from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `You are extracting structured data from a carrier onboarding submission. The submission is a WhatsApp message or ground-team note — it may be informal, use abbreviations, mix English and Urdu transliteration, or omit information.

Extract the following fields from the document blob. Return ONLY valid JSON matching the schema exactly.

Schema:
{
  "taxId": string | null,           // Tax/NTN number. Must be digits only (strip spaces/hyphens). Null if not found.
  "bankName": string | null,        // Bank name. Null if not found.
  "bankAccount": string | null,     // Bank account number. Null if not found.
  "appSignup": boolean | null,      // True if they mention app signup/download/registration. Null if not mentioned.
  "firstLoadCompleted": boolean | null, // True if they mention first load done. False if explicitly say no loads yet. Null if not mentioned.
  "lanesServed": string[],          // Array of lane codes: "A-B", "B-C", "C-D", "A-D". Infer from city mentions (City A to B = A-B). Empty array if none found.
  "truckTypes": string[],           // Array from: "20ft", "40ft", "flatbed", "mazda", "small_van". Map common terms: "cha-ki"/"chaki"/"container" = 40ft, "gari"/"vehicle" = infer from context. Empty array if none found.
  "totalTrucks": number | null,     // Total number of trucks. Null if not found.
  "extractionNotes": string         // Brief note on anything ambiguous or that couldn't be extracted confidently.
}

Document blob:
{{DOCUMENT_BLOB}}`;

export async function extractFields(
  documentBlob: string
): Promise<{ fields: ExtractedFields; inputTokens: number; outputTokens: number }> {
  const prompt = EXTRACTION_PROMPT.replace("{{DOCUMENT_BLOB}}", documentBlob);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from the response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr.trim());
  } catch {
    // If parsing fails, return a minimal failed extraction
    return {
      fields: {
        taxId: null,
        bankName: null,
        bankAccount: null,
        appSignup: null,
        firstLoadCompleted: null,
        lanesServed: [],
        truckTypes: [],
        totalTrucks: null,
        extractionNotes: "Extraction failed — could not parse LLM response",
      },
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  // Normalise lane IDs to valid values
  const validLanes: LaneId[] = ["A-B", "B-C", "C-D", "A-D"];
  const rawLanes = Array.isArray(parsed.lanesServed) ? (parsed.lanesServed as string[]) : [];
  const lanesServed = rawLanes.filter((l): l is LaneId => validLanes.includes(l as LaneId));

  // Normalise truck types
  const validTrucks: TruckType[] = ["20ft", "40ft", "flatbed", "mazda", "small_van"];
  const rawTrucks = Array.isArray(parsed.truckTypes) ? (parsed.truckTypes as string[]) : [];
  const truckTypes = rawTrucks.filter((t): t is TruckType => validTrucks.includes(t as TruckType));

  return {
    fields: {
      taxId: typeof parsed.taxId === "string" ? parsed.taxId : null,
      bankName: typeof parsed.bankName === "string" ? parsed.bankName : null,
      bankAccount: typeof parsed.bankAccount === "string" ? parsed.bankAccount : null,
      appSignup: typeof parsed.appSignup === "boolean" ? parsed.appSignup : null,
      firstLoadCompleted:
        typeof parsed.firstLoadCompleted === "boolean" ? parsed.firstLoadCompleted : null,
      lanesServed,
      truckTypes,
      totalTrucks: typeof parsed.totalTrucks === "number" ? parsed.totalTrucks : null,
      extractionNotes:
        typeof parsed.extractionNotes === "string" ? parsed.extractionNotes : "",
    },
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
