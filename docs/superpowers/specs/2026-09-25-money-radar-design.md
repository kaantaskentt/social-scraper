# Money Radar: design (v3)

Date: 2026-09-25. Owner: Kaan. Status: v3 after two Codex (GPT-6 Astra) reviews. Build 1 (sections 3 to 5) is ready for Kaan's decision. Build 2 (section 6) is an outline with hard requirements; it gets its own spec and review before any code.
Research (all in `~/Dev/reference/research-library/raw/`): `2026-09-25-winner-score-lead-rate-methods.md`, `2026-09-25-templates-patterns-backtest.md`, `2026-09-25-account-discovery.md`, `2026-09-25-buzzabout.md`, `2026-09-25-what-social-researchers-want.md`, `2026-09-25-reel-collection-options.md`, `2026-09-25-content-intelligence-market.md`.

## 0. What changed after review
| Review finding | Change in v2 |
|---|---|
| B1 single snapshot is not backtest-safe | Observation time is a first-class field (3.1). Scores are named "vs its previous posts, as seen at scrape time". A real backtest needs dated snapshots: build 2 starts collecting them; build 3 must not claim a historical backtest from one snapshot (7). |
| B2 save coalescing can lose the Apify launch marker | Durable checkpoints vs deferred progress saves, serialized writes, crash tests (5.1). |
| B3 estimates do not enforce a ceiling | One guard for every paid launch; reserve the permitted maximum (the cap), persist it, reconcile later, fail closed (6.1). |
| M4 Gamma formula ignored Poisson noise | Shape/rate with tau^2 = s^2 - m * mean(1/e); complete pooling at the boundary; known-answer test (4.4). |
| M5 queue relied on an HTTP-level check | Exclusive scheduler inside the pipeline with a completion promise and durable queue (6.2). |
| M6 lead prior and threshold used future reels | Both causal, from the same earlier-reel window (4.4, 4.6). |
| M7 age and growth bias | Disclosed on screen; trend flag; trend-adjusted variant computed for validation only (4.3). |
| M8 exp(median(log(x+1))) shifts identical reels below normal | expm1/log1p, tolerance, flat and all-zero fixtures (4.3). |
| M9 derived values still change old displays | Versioned scoring manifest; old formula versions stay selectable (4.8). |
| M10 scale off by 10x (54 KB per reel) | Raw provider responses move to sidecar files; lazy loading; benchmarks (6.3). |
| M11 no contract with existing filters | Money population defined separately from speech eligibility and script dedupe; positive-value plays/views fallback (4.1, 4.2). |
| M12 cache migration boundary | Auto-detect is already the default (Kaan's runs chose English). Versioned transcript policy per run (5.2). |
| M13 keyword parser too loose | Strict CTA grammar, stoplist, channel (comment vs DM), evidence span, negative tests (4.5). |
| M14 "leads per day" invalid on one snapshot | Removed; cumulative comments and the publication window shown instead (4.7). |
| M15 discovery ranking unspecified | Explicit versioned ranking with coverage rules and adapters (6.4). |
| M16 backtest procedure in the research was invalid | Rules for build 3 recorded (7): chronological only, dev/final split, selection inside the null. |
| M17 integration points missing | Enumerated contracts and touched files (8). |
| M18 tests missed failure cases | Failure-case acceptance tests added (9). |

## 1. Goal
Turn the reel research app into Kaan's research operating system for short-form money machines: find accounts, measure which reels win reach and which win comments (leads, when a keyword CTA exists), explain why, and hand over what to make next. First for Kaan's own AI-made channel; later possibly sold (competitor decode reports, or a tool).

Success for this spec (builds 1 and 2):
- Every reel in a run shows x normal, a label, comment rate, keyword CTA and quadrant, or a named reason it has none.
- Kaan enters a seed account or hashtag, gets about 30 candidate accounts ranked with visible reasons, ticks some, and they are decoded one after another under one spending guard.
- Numbers match hand calculations on synthetic known-answer data and on ken.remedie (100 reels).
- Existing runs, caches and views keep working.
Build 3 (template families, patterns, validation, Make-this card) and build 4 (Ask) get their own specs.

## 2. Principles
1. Causal. A reel is judged only with reels published before it, and every parameter (baseline, prior, thresholds) comes from that earlier window. Appending newer reels never changes an older reel's result (tested).
2. Honest time. Publication time, observation time (when the counts were read) and age are separate. Imports without provenance get `observedAt = unknown` and no age-dependent score.
3. Derived and versioned. Metrics are pure functions of saved data, computed under a named formula version with its parameters. Old versions stay in the code and selectable, so history can be reproduced.
4. Named gaps. Missing counts, too new, short history, too few plays, pooled prior: each is a bucket with a reason, never a fake number.
5. Money is guarded. Every paid launch passes one guard that reserves the permitted maximum before launching.
6. Small changes to the original core, stated honestly. New logic in new files; the unavoidable core changes (checkpoints, cache policy, scheduler, storage) are listed in section 8 and treated as a deliberate divergence from the original.

## 3. Data concepts
### 3.1 Snapshot
A run is one snapshot of one account: `observedAt` = the Apify run's `finishedAt` for scraped runs, labelled as an approximation (a reel scrape runs for seconds to minutes, so every row was collected shortly before it). Dataset download time is never used: a late download adds no new observation. Imports without an Apify run record get `observedAt = unknown`. Stored alongside: `retrievedAt` (download time) for audit only. `ageDays(reel) = (observedAt - publishedAt) / 1 day`. Repeated runs of the same account are separate snapshots; cross-run identity is (account, reel id, observedAt).

## 4. Build 1a: money metrics (pure, no new cost)
Code: `public/money/1.0.mjs` (pure, shared by browser, server and tests), `public/money/index.mjs` (version registry). Served through the static allowlist (section 8).

### 4.1 Population
All reels of the run with a known reach, regardless of speech, transcript status, Jev labels or script duplicates. Presentation filters (topic, hook, dedupe) apply after metrics are computed, never before.

### 4.2 Reach
`reach = plays if plays > 0, else views if views > 0, else unknown` (Instagram unified plays and views in August 2024; Apify fills either). If both are positive and differ by more than 5%, flag `reach_disagree` and use plays; the flag is visible.

### 4.3 x normal
- Order the run's reels by `publishedAt`. For reel i, window B = up to 30 immediately earlier reels published within the previous 90 days, each with known reach and `ageDays >= 7`.
- Buckets: `unknown_observation` (no observedAt), `too_new` (reel i `ageDays < 7`), `short_history` (|B| < 10), `no_reach`.
- `baseline = expm1(median(log1p(reach_j)))`; `xNormal = reach_i / baseline`. Equality tolerance 1e-9 (a reel equal to baseline is exactly 1.0).
- Noise gate: `z = 0.6745 * (log1p(reach_i) - median log1p) / MAD`; MAD = 0 means z is undefined.
- Labels: `winner` if xNormal >= 2 and (z >= 1 or undefined); `big_winner` if also xNormal >= 5; `flop` if xNormal <= 0.5 and (z <= -1 or undefined); else `normal`. Thresholds are v1 starting points (on ken.remedie: 79 scored, 31 winners, 21 big winners).
- Wording on screen: "12x its previous posts (at scrape time)". Not "exceptional content".
- Age bias, disclosed: baseline reels are older than the target, so recent reels are understated. The reel panel shows its age and the window's median age.
- Growth: Theil-Sen slope (per day) of log1p(reach) against publish time within B, using only pairs with different publish times; needs at least 5 distinct timestamps, else no growth flag. If `expm1(30 * slope)` exceeds +50% or is below -33%, show "account growing/shrinking fast: x normal is inflated/deflated".
- Validation-only variant (not shown, build 3 decides): `intercept = median_j(log1p(reach_j) - slope * t_j)`, `projected_i = expm1(intercept + slope * t_i)`, `xExpected = reach_i / projected_i`; undefined when the slope is undefined or `projected_i <= 0`.

### 4.4 Comment rate (lead rate when a keyword CTA exists)
- Exposure `e = reach / 1000`; count `c = comments` (missing comments: `no_comments`, no rate).
- Prior from window B only (same earlier reels, those with known comments): rates `r_j = c_j / e_j`, `m = mean(r_j)`, `s2 = sample variance(r_j)`, `tau2 = s2 - m * mean(1 / e_j)`.
- If |B with comments| < 10: `short_history`. If `tau2 <= 0` or m = 0: complete pooling, `rate = m`, flag `pooled`; the screen says "not enough variation in earlier reels: shows the account's typical rate, not this reel's own". Else Gamma shape/rate `alpha = m^2 / tau2`, `beta = m / tau2`, and `rate = (alpha + c) / (beta + e)`. `mean(1/e)` is the mean of inverse exposures, never `1/mean(e)`.
- No rate below 1,000 reach: `too_few_plays`.
- Known answers: m = 10, s2 = 12, e = 1 for all j gives tau2 = 2, alpha = 50, beta = 5; a target with c = 20, e = 1 gets 70/6 = 11.666667.
- Name on screen: "comment rate"; with a keyword CTA: "comment rate, keyword CTA present". Comments are not proven leads.

### 4.5 Keyword CTA
- Grammar (case-insensitive verbs; token boundaries on both sides): `(comment|type|reply|write) + [the word] + TOKEN` and `(dm|message|send) + me + [the word] + TOKEN`, where TOKEN is either quoted (straight or curly quotes) or written in capitals in the original caption, 2 to 20 letters or digits.
- Stoplist for unquoted capitals: YOUR, YOU, THE, OF, BELOW, THIS, THAT, ME, IT, A, AN, AND, OR, TO, FOR, IN, ON, WITH, DOWN, HERE.
- Imperative only: the verb must start a sentence or clause (start of caption, after `.!?…`, a line break, an emoji, a dash, or after the whole words "just", "please", "or", "and"). "Comment the STATE you live in" (an open answer) is a comment CTA without a fixed keyword, so no keyword. Checked on ken.remedie: 99 of 100 captions parsed; the one left is that open-answer CTA. Negated forms are skipped: "don't", "do not", "never", "no need to" within the 3 tokens before the verb.
- Keep every match with channel (`comment` or `dm`) and the evidence text. Primary keyword = first comment-channel match, else first DM match.
- Tests: 30 real ken.remedie captions (all positive), negatives ("Comment your thoughts", "type of business", "comment below", "Don't comment GUIDE", "people keep asking me to comment LIME"), overlong tokens, emoji, Unicode quotes, multiple CTAs, a DM-only CTA.

### 4.6 Quadrant
- Reach high if xNormal >= 1 (tolerance).
- Comment threshold = median of the raw rates `c_j / e_j` of window-B reels that have known comments and reach >= 1,000; needs at least 10 such reels, else `insufficient` (`short_history`). The target uses its section-4.4 rate. High if the target rate is strictly greater than the threshold (tolerance); a threshold of 0 with a target rate of 0 is low.
- Star, Billboard (reach high, comments low), Closer (reach low, comments high), Dud. Otherwise `insufficient` with the bucket reason.
- Causal by construction, so adding newer reels never changes it.

### 4.7 Account summary
Reels scored, median reach, winners and big winners, share of reels with a keyword CTA, top keywords by total comments, cumulative comments on scored reels with the publication window (first to last date), reels per week, growth flag. No per-day lead claim from one snapshot.

### 4.8 Versioned scoring manifest
`score(run, version)` returns results plus `{formula: 'money-1.0', params, runId, observedAt, inputHash}`. Every released implementation is an immutable file (`public/money/1.0.mjs`, `1.1.mjs`, ...); a bug fix is a new file, never an edit, so any past result can be replayed exactly. The manifest of what was last shown per run is persisted in `data/scores/<runId>.json` (a rebuildable record, not a source of truth). The UI shows the version and lets Kaan pick older ones. Test: replay after both a minor and a patch release reproduces the old output byte for byte.

### 4.9 Where it shows
- Reel panel: x normal with age, label, comment rate, keyword with evidence, quadrant, or the reason.
- A "Money" view per run: the 2x2 with thumbnails, the account summary, lists of Stars, Billboards, Closers, and a "how this is measured" page.
- UI built by Codex GPT-6 Astra from a brief listing the files it may touch; Claude inspects screenshots before Kaan sees it.

## 5. Build 1b: pipeline hardening
### 5.1 Checkpoints and progress saves
- `save(job, {durable})`. Durable saves write immediately and are awaited: before an Apify launch (with `scrapeUncertain = true`), right after recording the Apify run id, on every status transition (paused, failed, partial, complete, interrupted), and on errors.
- Progress saves (per-reel status) are coalesced to at most one write per second per run; the clone happens at write time, not per call.
- Transcription and Jev calls are not bracketed by durable saves, by design (decided after the build-1 code review): their results are written to their own cache files the moment they succeed, so a crash re-runs only the calls in flight (at most `concurrency` calls, pennies each). A durable run-file write per reel would cost about 2,000 full-file writes on a 1,000-reel run. The Apify launch, which is expensive and not repeatable, is bracketed. Per-reel worker errors are progress saves too: a crash loses at most one second of error text, and the reel is retried on resume.
- All writes of a run go through one serialized chain; a later durable write can never be overwritten by an older scheduled snapshot (monotonic sequence number checked before rename).
- Crash tests: kill between launch and id record (restart must refuse to relaunch and ask for attach), kill during coalesced progress (restart loses at most one second of progress, never a checkpoint), final-write failure surfaces an error.

### 5.2 Transcript cache policy
- Auto-detect is already the default; Kaan's runs selected English. The defect is the cache key `transcript-<id>`.
- Each run stores `transcriptPolicy = {version: 2, language: '' | 'xx', provider, model}`. Policy 2 key: `transcript-v2-<id>-<language or auto>-<provider>-<model>`. Runs without a policy are policy 1 and keep reading the old key. Policy 2 runs never read policy 1 keys. No cache file is deleted.
- Re-doing Slush'D = a new run with auto-detect. No policy-2 auto cache exists for those reels yet, so every transcript is fresh (about $0.05 of Apify plus pennies). Later auto-detect runs of the same reels correctly reuse that policy-2 cache. Imported rows with embedded transcripts keep them (source `import`), shown as such.

## 6. Build 2 outline: guard, scheduler, storage, discovery (own spec and review before code)
Hard requirements from the second review, to be designed in that spec:
- Guard: keep every reservation counted until the provider's cycle usage demonstrably includes it; when inclusion is unknown, count conservatively (over-counting is allowed, under-counting never). Record provider account id, billing-cycle boundaries, search id and job link per reservation; block launches while identity is unresolved. One app process per data directory, enforced with an OS lock file; the reserved cap is bound to the actual launch request.
- Scheduler: persist `pausing`, poll the remote Apify run to a terminal status before releasing exclusivity or the reservation; the run file is the single source of truth and queue state is derived from it on restart; `whenDone` rejects on persistence failure; define how partial runs map to queue states and whether resume processes partial results.
- Storage: immutable raw objects per stage, attempt and schema version, referenced from the run only after a verified write; restartable compaction that cannot replace a concurrently updated run; summaries are rebuildable caches keyed to a run generation hash, with detection and repair of missing or stale ones; browser refresh sends run deltas, not the full run.
- Discovery: finite positive followers required, otherwise that signal is missing (never infinite); binary definitions for every signal; deterministic author order before the cap (by seed rank, then handle); final tie-break by handle; an adapter-backed Reel indicator instead of assuming every Video is a Reel.

### 6.1 Spending guard (all paid launches, including manual runs)
- `data/ledger.json`: reservations `{id, actor, capUsd, createdAt, apifyRunId?, status: reserved|launched|reconciled|uncertain, actualUsd?}`, written atomically.
- Before launch: under an in-process mutex, `committed = reported cycle usage (Apify API) + sum over unreconciled reservations of max(capUsd, reported run cost if known)`. Refuse if `committed + newCap > ceiling` (default ceiling $4.50 on the $5 free plan; configurable). If cycle usage cannot be read, refuse (fail closed).
- The reservation is persisted before the HTTP launch. After launch, record the Apify run id (durable). After the run ends, reconcile with the run's `usageTotalUsd`. Uncertain launches stay counted at their cap until attached or reconciled by Kaan.
- A discovery search has one total budget split across its stages; each stage's cap comes out of it.

### 6.2 Scheduler
- `Scheduler` owns execution: one active run at a time, enforced inside it (not in the HTTP handler), `enqueue(runIds)`, and `whenDone(runId)` that resolves after the final durable save.
- Durable `data/queue.json` with states queued, running, paused, done, failed. On restart, a running item becomes paused; nothing auto-resumes.
- Pausing during scraping aborts the remote Apify run through the API and reconciles its cost; if abort fails, the reservation stays counted.
- The existing run button goes through the scheduler.

### 6.3 Storage for scale (measured: about 54 KB per reel, 5.4 MB per 100-reel run)
- Move `transcript.raw` and `analysis.raw` (about 18 KB per reel) to sidecar files `data/raw/<runId>/<postId>.json`, written once. Migration is lazy and additive: old run files keep working; new runs write sidecars; a one-time compaction for old runs writes sidecars first and rewrites the run file only after the sidecars are verified. `data/` is copied to a dated backup before the first compaction.
- Startup reads a small summary per run (`data/runs/<id>.summary.json`); full runs load on demand.
- Raw-row lookup at startup uses a Map, not repeated `find`.
- Benchmarks (acceptance): a synthetic 1,000-reel run and 100 runs; startup and first paint of one run each under 2 s on Kaan's Mac; memory for 100 idle runs under 300 MB.

### 6.4 Discovery (free plan)
- Adapters pin actor id, input options and record the actor build: lookalikes `memo23/instagram-similar-profiles-scraper` (cap 30 results), hashtag `apify/instagram-hashtag-scraper` (cap 100 posts), enrichment `apify/instagram-profile-scraper`.
- Authors are deduplicated and filtered (not already known, not private) before the enrichment cap of 30 profiles.
- Reel eligibility for ranking: latestPosts of type Video with known reach; fewer than 3 eligible videos means "thin sample", listed separately.
- Ranking `discover-v1` (shown with reasons, weights in one config file): keyword CTA share x min(n, 6)/6 (weight 3); commerce bio-link host such as stan.store, linktr.ee, beacons, skool, whop, or an own domain with a checkout path (weight 2); AI-performer tag in bio or captions (weight 1); affiliate mention (weight 1); log10 of median reach per follower, clipped to [-2, 1] and rescaled to [0, 1] (weight 1). Ties by followers. v1 weights are a heuristic; Kaan's ticks are saved to tune them later.
- Tests: mixed formats (carousels, images), missing plays, private or empty accounts, partial paid results, duplicate authors across seeds.

### 6.5 Snapshots for build 3
Optional weekly re-scrape of up to 5 watched accounts (about $0.26 per 100 reels each), through the guard. These dated snapshots are what a real historical backtest needs.

## 7. Rules recorded for build 3 (its own spec)
- A historical backtest requires outcomes observed before the cutoff (dated snapshots) and an outcome horizon; with one snapshot, only a labelled "retrospective check" is allowed.
- Chronological splits only; never shuffle which reels are test reels. Templates, preprocessing and thresholds are fitted inside the training period.
- Separate development data from a final untouched evaluation period. Winner thresholds are tuned on development only.
- Null procedures must include the full pattern-selection step and respect time and template groups; compare paired improvement against "random" and "repeat the last winner" baselines.
- Planted-pattern and null-dataset tests before any real use.

## 8. Integration contracts and touched files
New: `public/money/1.0.mjs`, `public/money/index.mjs`, `lib/guard.mjs`, `lib/scheduler.mjs`, `lib/storage.mjs`, `lib/discover.mjs`, `lib/signals.mjs`, `lib/projects.mjs`, tests and fixtures (real raw rows, no keys).
Changed core files and why:
- `server.mjs`: static allowlist entries for `/money/*.mjs`; project, discovery, queue and ledger routes; run button routed through the scheduler.
- `lib/pipeline.mjs`: durable vs progress saves; transcript policy; observedAt; guard call before `startScrape`; scheduler hooks; sidecar raw writes; lazy loading.
- `lib/providers.mjs`: Apify run abort; usage read for the guard.
- `lib/data.mjs`: keep `scrapedAt` as import time but add `observedAt`.
- `public/app.js`, `public/index.html`: Money view mount, reel panel fields, version picker.
HTTP and import contract tests cover each route and the static serving of the money modules.

## 9. Tests (write first; they fail before the code exists)
Metrics: hand-computed synthetic account (xNormal, z, labels); flat account gives exactly 1.0 and "normal"; all-zero comments; future-append invariance (appending newer reels leaves every older result identical); age fixture (same underlying performance at 7 and 40 days, documented bias); cadence fixture (daily vs weekly posting); growth fixture triggers the trend flag; Gamma known answer (alpha 50, beta 5); unequal exposures; complete pooling; with fixed finite positive alpha and beta, the rate converges to the raw rate as exposure grows (tolerance), and the pooled branch is tested separately (it ignores the target's own counts by design); plays/views fallback and disagreement flag; population includes silent and duplicate-script reels.
Keyword: positives, negatives, channels, evidence (section 4.5).
Pipeline: crash injection at each durable checkpoint; coalescing bounds; monotonic writes; transcript policy isolation both ways.
Guard: concurrent reservations cannot both pass; unknown usage fails closed; uncertain launches stay counted; reconciliation without double counting; a discovery search never exceeds its total budget.
Scheduler: exclusivity, completion promise, restart turns running into paused, pause aborts the remote actor.
Storage: sidecar migration verified before rewrite; backup exists; old run files still load; benchmarks in 6.3.
Discovery: ranking on fixtures; thin samples separated; dedupe; partial results.
End to end: the existing import -> transcribe -> classify test still passes; a new test runs import -> metrics -> Money view data -> HTTP payload.
Real data: ken.remedie 100 reels matches the hand analysis (top reels, keyword counts, rates), and Kaan spot-checks 10 reels.

## 10. Case against
- Paid tools already rank outliers. None measure comments against keyword CTAs, read funnels or validate their patterns; that is the gap.
- The statistics add complexity. The screen shows one plain number per reel; the rest lives behind "how this is measured" and in tests.
- Build 1b and 6.3 change core files. Accepted: the scale and safety problems are real.
- Free plan limits discovery to small searches; the real value needs Apify Starter ($19/month). Kaan's decision; the code is the same.
- This serves an experiment, not 1% Session (priority 1). Kaan chose it; a competitor-decode report is the bridge back to paying clients.

## 11. Pre-mortem (three months later it failed; why?)
| Failure | Guard |
|---|---|
| Recent reels look like flops | too_new under 7 days; age shown; bias disclosed |
| Growth accounts show everything as winners | wording "vs its previous posts"; growth flag; trend-adjusted variant validated in build 3 |
| Numbers shift when new reels arrive | causal window for every parameter; future-append invariance test |
| A formula change rewrites history | versioned formulas and manifest; old versions kept |
| Wrong transcripts come back | per-run transcript policy; policy 2 never reads policy 1 keys |
| A crash launches a second paid scrape | durable checkpoints around the launch; crash tests; attach flow |
| Surprise Apify bill | one guard, reservations at the cap, fail closed, reconciliation |
| Two runs at once | scheduler-level exclusivity |
| App slows or runs out of memory at 100 accounts | sidecars, lazy loading, summaries, benchmarks as acceptance |
| Ordinary captions become lead signals | strict CTA grammar and negative tests |
| Discovery ranks thin accounts first | coverage factor and thin-sample list |
| A retrospective check sold as proof | build-3 rules in section 7 |
| Data loss during migration | backup copy, sidecars verified before rewrite, no deletion |
| Copying the playbook copies dodgy health claims | Make-this card (build 3) flags health claims |
