# Lessons

- 2026-09-25: Two Astra reviews of the design found 3 blockers (backtest leakage from single snapshots, save coalescing vs the Apify launch marker, estimate-based budget guards). Review designs that touch money or stored data before building.
- 2026-09-25: Run files are about 54 KB per reel (raw provider responses); measure before estimating scale.
- 2026-09-25: The transcript cache key ignores language; a run set to English kept wrong Turkish transcripts.
- 2026-09-25: Validate parsers on real data before freezing a formula version: 2 of 100 real captions exposed misses ("Or comment", "…comment") that synthetic tests did not.
- 2026-09-25: A test comparing two missing values (undefined === undefined) passed trivially; assert types, not just equality.
- 2026-09-25: Not every paid call needs a durable checkpoint: cached, cheap, repeatable calls do not; the expensive non-repeatable launch does.
- 2026-09-25: My own UI brief had the quadrant arrows swapped; the final Codex review caught it. Check chart axes against box positions, not just labels.
- 2026-09-25: I told Kaan I fixed a double-charge risk that upstream already guarded (my own test passed on the original code). Never claim a risk existed before without checking the original code; say "kept X working" when that is what happened.
- 2026-09-26: Whisper transcribes song lyrics as speech; 13 of 21 song reels were labelled as scripts. Instagram's musicInfo marks the song, but some song reels carry a real voiceover (Slush'D), so a blanket skip would be wrong: a Jev yes/no on lyrics scored 27/27 on real reels.
- 2026-09-26: A fix can create its own bug: caching empty transcripts made every silent reel a "duplicate" of the others. Run a second review on the fix diff, not just the first on the original code.
- 2026-09-27: A new page module missing from the server's file list broke every tab, and all unit tests passed. tests/server-assets.test.mjs now fetches every module app.js imports; a real-browser pass is still the last check before calling UI work done.
- 2026-09-27: I suspected the cut detector was wrong; a contact sheet proved it right for hard cuts but blind to jump cuts in the same room. Check a measurement against the frames by eye before "fixing" it, and again after.
- 2026-09-28: A stricter quality rule looked right on the weak reel and would have failed the 99% winner too. Run any new check on a known-good reel before adopting it; a still frame cannot show bubbling, so do not call a payoff missed from stills alone.
- 2026-09-28: Our reel judge scored reels consistently but picked winners at a coin flip on all 3 channels (43-53%, 209 reels). Test any scorer against real views before showing its number; a score that looks precise is not a prediction.
- 2026-09-28: Rules written from one channel (Ken's "result up close") blocked every script of another (drzen teaches form, 70 of 90 reels have no result). Rules about format come from each channel's own data, never from the channel we built on first.
- 2026-09-28: Gemini missed a cut-off voice line that code caught by comparing the transcript with the script. Anything checkable against the script is checked by code, not by asking a model.
