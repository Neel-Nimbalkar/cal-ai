// Pluggable estimator interface. Two modes:
//  - "demo": deterministic, offline. Returns the canned raw_estimate recorded
//    in the fixture for that photo_ref. This is what CI and default `npm run bench` use.
//  - "provider": calls a real vendor adapter. No vendor is wired into this repo
//    (no keys, no network calls committed). To benchmark a real provider, implement
//    an adapter matching `estimate(photoRef) -> { items, totals, overall_confidence,
//    latency_ms, failure? }` and pass its path via --provider-module, or set
//    CALAI_BENCH_PROVIDER_MODULE. See docs/PHOTO_ESTIMATION_BENCHMARK.md.
'use strict';

function makeDemoEstimator(casesById) {
  return {
    mode: 'demo',
    async estimate(photoRef, caseId) {
      const c = casesById.get(caseId);
      if (!c) throw new Error(`No fixture case for id ${caseId}`);
      // Return a deep copy so the harness never mutates fixture data.
      return JSON.parse(JSON.stringify(c.raw_estimate));
    }
  };
}

function loadProviderEstimator(modulePath) {
  if (!modulePath) {
    throw new Error(
      'Provider mode requires --provider-module <path> or CALAI_BENCH_PROVIDER_MODULE ' +
      'pointing at a module exporting async estimate(photoRef, caseId). None was configured.'
    );
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const mod = require(require('path').resolve(modulePath));
  if (typeof mod.estimate !== 'function') {
    throw new Error(`Provider module ${modulePath} must export an async estimate(photoRef, caseId) function`);
  }
  return { mode: 'provider', estimate: mod.estimate };
}

module.exports = { makeDemoEstimator, loadProviderEstimator };
