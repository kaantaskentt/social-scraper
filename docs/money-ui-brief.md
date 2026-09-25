# Money view: UI brief (for Codex / GPT-6 Astra)

Kaan uses Creator Lab to decode Instagram accounts that make money with short videos (for example an account whose captions say "Comment LIME and I'll send you the recipe"). The numbers are already computed; you build how they look. Read `docs/superpowers/specs/2026-09-25-money-radar-design.md` section 4 for what each number means. Kaan is a visual thinker: one glance should tell him which reels to copy.

## Files you may create or change
- `public/app.js`, `public/index.html`, `public/styles.css`
- new `public/money-view.mjs` (pure render helpers: data in, HTML string or DOM out; importable by Node tests)
- new `tests/money-view.test.mjs` (`node:test`, no browser)
- `server.mjs`: add exactly one entry to the static `files` map for `/money-view.mjs`. Nothing else in `server.mjs`.

## Files you must NOT touch
Everything else, including `public/money/*` (frozen formulas), `lib/*`, other tests, `data/`, `docs/`, `package.json`, `CLAUDE.md`, `lessons.md`. Do not commit. Do not delete anything. Do not run paid APIs (no real analysis runs).

## Data
`GET /api/runs/<runId>/money` (optional `?version=`) returns:
- `manifest`: `{formula, params, runId, observedAt, observedAtSource ('run'|'apify_finishedAt'|'unknown'), inputHash}`
- `versions`: list of formula ids (today only `money-1.0`)
- `summary`: `{reels, reelsWithReach, reelsScored, medianReach, winners, bigWinners, flops, quadrants:{star,billboard,closer,dud,insufficient}, ctaShare, topKeywords:[{keyword,reels,comments}], cumulativeComments, firstPublishedAt, lastPublishedAt, reelsPerWeek, growth ('growing'|'shrinking'|null)}`
- `results`: object keyed by reel id: `{id, publishedAt, reach, reachDisagree, ageDays, comments, keyword, keywordChannel ('comment'|'dm'|null), keywordEvidence, keywordMatches, bucket, xNormal, z, label ('big_winner'|'winner'|'normal'|'flop'|null), baseline, windowSize, windowMedianAgeDays, growth {flag,...}|null, rate, rateKind ('shrunk'|'pooled'|null), rateBucket, threshold, quadrant ('star'|'billboard'|'closer'|'dud'|'insufficient'), quadrantReason}`
Thumbnails: the existing `/media/<runId>/<postId>` route. Reel links: the run's `posts[].url`.
The demo run (`id: 'demo'`, synthetic) has no money data: show "Run a real analysis to see money metrics." and never call the route for it.

## 1. Reel panel ("Under the frame" inspector): add a Money block
Show for the selected reel:
- **x its previous posts**: e.g. "12.1x its previous posts" with a small line "at scrape time · 16 days old · compared with 30 earlier reels (median age 40 days)". Label chip: Big winner / Winner / Normal / Flop.
- **Comment rate**: "8.8 comments per 1,000 plays". If `keyword` exists: say "comment rate, keyword CTA present". If `rateKind==='pooled'`: add "not enough variation in earlier reels: this is the account's typical rate, not this reel's own".
- **Keyword**: the keyword in a pill, the channel ("comment" or "DM"), and the evidence text in quotes, small.
- **Box**: Star / Billboard / Closer / Dud with a one-line meaning (see below).
- When there is a `bucket` or `quadrantReason`, show the plain reason instead of numbers:
  - `too_new`: "Under 7 days old: still collecting plays."
  - `short_history`: "Needs at least 10 earlier reels to compare with. Pull more reels (30 or more)."
  - `too_few_plays`: "Under 1,000 plays: too few to judge comments."
  - `no_reach`: "Plays are missing for this reel."
  - `no_comments`: "Comment count is missing."
  - `unknown_observation`: "Imported without a scrape time, so age can't be judged."
  - `no_date`: "Publish date is missing."
- If `growth.flag==='growing'`: a quiet warning "This account is growing fast, so x numbers run high." (`shrinking`: "...shrinking fast, so x numbers run low.")

## 2. A new "Money" view for the current run
Add it next to the existing explorer (a tab or a section switch; follow the page's existing patterns). Contents, top to bottom:
1. **Summary line of tiles** (reuse the stats tile style): Reels scored (of total), Winners (big winners), Keyword CTA on X% of reels, Reels per week. Under it one quiet line: "Counts as of <observedAt date> · formula money-1.0". If `reelsScored===0`: a clear note "No reel has enough history yet. Pull 30 or more reels to get scores."
2. **The four boxes** as a 2x2 grid of thumbnails (click a thumbnail = select that reel in the existing inspector):
   - Star (top right): "Lots of views and lots of comments. Copy these."
   - Billboard (top left): "Lots of views, fewer comments. Good for growth."
   - Closer (bottom right): "Fewer views, lots of comments. Good for sales."
   - Dud (bottom left): "Neither. Skip."
   Axis hints: "more views than its previous posts ↑" (top row = more views) and "more comments than usual →" (right column = more comments). (Corrected after the final review: the first version of this brief had the arrows swapped.) Keep the order exactly: top row Billboard | Star, bottom row Dud | Closer. Within each box sort by `xNormal` descending. Show at most 12 per box with "+N more". A small count per box. Reels with `insufficient` are listed below the grid in a collapsed "Not scored (N)" row with their reasons grouped.
3. **Top keywords**: a compact table: keyword, reels, total comments (sorted as given).
4. **"How this is measured"** (collapsed by default), plain words:
   - "x its previous posts = this reel's plays divided by the typical plays of up to 30 earlier reels from the last 90 days. Only earlier reels count, so new reels never change old numbers."
   - "Reels under 7 days old are not scored: plays are still coming in. Older reels had more time to collect plays, so recent reels look a bit weaker than they are."
   - "Winner = at least 2x and clearly above the account's usual ups and downs. Big winner = at least 5x. Flop = half or less."
   - "Comment rate = comments per 1,000 plays, gently pulled toward the account's usual rate so small numbers don't mislead. A comment is not a sale."
   - "Keyword = the word a caption asks people to comment or DM (for example Comment LIME). Captions that ask for an open answer have no keyword."
   - "Boxes: views compared with the reel's previous posts; comments compared with the usual rate of those same earlier reels."
   - Show the formula id and observed-at time.
5. Version picker only if `versions.length > 1` (today it is hidden).

## Design
Match the existing Creator Lab look (fonts, colors, spacing, tiles, thumbnail style) exactly; the Money view must feel native, not bolted on. Use the four box names with subtle color accents consistent with the palette. Numbers use tabular figures. No external requests. Keyboard: every thumbnail is focusable and selectable with Enter; focus visible. Respect `prefers-reduced-motion`. Must look right at 1440x900 and 1024x768 with no horizontal overflow.

## Behavior
- Fetch the money report when a real run is loaded or finishes updating (debounce: at most once every 2 seconds while a run is live). Failure shows a small error line with the message, never a blank area.
- Escape all text from data (captions, evidence, keywords) before inserting into HTML.
- Do not change existing features or their defaults.

## Acceptance checks (Claude will verify each)
1. `npm test` passes, including your new `tests/money-view.test.mjs` (render helpers: reasons text for every bucket, box order, escaping of a caption containing `<script>`, empty/zero-scored state).
2. `npm run check` passes (add `public/money-view.mjs` to the `check` script only if you can do it without editing `package.json`: you can't, so leave `check` alone).
3. With the ken.remedie 100-reel run, the Money view shows 79 scored of 100, 31 winners (21 big), keyword CTA on 99% of reels, and the 2x2 with 29 / 21 / 15 / 14 reels (star / billboard / closer / dud), 21 not scored.
4. Selecting a reel from a box updates the inspector's Money block; numbers equal the API values.
5. Demo mode shows the "Run a real analysis" message and makes no money request.
6. Screenshots at 1440x900 and 1024x768 look native and uncluttered, with no overflow.
7. List every file you created or changed, test output, and anything you could not verify (your sandbox may block ports or a browser; say so).
