# Social Scraper (Kaan's fork of Creator Lab, MIT)

Fork of github.com/artemnovitckii/creator-lab (MIT), remote `upstream`. Being extended into "Money Radar": see
`docs/superpowers/specs/2026-09-25-money-radar-design.md`. Read `lessons.md` too.

- Start: `~/Dev/active/office/bin/creator-lab.sh` (loads APIFY_TOKEN from the office .env.local and TYPESAFE_API_KEY from
  JEV's .env.local; picks Fireworks or Groq by which key exists). Or `npm start` with a local `.env`. Serves 127.0.0.1:5190.
- Test: `npm test` (mocked providers, no paid calls). Syntax check: `npm run check`. Setup check: `npm run doctor`.
- No build step, no dependencies. Deploy: none (local only).
- `data/` holds runs, caches and media: private, gitignored. Back it up (copy) before any storage migration.
- Paid calls (Apify, Groq/Fireworks, Jev) only after Kaan's yes for new spend beyond a run he starts himself.
- Money view (build 1, branch `money-radar-build-1`): formulas in `public/money/<version>.mjs` are frozen once shown to
  Kaan; changes go in a new version file registered in `public/money/index.mjs`. `tests/fixtures/money-1.0-golden.json`
  guards money-1.0 (regenerate only with `UPDATE_GOLDEN=1` and a written reason).
- Hand check on real runs: `node scripts/validate-money.mjs` (reads `data/`, prints only).
- Decision checks (paid, cents): `node scripts/judge-test.mjs <runId>` (does the reel judge pick this channel's winners? result in data/channels/<run>/judge-test.json), `node scripts/qa-eval.mjs` (the quality checks' exam: frozen cases in evals/qa, history in data/qa-eval.jsonl; run after any check change), `node scripts/review-reels.mjs` (every made reel as a scroller, plus code checks for cut lines and silences).
- Free re-edit of a made reel: `node scripts/re-edit.mjs <runId> <reelId> <source.mp4> <keep ranges> [--captions] [--no-hook]` (keeps the old reel as reel-before-*.mp4).
- Status: build 1 done (metrics, Money view, crash-safe saves, transcript policy). Next: build 2 spec (discovery, queue,
  spending guard, storage) with its own Codex review before code. See the spec, section 6.
