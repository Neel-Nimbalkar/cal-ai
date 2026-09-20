# CalAI

A responsive, privacy-first calorie and macro tracking MVP. It runs as a zero-dependency static web app and includes a product-led waitlist.

## Included
- No-account onboarding and Mifflin–St Jeor target estimate
- 1,200/1,500 kcal safety floors and clinician opt-out guardrail
- 30-food search, meal diary, macro totals, 14-day history
- Local persistence, JSON export, and data reset
- Waitlist email plus friction-segmentation question
- Responsive interface and zero third-party browser dependencies
- Photo meal logging with preview, per-item/overall confidence, portion correction, and diary integration
- Honest demo mode when no vision provider is configured; transient provider processing when configured

## Run
```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Verify
```bash
node test/verify.js
```

## Production gaps
This validation build stores diary and waitlist data locally. Before traffic, connect the waitlist to an email provider, add consent/privacy pages, production analytics, authentication/sync, a live nutrition API, and production-grade photo-estimation validation. CalAI is not a medical device and calorie targets are estimates.

## Photo-estimation benchmark
The photo-based meal estimation flow has an upload/review/correct/log UI plus a
reproducible benchmark harness and fixture set under `benchmark/`. Run it with:
```bash
npm run bench
```
See `docs/PHOTO_ESTIMATION_BENCHMARK.md` for methodology, metrics, launch gates, and how
to point it at a real provider instead of the offline demo estimator.

## Production waitlist

The waitlist uses Netlify Functions, Netlify Blobs, and Resend for double opt-in. Set these Netlify environment variables before accepting signups:

- `RESEND_API_KEY` — Resend API key with send permission
- `WAITLIST_FROM` — verified sender, for example `CalAI <hello@yourdomain.com>`

New signups remain `pending` until the recipient follows the one-time confirmation link. Links expire after 7 days. Privacy and consent notices are available at `/privacy.html` and `/consent.html`.

## Photo estimation configuration

The endpoint is `POST /api/estimate-meal`. Without provider credentials it returns a clearly labeled deterministic demo meal so the review and correction UX remains testable; it never pretends the photo was analyzed. To enable live image analysis, set:

- `CALAI_PHOTO_PROVIDER_ENABLED=true` — explicit production opt-in
- `OPENAI_API_KEY` — server-side only; never expose it in browser code
- `CALAI_VISION_MODEL` — optional, defaults to `gpt-4o-mini`

Accepted photos are JPEG, PNG, or WebP up to 5 MB. CalAI does not write image bytes to storage or the diary, responses use `Cache-Control: no-store`, and only corrected nutrition totals are persisted locally. Provider processing is still subject to that provider's data terms. AI estimates are explicitly non-medical and require review before logging.
