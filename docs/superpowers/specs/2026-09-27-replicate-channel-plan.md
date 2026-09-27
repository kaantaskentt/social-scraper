# Replicate a channel: plan (draft for Kaan's yes, 2026-09-27)

## The idea in one line
Scan a channel, read its Secret, and with a few multiple-choice clicks get an original AI channel in the same style:
a character, a set, a voice, a style guide, topic ideas, and finished reels ready to post.

## The picture

```
 1 FIND            2 UNDERSTAND          3 PLAN THE CHANNEL           4 MAKE                 5 READY TO POST
 accounts or   →   Secret (done)     →   AI picks, you confirm:   →  kit first, then     →  video + caption +
 a niche           + audience read        who · look · set · voice     1 pilot reel, then     hashtags, approved
                                          · topics · format            the next ones          by you (publishing later)
```

## One smooth flow in the app (short pages, choices not walls of text)
The top of the app becomes the flow: **Find · Understand · Make · Ready to post**. Explorer and Money move inside
Understand as "details". Make has three doors: Film it yourself (shot list, built), Recreate with your product
(built), **New channel like this** (this plan).

"New channel like this" is a wizard of one screen per decision. Each screen shows the AI's pick first, with one
line of why (from the Secret, with counts), 2-3 alternatives as cards, and the cost before anything is spent:
1. **Format**: keep a duo, go to one presenter, or faceless hands + voiceover. The AI recommends from the Secret and
   from what AI video can do reliably (two people talking is the weakest spot of current models).
2. **Character**: 3 generated face options to pick from, then the full character sheet (face, 3/4, back, full body,
   hands, outfit) on one image, so later shots do not drift. Options: new AI character (default), a Higgsfield
   preset avatar, your own face (Soul ID, only yours, with consent), or no face.
3. **Set**: 2 kitchen (or matching) plates: a master angle and a reverse angle, same light.
4. **Voice**: 3 voice samples from Higgsfield's 114 voices (or your own custom voice).
5. **Topics**: 10 reel ideas in the winners' structure (step by step, starts mid-action, "do this and watch"),
   no health claims presented as fact; you tick 3.
6. **Make**: the pilot reel first, with its cost; then the rest.

## Phases and costs

| Phase | What you get | Cost (estimate) | Needs |
|---|---|---|---|
| A. Channel blueprint | The wizard's text picks: format, character brief, set brief, voice brief, style guide, 10 topic ideas, audience read | cents (Gemini, Jev) | nothing new |
| B. Kit | 3 face options, character sheet, outfit sheet, 2 set plates, 3 voice samples | about 20-60 credits | current balance (120.77) is enough |
| C. Pilot reel | 1 finished reel: 3-4 shots (Seedance 2.0 with the sheet and plates as references, voice lines as audio), stitched, captions and end card | about 150-250 credits | a Higgsfield top-up |
| D. Reels 2-3, library | 2 more reels, a "Ready to post" library with caption and hashtags | about 300-500 credits | top-up |
| E. Later | many accounts in a queue, auto-publish via an API (Planable or Meta's API), audience deep-dive | separate plan | separate decision |

Every paid step shows `higgsfield generate cost` first and needs a click. Costs above come from documented numbers and
our own runs (a 13 s Seedance 2.5 recreation was 91 credits); real costs are checked before spending.

## How it works under the hood
- **Blueprint (A):** Gemini Pro writes the briefs from the Secret; Jev picks between options (format, which topic
  ideas fit the winners' pattern) and checks every script: no health claim stated as fact, one clear action, starts
  mid-action. Audience read: the scan's comments summarised by theme (aggregate only, no profiles of individuals).
- **Kit (B):** GPT Image 2 six-panel character sheet on a grey background (the Higgsfield prompting guide's
  recommended method), Nano Banana Pro if it looks flat; Soul Location for empty sets; voices from the voice list.
- **Reels (C/D):** per shot, Seedance 2.0 with the character sheet and set plate as image references; dialogue shots
  3-8 s with one speaking face and the voice line as audio (the guide's lip-sync rules); silent demo shots as b-roll.
  Stitching with ffmpeg (reusing higgsfield-producer's fix.sh ideas); captions and the "comment a word" card with the
  Remotion project in capcut-toolkit (local ffmpeg cannot burn captions). Quality check with frame sheets before you see it.
- **Ready to post:** mp4, caption, hashtags, and the Secret's checklist ticked (starts mid-action, steps, one ask).

## Rules from the research library (checked 2026-09-27)
- **Judge every reel on Instagram's two gates** (strong, platform fact): does it stop the scroll in 3 seconds, and
  does it hold. Before posting: a frame check of the first 3 seconds and Higgsfield's Virality Predictor as a rough
  proxy. After posting: scan our own account and compare with the Secret (the learning loop).
- **AI disclosure** (ai-content-trust, moderate): use AI for production, turn on Instagram's AI label, and never give
  the character an invented life story ("I tried this and it changed my life").
- **One clear emotion per reel** (emotion-sharing, moderate), and **fear only with one clear action**
  (fear-needs-efficacy, strong). The script checker enforces both.
- **Captions must be accurate** (captions-comprehension, moderate): from the script, not guessed.
- **Finding similar accounts later** (apify-login-only-fields): a no-login actor, tested small first; public data only.

## Case against
- **Money:** 3 finished reels are about 10 times the current balance. If the pilot looks fake, that spend is lost.
  The phase order exists so you only pay for C after seeing B.
- **AI presenters lower trust** for health and advice content (research library: ai-content-trust, moderate), and
  Ken's appeal is two real people. An AI copy may get the format but not the trust. Faceless hands + voiceover may
  fit AI better than a fake duo.
- **Health content is risky:** Ken's own claims are questionable; copying the genre invites misinformation and Meta's
  health rules. Our scripts avoid claims stated as fact, which also removes part of what makes the genre work.
- **Originality:** Instagram demotes reposts and near-copies; we copy the formula, not the reels, but a very close
  style may still read as a copy.
- **You could do phase A by hand** in an hour with the Secret open; the app only pays off if you run it on many channels.

## Pre-mortem (it is 3 months later and this failed; why?)
- The character drifted between shots and every reel needed 5+ retakes, so each reel cost 400+ credits.
- Lip-sync looked off and viewers scrolled in the first second.
- The channel got flagged for health misinformation or as AI spam.
- The wizard asked too many questions; you stopped using it after one channel.
- Captions and assembly stayed manual in CapCut, so "one click" became an afternoon per reel.
Mitigations built into the plan: pilot before batch, one speaking face per shot, faceless option, a script checker
for claims, AI picks by default (you only confirm), and assembly automated with Remotion.

## What I need from Kaan
1. Yes to phases A and B now (no top-up needed).
2. A decision on the Higgsfield top-up before phase C (about 250 credits for the pilot).
