# Social Scraper

Finds the reels that win on an Instagram account and remakes them with our own AI hosts. Read `README.md` (what it
does), `HANDOFF.md` (state and priorities) and `lessons.md` first. Design history: `docs/superpowers/specs/`.

- Folder: `~/Dev/active/social-scraper`; GitHub: `kaantaskentt/social-scraper` (public). On Kaan's first Mac push with `git push private money-radar-build-1:main`; never push to any other
  remote there. On a fresh clone, `origin` is this repo.
- Start: `~/Dev/active/office/bin/social-scraper.sh` (loads APIFY_TOKEN from the office .env.local and TYPESAFE_API_KEY from
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
- Error log (2026-09-29): every error the app shows or hits in the background lands in `data/errors.jsonl` (grouped by
  id). `node scripts/errors.mjs open` lists the open ones; fix the root cause with a failing test first, commit, then
  `node scripts/errors.mjs fixed <id> "<commit>: <what>"` (or `notbug <id> "<why>"`, and add Kaan's part to
  ~/Dev/active/office/NEEDS.md). The scheduled task `fix-social-scraper-errors` does this every hour.
- Free re-edit of a made reel: `node scripts/re-edit.mjs <runId> <reelId> <source.mp4> <keep ranges> [--captions] [--no-hook]` (keeps the old reel as reel-before-*.mp4).
- Status, what is verified and what is not, and the next priorities: `HANDOFF.md`.
