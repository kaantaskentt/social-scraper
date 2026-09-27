# Channel Secret (approved by Kaan, 2026-09-27)

Plan page: https://claude.ai/artifact/16kUBHAoREf7cT5ZThKpVk. First test: @ken.remedie (run a444f915…).

One page per scanned channel that explains why it wins, with proof. Everything later (chat, replicate, client briefs)
reads this page, so it is built first and alone.

## Pipeline

1. **Pick** (code, free): 15 best and 15 weakest scored reels by "× normal" that have a saved video
   (`pickReels`). Fewer scored reels: split what exists in half; under 4 per side, refuse.
2. **Watch** (Gemini `gemini-3.8-flash`, whole mp4 with sound, inline base64, JSON schema output, thinking low):
   plain descriptions of person, setting, format, opening, shots, on-screen text, sound, style. Cached per reel.
3. **Label** (Jev, one request per reel): fixed options for presenter, look, setting, format, sound, on-screen text,
   opening. Pace (seconds per shot) and length come from our own ffmpeg cuts, not a model.
4. **Compare** (code, free): house style = a value in at least 70% of all picked reels; a difference = a value whose
   count in winners and flops differs by at least max(3, a quarter of a side). Smaller gaps are not shown.
5. **Write** (Gemini `gemini-3.1-pro-preview`): the page as JSON, from the counts and descriptions only. Every claim
   lists reel ids as evidence; code drops any evidence id that was not picked and any claim left without evidence.

## Money

Prices (Google's pricing page, read 2026-09-27, paid tier, content not used to improve products): 3.8 Flash $0.75 in /
$3.75 out per 1M tokens until 2026-12-31 (doubles 2027-01-01); 3.1 Pro $2 / $12 (prompts up to 200k). Video is about
100 tokens per second. The app shows an estimate and needs a click before any paid call; the actual cost is recorded.

## Acceptance (the $100 bet)

- Kaan's 5 blind points on Ken are covered, plus at least one he missed; no wrong facts on the reels he watched.
- Every claim links to playable reels; every winners-vs-flops claim shows its counts.
- Two runs give the same main points. Ken under $1 and under 10 minutes.

## Not in this build

Chat, replicate button, competitor or niche finder, Meta Ad Library.
