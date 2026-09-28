# Winner DNA: replicate what actually wins, on evidence

Kaan, 2026-09-28: "Copying the script doesn't only work... the mini details, the cheat code: glasses or not, does it
start with a story, is there a second person... research this properly, I don't want guessing."
Evidence: research library playbook `short-video-replication` (four reports, 28 new findings, 2026-09-28).

## What the evidence says we must respect
- Hits are partly luck, and the best pre-post models explain about half of popularity (popularity-partly-unpredictable,
  prediction-ceiling-before-posting). We rank reels; we never promise virality.
- The creator's size and history predict as much as content; most generic structure rules vanish once account size is
  controlled (creator-history-dominates). So every detail is judged against the creator's own normal (our xNormal),
  never across creators, and the result is "true for this channel", not a law.
- A rule counts only if it predicts held-out reels better than the creator's own average (validate-predictor-holdout).
- Replicate as "familiar with a twist": the winning core plus one clear difference (familiar-with-a-twist).
- Real early reactions after posting beat any pre-post model (early-engagement-predicts).

## The plan
1. Measure all ~100 reels of a channel (not only 15 v 15) on about 35 details, in one Gemini watch per reel with its
   transcript (about $0.012 each, $1.20 a channel), plus details code can measure itself (length, cuts, first words):
   - Host: how many, gender mix, age band, glasses, facial hair, styling and polish, expression in the first frame,
     gaze (camera or action), who speaks first, reactions.
   - Opening: what fills the first second, face or action first, hook type (result first, question, instruction, story).
   - Structure: story arc or list or steps, number of payoffs, payoff shown up close, humor, emotion, twist at the end.
   - Sound and look: voice style, music, real sounds, text on screen, sensation level (cuts, motion, sound, text).
2. Test each detail against xNormal across all reels (rank correlation with a bootstrap interval). Show only details
   whose interval clears zero, with their n; everything else is labelled "no evidence either way".
3. Validate: five-fold hold-out. Score each unseen reel by how many winning details it has; Spearman against its real
   xNormal, compared with the baseline "creator average". The Secret page says plainly whether this channel's wins are
   predictable from its details ("DNA found, rho 0.3") or look like luck and timing ("copy the format only").
4. Use it:
   - Ideas and scripts: Jev checks each validated detail on the script; the critic ranks scripts by DNA match before any
     money is spent, shown as higher or lower odds, never as a view forecast.
   - Hosts: the look and persona take the validated host details (for example glasses, two hosts, reactor role).
   - Every script names its one twist (what is different from the winners).
5. Persona: each host gets 3 personality traits, a way of talking, a role in the duo, and stable opinions, taken from
   the validated host details and the audience; never a fake life story (ai-content-trust), never breaks character
   (parasocial-similarity-meta).
6. Audience audit: read the comments of the top 10 winners (public, through the scan) for who they are, what they ask
   and why they watch; shown as a hypothesis with the number of comments behind it (comment-audience-is-a-hint). Hosts
   are made to resemble that audience (similarity-attraction).
7. First frame: every host look and every reel's first frame is checked on a still for "friendly and trustworthy at a
   glance" (first-impression-100ms), because the cover and first second set trust.
8. After posting: judge our reels on Instagram's own signals, retention and likes and sends per reach, not raw views
   (instagram-reels-signals); scan our own account at day 1, 3 and 7; compare reels at the same age (engagement-keeps-growing);
   early winners get more variants (early-engagement-predicts).

## Case against
- 100 reels is a small sample. Most details will not clear the bar, and the ones that do may be noise even with an
  interval; the 2026 study of 10,000 brand TikToks found most structure variables unrelated to success. We may spend
  the work and learn "mostly luck" for many channels. That is still worth knowing, but the headline may disappoint.
- xNormal itself is noisy (timing, trends, the algorithm), so even a real detail will only shift odds a little.
- Gemini judging subtle details (polish, expression, gaze) can be inconsistent; each label needs a spot check on a
  sample by eye before we trust it.
- Comments come from a few vocal viewers; the audience audit can mislead, and scraping comments costs more and sits in
  the platform's grey zone (social-data playbook).
- The simplest alternative is to skip Winner DNA and just post many variants and learn from our own early data. The
  evidence says early data is the strongest signal; Winner DNA only sets better starting odds.

## Pre-mortem (it is three months later and Winner DNA failed; why?)
1. It "found" details that were noise: with 100 reels and 35 details, a few pass by chance, we built hosts and scripts
   around them, and posting results did not move. Guard: bootstrap intervals, the hold-out test against the creator
   average, and a correction for testing many details at once; anything that fails hold-out is shown as "no evidence".
2. Gemini's labels were unreliable (glasses or gaze mislabelled), so the statistics were computed on wrong data.
   Guard: spot check 10 reels per channel by eye before the result is shown, and drop any detail with poor agreement.
3. We trusted the pre-post score over real results and kept making reels the critic liked but viewers skipped. Guard:
   once our own reels have plays, early real engagement outranks the critic in every decision (early-engagement-predicts).

## Done means
- Winner DNA for Ken, drzenphd and natural.solutions.us, with the validation result shown for each, including "no
  signal" where that is the truth.
- A spot check by eye of 10 reels' labels per channel.
- Tests for the statistics (rank correlation, bootstrap, hold-out) on synthetic data with a known answer.
