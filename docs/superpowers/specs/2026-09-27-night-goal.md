# Tonight's goal (2026-09-27 → 28)

**Vision:** put in an Instagram account, see simply why it wins, and get finished AI reels in that style, ready to post,
with almost no typing. First use: Kaan's own faceless channels.

**Goal for tonight:** a clean app at `/` that walks through five steps with one clear "Next" each, and that Kaan can
operate end to end without getting lost:

```
 1 Scan  →  2 Winners  →  3 Secret  →  4 Make  →  5 Ready to post
```

Jev decided what matters (scores 0-3, 2026-09-27): guided steps 2.98, make flow 2.91, simple Secret 2.71, library 2.51.
Off the main path (kept at `/lab` for research): thumbnail wall, patterns table, Money boxes, shot list, recreate with
product, voice picker (1.17), niche finder (1.31) and auto-publish (1.01) later.

## Done means
- Every step works on real data (Ken's scan), checked in a real browser at desktop and phone width: no errors, no
  overflow, no dead ends, no floating text.
- The Secret reads like a 10-year-old could follow it: 3 things that work (each with the reels that prove it, side by
  side, and the counts as dots, not numbers soup), 1 thing to avoid, and a "did we get it right?" check.
- Make: ideas → script and exact price → make with a confirm → live progress → the video. Real credits only with a
  confirm showing the price and the balance.
- Ready to post: every finished reel with play, download and copy caption.
- Tests for all logic; one end-to-end browser pass of the whole flow; a real reel already made (celery pilot).

## Check-ins
After each step is built: run it in the browser, compare with this file, and write one line in the log below.

## Log
- 22:50 Pilot reel made for real (76 credits incl. one wasted retry from a bad check; fixed). Jev ranked features.
- 23:25 New five-step app at `/` built and walked through on Ken's real data (desktop + phone, no errors, no overflow).
  Fixed from the walk: dots wrapping, jargon headline (now "Show a surprising food test and solve the problem right
  away."), plain sentence per label, stale price (auto re-price, free), made ideas marked with their video, preview
  frame on finished reels, one card per account. Old research app moved to `/lab`. 255 tests pass.
  Next: Secret on a second, different account (nudeproject) to prove it generalises; scan flow end to end; e2e script.
- 01:20 Channel kit (brand memory) built: study 3 winners → Jev picks the format → kit written → Nano Banana 2 draws
  host face, every angle, full outfit, place, a reel frame → Gemini checks each (brief, same person, no text, not the
  real creator) → Kit step at /. Real kits: Ken ($0.57) and nudeproject ($0.60), all pictures pass, checked by eye.
  Fixed from looking: text in scenes (signature "words" kept out of pictures), unsent-reference answers ignored, "AI"
  leaking into looks, outfits without colours. First Omni Flash test clip from the kit: same faces, script spoken word
  for word, native sound, 10 s for $1.03; flaw: tripod in view (prompt fixed). Higgsfield credits are out; Gemini covers
  pictures and video. 281 tests pass. Next: make reels from the kit with Omni (ideas and script per format, clips,
  captions, render).
- 02:05 Reels from the kit, end to end in the browser on Ken: New hosts (Felix and Stella, $0.57) → Use this look →
  ideas (Jev rejected 5 of 6 "real vs fake food" myths; ideas now must state why they are true; next batch: egg float,
  saffron, yeast, baking powder) → script passed all checks first try → Make ($2.15) → Omni part 1 + extension part 2,
  each checked (brief, same hosts, no text or logos, no gear) → captions from the real audio → 22.5 s reel, AI
  disclosed in the caption. Price was quoted $2.08 but part 2 costs more (it re-reads part 1): now priced from the
  measured cost ($2.17). Safe job runner: Google job id saved before waiting, resumed after a restart, never paid twice.
  297 tests pass.
