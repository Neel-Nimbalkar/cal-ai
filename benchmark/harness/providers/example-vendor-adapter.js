// Example provider adapter template. Copy this file, point CALAI_BENCH_PROVIDER_MODULE
// (or --provider-module) at your copy, and implement the network call to your real
// photo-estimation vendor. This file intentionally makes no network calls and is not
// used by default `npm run bench` — demo mode is the default so CI stays offline and
// reproducible.
//
// Contract: estimate(photoRef, caseId) must resolve to:
//   {
//     items: [{ label: string, grams: number, confidence: number(0-1) }],
//     totals: { calories, protein, carbs, fat },
//     overall_confidence: number(0-1),
//     latency_ms: number,
//     failure?: string   // set this instead of throwing, so the harness counts it correctly
//   }
//
// photoRef is the fixture's photo_ref string, NOT a real image. If your provider needs
// actual image bytes, keep a local (gitignored) directory mapping photo_ref -> file path
// and load it here; do not commit real photos to this repository.
'use strict';

async function estimate(photoRef, caseId) {
  throw new Error(
    `example-vendor-adapter is a template, not a real adapter (asked to estimate ${photoRef} / ${caseId}). ` +
    'Copy this file and implement a real vendor call before using --mode provider.'
  );
}

module.exports = { estimate };
