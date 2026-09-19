#!/usr/bin/env node
// CalAI photo-estimation benchmark harness.
// Usage:
//   node benchmark/harness/run.js [--mode demo|provider] [--provider-module ./path.js] [--out ./benchmark/results/latest.json]
// See docs/PHOTO_ESTIMATION_BENCHMARK.md for full methodology.
'use strict';

const fs = require('fs');
const path = require('path');
const {
  matchItems,
  aggregatePrecisionRecall,
  ape,
  meanApe,
  brierScore,
  expectedCalibrationError,
  tierFor,
  coverageByTier,
  correctionEffectiveness
} = require('./metrics');
const { makeDemoEstimator, loadProviderEstimator } = require('./estimator');
const { totalsForItems } = require('./nutrition');
const { evaluateGates } = require('./gates');

function parseArgs(argv) {
  const args = { mode: process.env.CALAI_BENCH_MODE || 'demo', providerModule: process.env.CALAI_BENCH_PROVIDER_MODULE || null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode') args.mode = argv[++i];
    else if (argv[i] === '--provider-module') args.providerModule = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.join(__dirname, '..', 'fixtures', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cases = manifest.cases;
  const casesById = new Map(cases.map((c) => [c.id, c]));

  const estimator = args.mode === 'provider'
    ? loadProviderEstimator(args.providerModule)
    : makeDemoEstimator(casesById);

  const perCase = [];
  const failures = [];
  const latencies = [];

  for (const c of cases) {
    const t0 = Date.now();
    let out;
    let harnessError = null;
    try {
      out = await estimator.estimate(c.photo_ref, c.id);
    } catch (e) {
      harnessError = e.message;
      out = { items: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, overall_confidence: 0, latency_ms: Date.now() - t0, failure: 'harness_exception' };
    }
    const latencyMs = typeof out.latency_ms === 'number' ? out.latency_ms : (Date.now() - t0);
    latencies.push(latencyMs);

    const isFailure = !!out.failure || !!harnessError;
    if (isFailure) failures.push({ id: c.id, reason: out.failure || harnessError });

    const { tp, fp, fn } = matchItems(out.items || [], c.ground_truth.items);
    const calApe = ape(out.totals.calories, c.ground_truth.totals.calories);
    const proteinApe = ape(out.totals.protein, c.ground_truth.totals.protein);
    const carbsApe = ape(out.totals.carbs, c.ground_truth.totals.carbs);
    const fatApe = ape(out.totals.fat, c.ground_truth.totals.fat);
    const confidence = typeof out.overall_confidence === 'number' ? out.overall_confidence : 0;
    const withinTolerance = calApe !== null && calApe <= 20; // correctness signal for calibration

    perCase.push({
      id: c.id,
      photo_ref: c.photo_ref,
      tp, fp, fn,
      calApe, proteinApe, carbsApe, fatApe,
      confidence,
      tier: tierFor(confidence),
      withinTolerance,
      isFailure,
      latencyMs
    });
  }

  const nonFailureCases = perCase.filter((r) => !r.isFailure);
  const itemPrecisionRecall = aggregatePrecisionRecall(nonFailureCases.map((r) => ({ tp: r.tp, fp: r.fp, fn: r.fn })));

  const calorieMapeRaw = meanApe(nonFailureCases.map((r) => r.calApe));
  const proteinMape = meanApe(nonFailureCases.map((r) => r.proteinApe));
  const carbsMape = meanApe(nonFailureCases.map((r) => r.carbsApe));
  const fatMape = meanApe(nonFailureCases.map((r) => r.fatApe));

  const confidences = perCase.map((r) => r.confidence);
  const correctFlags = perCase.map((r) => r.withinTolerance);
  const calibration = {
    brier: brierScore(confidences, correctFlags),
    ...expectedCalibrationError(confidences, correctFlags, 5)
  };

  const coverage = coverageByTier(confidences);
  const highTierCases = perCase.filter((r) => r.tier === 'high');
  const highTierAccuracy = highTierCases.length === 0
    ? null
    : highTierCases.filter((r) => r.withinTolerance).length / highTierCases.length;

  const correction = correctionEffectiveness(cases, totalsForItems);

  const sortedLatency = [...latencies].sort((a, b) => a - b);
  const latency = {
    mean: latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1),
    p50: percentile(sortedLatency, 50),
    p95: percentile(sortedLatency, 95),
    max: sortedLatency[sortedLatency.length - 1] || 0
  };

  const failureRate = failures.length / perCase.length;

  const results = {
    mode: estimator.mode,
    generatedAt: new Date().toISOString(),
    caseCount: perCase.length,
    itemPrecisionRecall,
    calorieMapeRaw,
    macroMape: { protein: proteinMape, carbs: carbsMape, fat: fatMape },
    calibration,
    coverage,
    highTierAccuracy,
    correction,
    latency,
    failureRate,
    failures,
    perCase
  };

  const gates = evaluateGates(results);
  const allPass = gates.every((g) => g.pass);
  results.gates = gates;
  results.gateVerdict = allPass ? 'PASS' : 'FAIL';

  const outPath = args.out || path.join(__dirname, '..', 'results', 'latest.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  // Human-readable summary to stdout.
  console.log(`\nCalAI photo-estimation benchmark — mode: ${results.mode}`);
  console.log(`Cases: ${results.caseCount}  Failures: ${failures.length} (${(failureRate * 100).toFixed(1)}%)`);
  console.log(`Item F1: ${itemPrecisionRecall.f1 !== null ? itemPrecisionRecall.f1.toFixed(3) : 'n/a'} (P=${itemPrecisionRecall.precision?.toFixed(3)}, R=${itemPrecisionRecall.recall?.toFixed(3)})`);
  console.log(`Calorie MAPE (raw): ${calorieMapeRaw !== null ? calorieMapeRaw.toFixed(1) + '%' : 'n/a'}`);
  console.log(`Macro MAPE: protein=${proteinMape?.toFixed(1)}% carbs=${carbsMape?.toFixed(1)}% fat=${fatMape?.toFixed(1)}%`);
  console.log(`Calibration: Brier=${calibration.brier?.toFixed(3)} ECE=${calibration.ece?.toFixed(3)}`);
  console.log(`Coverage by tier: high=${(coverage.coverage.high * 100).toFixed(0)}% medium=${(coverage.coverage.medium * 100).toFixed(0)}% low=${(coverage.coverage.low * 100).toFixed(0)}%`);
  console.log(`High-tier accuracy (within 20% of truth): ${highTierAccuracy !== null ? (highTierAccuracy * 100).toFixed(0) + '%' : 'n/a'}`);
  console.log(`Correction effectiveness: before=${correction.beforeMeanApe?.toFixed(1)}% after=${correction.afterMeanApe?.toFixed(1)}% (n=${correction.correctedCaseCount})`);
  console.log(`Latency: mean=${latency.mean.toFixed(0)}ms p50=${latency.p50}ms p95=${latency.p95}ms`);
  console.log(`\nGates:`);
  for (const g of gates) {
    console.log(`  [${g.pass ? 'PASS' : 'FAIL'}] ${g.id} — ${g.description} (value: ${typeof g.value === 'number' ? g.value.toFixed(3) : g.value})`);
  }
  console.log(`\nVerdict: ${results.gateVerdict}`);
  console.log(`Full results written to ${outPath}\n`);

  if (!allPass && process.env.CALAI_BENCH_STRICT === '1') {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Benchmark harness failed:', e);
  process.exitCode = 1;
});
