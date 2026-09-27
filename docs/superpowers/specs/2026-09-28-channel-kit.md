# Channel kit (brand memory)

Kaan, 2026-09-27: "if I want to generate that exact kind of account, I'm able to generate my character... building that
brand memory... through these references... make consistently the right videos... the system is smart enough to adapt
[doctor giving advice, car crashes, stretching animations with ASMR]... cost-efficient... not forcing the human to make
too many decisions."

## The flow

```
Secret ─► 1 Study   Gemini watches 3 of the best reels: person, place, camera, light, colours, sounds, ASMR moments
        ─► 2 Decide  Jev picks the format: AI host · hands only · no person (visuals + sound) · animated
        ─► 3 Write   Gemini Pro writes the kit: character, outfit, voice, place, 2-3 signature things, do and don't
        ─► 4 Draw    Nano Banana 2 draws the references in order (face → side → full body → in the set);
                     each one is checked by Gemini: matches the brief, same person as the face, no text,
                     not a look-alike of the real creator. One retry each.
        ─► 5 Save    data/channels/<run>/kit/ (kit.json + images). The Make step uses these as references.
```

Kaan's choices: "Use this kit", "New character", and an optional one-tap format switch. Nothing else to type.

## Models and prices (Google pricing page, read 2026-09-28, paid tier)
| Job | Model | Price |
|---|---|---|
| Watch the reels | gemini-3.8-flash | $0.75 in / $3.75 out per 1M tokens |
| Write the kit | gemini-3.1-pro-preview | $2 / $12 per 1M tokens |
| Draw the references | gemini-3.1-flash-image (Nano Banana 2) | $0.067 per 1K image; keeps up to 4 characters consistent from references |
| Video, phase 2 | gemini-omni-1.1-flash | about $0.10 per second of 720p; takes image references; native sound |
| Cheaper video | veo-3.1-lite | $0.05 per second at 720p |

Higgsfield credits are used up; the Gemini key covers pictures and video.

## Rules from the research library
- expertise-small-effect (strong): never borrow a doctor look we do not have. If the winners look like doctors or experts,
  the host looks knowledgeable and tidy, with no white coat, stethoscope, badge or title.
- distinctive-assets (strong): the kit names 2 or 3 signature things repeated in every reel.
- ai-content-trust (moderate): the AI host is openly an AI host; no invented life story.
- parasocial-closeness (moderate): a recurring host who talks to the viewer is a trust lever, not a proven cause.
- Likeness: the character is a new, different person, never a copy of the real creator (checked on a winner's frame).
- No ethnicity or skin colour in any description we write (same rule as the Secret).

## Case against
- An AI host can look uncanny or generic, and people may trust it less than a real face. The hands-only and no-person
  formats stay available, and Jev picks the format from what the winners actually do.
- Voice consistency across reels on Omni is unknown: Omni takes no audio references. The kit fixes a written voice
  description; phase 2 must test two clips side by side before promising a consistent voice.
- The Interactions API is new; everything goes through one module (lib/gemini-media.mjs) so a change is one fix.
- Copying a channel's format closely can drift into copying the creator. The likeness check and the "new person" rule
  guard the face; ideas stay original (existing rule).

## Pre-mortem (it spends money)
- Runaway spend: a kit has a hard ceiling ($1.50), every call goes to the ledger, and each picture is retried at most once.
- Bad pictures pass: Gemini checks each against its brief and the face, and Kaan sees every picture before using the kit.
- Wrong format: one-tap switch rewrites the kit from the saved study (only the writing and the pictures are paid again).

## Done means
- Real kits for @ken.remedie and @nudeproject (different formats), looked at by eye, checks recorded.
- Tests for the logic (format, prompts, checks, ceiling, ledger, routes, view).
- The Kit step works in the browser at desktop and phone width.
