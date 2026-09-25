# Creator Lab (Kaan's fork)

Fork of github.com/artemnovitckii/creator-lab (MIT), remote `upstream`. Being extended into "Money Radar": see
`docs/superpowers/specs/2026-09-25-money-radar-design.md`. Read `lessons.md` too.

- Start: `~/Dev/active/office/bin/creator-lab.sh` (loads APIFY_TOKEN from the office .env.local and TYPESAFE_API_KEY from
  JEV's .env.local; picks Fireworks or Groq by which key exists). Or `npm start` with a local `.env`. Serves 127.0.0.1:5190.
- Test: `npm test` (mocked providers, no paid calls). Syntax check: `npm run check`. Setup check: `npm run doctor`.
- No build step, no dependencies. Deploy: none (local only).
- `data/` holds runs, caches and media: private, gitignored. Back it up (copy) before any storage migration.
- Paid calls (Apify, Groq/Fireworks, Jev) only after Kaan's yes for new spend beyond a run he starts himself.
