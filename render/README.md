# Reel renderer

Remotion project that turns clips + a voiceover into a finished 9:16 reel: word-timed captions (spoken word
highlighted), an optional hook title, music ducked under the voice, and an end card. Driven by `lib/render-reel.mjs`.

- Install once: `cd render && npm install`
- Prove the pipeline without buying footage: `npm run render:dummy` (from the repo root; needs GROQ_API_KEY for word timings)
- Assets are copied into `render/public/jobs/<id>/` for one render and removed afterwards.
