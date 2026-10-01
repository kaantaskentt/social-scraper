# Handoff: Social Scraper, to the agent on Kaan's new Mac mini

From: Claude (Opus 5.5) on Kaan's first Mac, 2026-09-30.
To: you, the agent on the new Mac mini.

Man, I need you to up this project big time. Kaan got it somewhere real, but it is not 100% right yet, and it is not
yet useful in the only way that counts: reels that get real views on a real account. Read this whole file, then
`CLAUDE.md` and `lessons.md` in this folder, then run it, then make it better. Be honest with Kaan about what works and
what does not. He hates made-up facts and fake tests more than he hates bad news.

---

## 1. What this is, in one picture

```
Scan an Instagram account ──► Winners ──► Look ──► Copy ──► Ready to post
 (Apify + Groq + Jev)        (plays,     (our AI    (Veo 3.1 Fast   (video, cover,
  100 reels, ~1 to 7 min)     x usual)    hosts,     or Gemini Omni: caption, one
                                          place)     their winners,  download)
                                                     our hosts)
```

- Kaan types an account. The app collects its reels, listens to them, and finds the winners (reels that got many
  times the account's usual plays).
- It builds "our look": AI hosts and a place in that account's style.
- It **copies** the winning reels shot by shot with our hosts, and checks each copy against the original.
- Kaan posts the good ones himself. Nothing here posts, sends or pays on its own.

Why it exists: Kaan's experiment "can agents run a full business?" A channel that finds proven winning formats and
makes its own versions, then sells a program. Money comes first for Kaan (his 1% Session workshops pay the bills), so
this project must earn its place by producing reels that perform.

Stack: plain Node (22.9 or newer), ES modules, **no npm dependencies at the root**, no build step. Remotion (in
`render/`) edits the final video. Everything runs locally on 127.0.0.1:5190.

---

## 2. Get it running on the new Mac

1. **Tools:** Node 22.9+ (24 LTS is fine), git, `gh`, ffmpeg (Homebrew: `brew install node ffmpeg gh`).
2. **Code:** `gh auth login` with Kaan's GitHub, then
   `gh repo clone kaantaskentt/social-scraper ~/Dev/active/social-scraper` (default branch `main`).
   On a fresh clone the remote is `origin` = kaantaskentt/social-scraper; push your work there and nowhere else.
3. **Video editor:** `cd render && npm ci` (Remotion downloads its headless Chrome on the first render).
4. **Keys:** create `.env` in the project folder (it is gitignored). Names only here; Kaan gives you the values through
   a secure channel, never in chat, never in a file that is committed, never printed. Check a key by its length.
   ```
   TRANSCRIPTION_PROVIDER=groq
   GROQ_API_KEY=          # transcripts (free plan: 20 a minute, 2,000 a day)
   APIFY_TOKEN=           # collecting reels (about $0.25 per 100 reels)
   TYPESAFE_API_KEY=      # Jev, TypeSafe's judgment model (typed yes/no, scores, choices)
   GEMINI_API_KEY=        # video (Veo 3.1 Fast, Gemini Omni), pictures, watching and checking videos
   ANTHROPIC_API_KEY=     # optional: Claude as a second opinion on finished reels
   ```
   On the first Mac these live in `~/Dev/active/office/.env.local` and `~/Dev/active/JEV/.env.local` and are loaded by
   `~/Dev/active/office/bin/social-scraper.sh`. On a new Mac, the local `.env` is simpler.
5. **Check:** `npm run doctor` (Node, ffmpeg, and the Apify, Jev and transcription keys; it does not check
   `GEMINI_API_KEY`, which the Look and Copy steps need), then `npm test` (about 500 tests, about 5 seconds, all with fakes,
   no paid calls) and `npm run check`.
6. **Start:** `npm start`, open http://localhost:5190. The research view (older, denser) is at `/lab`.
7. **Data:** `data/` is NOT in git (private, about 5 GB: scans, videos, looks, copies, spend logs, the error log). A fresh
   Mac starts empty. To bring Kaan's history over, copy the folder from the first Mac (for example
   `rsync -a firstmac:~/Dev/active/social-scraper/data/ ~/Dev/active/social-scraper/data/`) while neither app runs.
   Ask Kaan which Mac is the main one: two machines writing the same data or pushing the same branch will collide.

---

## 3. Where things are

| Part | File |
|---|---|
| Server, all routes | `server.mjs` |
| Scan pipeline (Apify, transcripts, Jev labels), winners-first order, resume after restart | `lib/pipeline.mjs`, `lib/providers.mjs` |
| Winner scores ("x their usual") | `public/money/1.0.mjs` (frozen formula; changes go in a new version file) |
| "Why do these win?" (the Secret) | `lib/secret-run.mjs`, `lib/secret.mjs` |
| The Look (hosts, place, pictures, checks) | `lib/kit.mjs`, `lib/kit-run.mjs` |
| Copy studio (picker, batches, comparison) | `lib/copy.mjs`, `lib/copy-run.mjs` |
| Video makers (Omni parts, Veo segments, chains, checks, edit) | `lib/reel-make.mjs`, `lib/kit-reel.mjs`, `lib/veo.mjs`, `lib/gemini-jobs.mjs` |
| Prep ahead (after a scan, readies Look and Copy, about $0.30) | `lib/prep.mjs` |
| Error log (every error, grouped) | `lib/errors.mjs`, `scripts/errors.mjs`, `data/errors.jsonl` |
| Screens | `public/flow.html`, `flow.js`, `flow-views.mjs`, `copy-view.mjs`, `scan-map.mjs`, `flow.css` |
| Spend so far against Kaan's $70 test budget | `node scripts/budget.mjs` |
| Exams for the checkers (paid, cents) | `scripts/qa-eval.mjs`, `scripts/fidelity-eval.mjs`, `scripts/checker-eval.mjs`, `scripts/pairwise-test.mjs` |

Money safety is built in and must stay: every paid job is saved before waiting, a lost reply is never resent, parts are
checked before the next one is paid for, a price is confirmed before spending, and there is a spend ceiling per job.

---

## 4. Honest state (2026-09-30)

**Works, verified with real runs:**
- Scan of a new account: winners visible at about 75 s, full scan about 7 min on Groq's free plan (the cap), prep
  ahead ready about 1 min later (@saywaybrand, through the real screens).
- Picker suggests the most-played winners, skips ads for their own product and boosted reels. For @natural.solutions.us
  it went from two 60K-play picks to 14.3M, 2.0M and 1.6M-play reels.
- A Look end to end ($0.43 for @saywaybrand). A Veo copy end to end (about 2 minutes, $0.80 for an 8 s clip).
- Visual copies (reels over a song, like printed-shirt reels): the printed line is drawn into the first frame and
  checked word by word, so the text is exact now (Veo garbles text it writes itself).
- UI redesign (one type scale, New analysis sheet, one "next" button per step), with Kaan's prism-gradient brand kept.

**Not right yet (this is your list):**
- **Copy fidelity is below the bar.** A copy counts as "faithful" at 75/100 plus conditions. @saywaybrand's best visual
  copy is 70 (three attempts plateaued at 70: the judge now picks at camera motion; Veo zooms and sometimes drops details
  like a cap mid-clip). Ken's spoken copies show 78 in the app; an earlier Omni chicken copy scored 69 under the
  stricter comparison.
- **Unverified with real money:** Veo chains longer than 8 s (extensions, and new chains past 148 s), Omni chains past
  40 s, and the Look drawing 3 pictures at once. All pass tests with fakes only.
- **No real results yet, to my knowledge.** Nothing has been posted and measured. The app can track real plays after
  posting (Ready step, "Track real results"), but it has no data. Until then, every quality score is a proxy.
- **The judges are weak.** A single-reel "will this win?" judge was a coin flip (AUC 43 to 53% on 209 reels). Pairwise
  "which of two did better?" is better: 72% (Ken), 75% (natural), 58% (drzen). Claude as a checker flipped verdicts on
  5 of 10 reels across runs, so it is advice only.
- **Speed:** transcription is capped by Groq's free plan. Kaan has to upgrade (same price per minute of audio).
- **Cost:** video is about 82% of all spend. A cheaper model (Wan 2.6 reference-to-video Flash, $0.05/s, about half of
  Veo Fast) is shortlisted but untested; it needs an Alibaba Cloud Model Studio account from Kaan.
- **Budget:** $57.65 of the $70 test budget spent (`node scripts/budget.mjs`). Ask Kaan before any new spend.

---

## 5. What "up this project big time" means (my recommendation, argue with it)

1. **Close the loop with real data.** Help Kaan post the best copies on a real account and track real plays. Then use
   real results, not our judges, to decide what to copy and how. This is the single biggest gap.
2. **Get copies past 75 reliably.** Measure first (`scripts/fidelity-eval.mjs`, k=3), then fix the biggest gap. Verify a
   real multi-segment Veo copy once (a 20 to 40 s winner) before trusting long copies.
3. **Test the cheaper model honestly.** Same original, Veo Fast vs Wan 2.6 Flash, scored by the fidelity checker and by
   Kaan's eye. Only add it if it is at least as faithful.
4. **Make it faster and calmer to use.** Every wait should show something real (the copy tiles already play each filmed
   part as it arrives). Kill anything that makes Kaan scroll or guess.
5. **Keep the error loop alive.** Every error goes to `data/errors.jsonl`. `node scripts/errors.mjs open` lists them.
   Fix root causes with a failing test first, then `node scripts/errors.mjs fixed <id> "<commit>: <what>"`. On the first
   Mac a scheduled Claude task does this hourly; if the new Mac becomes the main one, recreate it there.

---

## 6. How to work with Kaan (his rules; the first Mac has them in ~/.claude/CLAUDE.md)

- Start every reply with "Kaan,". Plain words a 10 year old could follow. Picture first (a small diagram), then short
  bullets. No em dashes. No flattery, no filler. He dictates, so expect typos.
- Push back when he is wrong. Report honestly: failed tests with output, skipped steps named, "I did not verify this".
- No made-up facts: every number from a source or a tool you ran; memory claims labelled "from memory, not checked".
- **Hard stops, ask first every time:** spending money (beyond a run he started himself), deleting or overwriting
  files, force-pushing, anything sent or posted in his name, anything hard to undo. Stop servers by process id, never by
  name. Never regex-edit env files. Never print keys.
- Tests: logic gets unit tests, each critical flow one end-to-end test, a bug gets a failing test first. Root causes
  only, no fallbacks that hide failure. Small conventional commits, ending with a `Co-Authored-By` line.
- Never restart the app while a scan or copy runs (check the API first). Never run `git stash` inside a command that
  may time out (see `lessons.md`).
- UI: quality over quantity, one screen at a time, judged from a screenshot. Keep the prism gradient logo, the prism
  current-step dot and the winner badges; Kaan likes them.
- When blocked on Kaan, write it down for him in one plain line; ask one simple question with options.

Good luck. Make it earn money.
