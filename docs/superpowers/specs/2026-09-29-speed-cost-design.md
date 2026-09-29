# Speed, cost and design (2026-09-29)

Approved by Kaan in chat, order fixed: speed, then cost, then design.

## Facts this rests on (measured 2026-09-29)
- Scan speed: 100 reels need ~5 min of transcription at Groq's free-plan cap (20/min, 2,000/day, read from Groq's
  x-ratelimit headers). The @liangsvitality scan also lost 9 min because I restarted the server mid-scan.
- Spend: video is $73.78 of $90.32 (82%). $14.84 of $62.32 video went into reels that never finished (24%).
- Design: flow.css uses 18 font sizes and 4 weights; the Ready card carries 12+ lines and 5 buttons.

## 1. Speed
- Winners are shown as soon as Apify returns (they are view-based); transcription order puts winners (top xNormal)
  and the weakest first, the rest after. The Look can start once the winners are transcribed.
- Scan size is chosen: 30 / 60 / 100 reels, each with its time and price.
- Restart safety: on start, the server resumes scans that were running when it stopped (their money is already
  approved; only Groq/Jev calls remain).
- Groq paid plan: Kaan's click; the pacer reads the real limit from Groq's headers instead of a fixed 20/min.

## 2. Cost
- Bake-off, real calls only: one Ken copy on Wan 2.6 R2V Flash ($0.05/s) and Wan 3.0 (~$0.07/s promo) against the
  Veo 3.1 Fast copy, scored by the fidelity checker (k=3) and by Kaan. Needs an Alibaba Cloud Model Studio key.
- A new engine is added only if it is at least as faithful as Veo Fast on the checker and Kaan agrees.
- Waste: default to one engine (the cheapest faithful one), not "Both"; stop a copy when a part fails its check.

## 3. Design
- One type scale (5 sizes, 2 weights), no uppercase labels.
- "New analysis" button opens a small panel: account + reel count + Start.
- One account on screen; a switcher in the header; each step ends with one Next button.
- Ready card: video, caption, one download; details behind "Why".
- Codex (GPT-6 Astra) builds from a brief; if Codex does not run, Claude builds it. Claude checks every screen from
  screenshots at 1440 px and 390 px.
