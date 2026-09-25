# UI brief 2: clickable script parts, saved videos, cleaner page (for Codex / GPT-6 Astra)

Kaan tested the Money view and wants: fewer useless buttons, clearer clickable things, "+N more" that opens, and script parts he can click to jump to that moment in the reel. Match the existing Creator Lab look exactly. Read `public/app.js`, `public/index.html`, `public/styles.css`, `public/money-view.mjs` first and follow their patterns.

## Files you may create or change
`public/app.js`, `public/index.html`, `public/styles.css`, `public/money-view.mjs`, `tests/money-view.test.mjs`, new `public/anatomy-view.mjs` (pure helpers, importable by Node tests), new `tests/anatomy-view.test.mjs`, and exactly one entry in the static `files` map in `server.mjs` for `/anatomy-view.mjs`.
## Files you must NOT touch
Everything else: `lib/*`, `public/money/*`, other tests, `data/`, `docs/`, `package.json`, `CLAUDE.md`, `lessons.md`, the rest of `server.mjs`. Do not commit, delete files, or call paid APIs.

## 1. Demo tools menu
Move "Portrait view", "Focus demo", "Recording studio ↗" and "Replay analysis" into one small "Demo tools" menu (a disclosure button with a popover or `<details>`), placed where "Portrait view"/"Focus demo" are now. Each keeps working exactly as before. Keyboard: opens with Enter/Space, closes with Escape, focus returns to the menu button.

## 2. Money view polish
- "+N more" becomes a real button: clicking it shows all reels in that box and changes to "Show fewer". State per box survives live refreshes.
- Thumbnails: clear hover, focus and selected states (a visible ring, slight lift), pointer cursor.
- "Not scored (N)" and "How this is measured" look like buttons (bordered, pointer, a chevron that rotates when open), still `<details>`.

## 3. Script anatomy: click a part to play it
Data per reel: `post.analysis.anatomy = [{start, end, text, value (role), confidence}]` (start/end in seconds or null).
- Every part is clickable: the thin colored bar segments AND the text rows below (make rows real buttons or give them button semantics with keyboard support).
- Click: open the player if it is closed, set `currentTime` to the part's `start`, and play. Parts with `start === null` show "No timing for this part" and do not seek.
- While the video plays, highlight the part whose `[start, end)` contains the current time, in both the bar and the list (karaoke). Keep the highlighted row visible inside the inspector (scroll within the panel only, never jump the page; no smooth scrolling when `prefers-reduced-motion`).
- Parts Jev is unsure about (`confidence < 0.65`) look faded with a "?" after the role name; hovering or focusing shows "Jev is 56% sure". Confident parts look as now.
- Pure helpers in `public/anatomy-view.mjs`: `segmentAt(anatomy, seconds)` (index or -1; exact boundary goes to the later part; gaps between parts return -1), `isUncertain(part)`, and the row HTML with escaping.

## 4. Play from saved videos
- `GET /api/runs/<runId>/videos` returns `{saved: [reelId...], bytes, total, saving, progress: {saved, failed, total}|null, lastResult, error}`.
- The player uses `/videos/<runId>/<reelId>` when that reel is in `saved` (it supports seeking), otherwise the reel's `videoUrl` as today. If playback fails, keep the existing toast.
- Refresh the video info when a real run loads, and every 3 s while `saving` is true; stop polling otherwise. Demo run: no video requests.

## 5. Saved videos line
A quiet line in the run area (near the pipeline status tile): "Videos saved on this Mac: 99 of 100 · 690 MB" with a "Delete saved videos" button. While saving: "Saving videos… 34 of 100". Clicking delete asks `confirm("Delete 99 saved videos (690 MB) from this Mac? Scores, transcripts and labels stay. Reels will then play from Instagram while their links last.")`; on yes, `POST /api/runs/<runId>/videos/delete` (same token header as other POSTs), then refresh the line. A 409 response shows its error message. If some are missing and saving is not running, show "Save missing videos" (`POST .../videos/save`).

## Acceptance (Claude will verify)
1. `npm test` passes, including new tests for `segmentAt` (inside, boundaries, gaps, null starts, empty), `isUncertain`, row escaping of `<script>`, "+N more" expansion render, and the demo-mode no-request rule where testable.
2. In the browser with the ken.remedie 100-reel run: clicking a script row plays the saved video from that second; the highlight follows playback; uncertain rows are faded with "?".
3. "+N more" expands and collapses; Demo tools menu works by mouse and keyboard; delete flow asks first and leaves scores intact.
4. Demo mode unchanged and makes no money or video requests.
5. 1440x900 and 1024x768: no overflow, looks native.
6. List every file changed, test output, and what you could not verify.
