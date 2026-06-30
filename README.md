# Carrier Onboarding AI Pipeline

**Built by:** Mahlab Maniar
**Stack:** Next.js (TypeScript) · Claude Sonnet 4.6 · Vercel

A working AI system that takes a new carrier submission — a WhatsApp message from a ground team — and processes it end-to-end: extracts compliance fields, validates them, qualifies the carrier, and produces a tier decision with a written rationale and improvement plan. No manual ops effort on the standard path.

Built from a manual framework I designed and ran at Trella, a YC-backed logistics marketplace in Pakistan.

---

## What It Does

A carrier submits their details informally — by WhatsApp, photo, or voice note transcribed by the ground team. This system takes that text and runs it through two layers:

**Workflow layer (deterministic):**
- Extracts tax ID, bank details, lanes, and truck types from unstructured text
- Validates compliance fields against fixed rules (7-digit NTN, bank details present, supply breadth declared)
- Runs a qualification gate — five binary checks, any fail returns a specific rejection message

**Agent layer (Claude Sonnet 4.6):**
- Scores the carrier against five performance metrics using real lane rate data (PKR benchmarks)
- Decides the tier: Top, Mid, Improvement, or Provisional
- Writes a specific improvement plan for Improvement-tier carriers — naming exact lanes, PKR gaps, and targets

The split is deliberate. Compliance validation must be deterministic and auditable. Performance assessment requires judgment and tool use — that's where the agent earns its place.

---

## Running It Locally

```bash
# 1. Install dependencies
cd app
npm install

# 2. Add your API key
cp .env.local.example .env.local
# Edit .env.local and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Start the dev server
npm run dev
# Open http://localhost:3001
```

---

## Running the Eval

With the dev server running on port 3001:

```bash
cd app
npx tsx ../eval/run_eval.ts
```

This runs all 20 labelled synthetic carriers through the full pipeline and writes results to `docs/EVAL_RESULTS.md`. The eval measures extraction accuracy, validation catch rate, and tier-match rate end-to-end.

---

## Project Structure

```
Carrier Onboarding/
├── app/
│   ├── lib/workflow/       Extraction, validation, qualification gate (deterministic)
│   ├── lib/agent/          Performance scoring agent (Claude Sonnet, tool use)
│   ├── lib/types.ts        Shared TypeScript interfaces
│   ├── data/               40 synthetic carrier profiles + market context (PKR)
│   └── app/api/            Next.js API routes (pipeline, eval)
├── eval/run_eval.ts        Standalone eval script
└── docs/
    ├── EVAL_RESULTS.md         Results from the eval run
    └── DEPLOYMENT_DECISION_LOG.md  Architecture rationale + production considerations
```

---

## The Design Decision in One Sentence

The compliance check must be deterministic so a human can defend it. The performance assessment must be agentic because no rules engine can produce a rationale a human wants to read.

---

## Deploying to Vercel

1. Push the `app/` folder to a GitHub repo
2. Import into Vercel — it auto-detects Next.js
3. Add `ANTHROPIC_API_KEY` to Environment Variables in the Vercel dashboard
4. Deploy

The API key lives server-side in Next.js API routes and is never sent to the browser.

---

## Synthetic Data

All 40 carrier profiles are synthetic and clearly labelled. They were designed to cover the full range of real submission types from the Trella context: clean compliant carriers, missing documents, pricing above benchmark, single-lane concentration, low fulfilment rate, new carriers with no history, and deliberately messy blobs with Urdu transliteration and heavy abbreviations.

The 20 labelled carriers (IDs C001–C020) each have an injected correct tier used as the eval ground truth. The 20 display-only carriers (C021–C040) are pre-processed and shown in the Carrier Database tab to demonstrate what the operational deployment looks like at scale.
