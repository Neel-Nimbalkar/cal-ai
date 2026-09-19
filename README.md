# CalAI

A responsive, privacy-first calorie and macro tracking MVP. It runs as a zero-dependency static web app and includes a product-led waitlist.

## Included
- No-account onboarding and Mifflin–St Jeor target estimate
- 1,200/1,500 kcal safety floors and clinician opt-out guardrail
- 30-food search, meal diary, macro totals, 14-day history
- Local persistence, JSON export, and data reset
- Waitlist email plus friction-segmentation question
- Responsive interface and zero third-party runtime dependencies

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
This validation build stores diary and waitlist data locally. Before traffic, connect the waitlist to an email provider, add consent/privacy pages, production analytics, authentication/sync, a live nutrition API, and the photo-estimation pipeline. CalAI is not a medical device and calorie targets are estimates.

## Photo-estimation benchmark
The photo-based meal estimation flow (roadmap item, not yet implemented) has a
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
