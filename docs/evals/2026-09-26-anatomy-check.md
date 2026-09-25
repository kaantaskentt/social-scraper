# Script-part (anatomy) label check, 2026-09-26

Question: are Jev's script-part labels (hook, setup, problem, example, advice, payoff, cta, other) accurate enough to show?
Method: 60 parts from ken.remedie (100-reel run), sampled deterministically with up to 8 per Jev role. A Claude Sonnet
annotator labelled each part blind (full transcript + the part + the same role definitions Jev gets; Jev's answers hidden).
Neither annotator is ground truth; Kaan reviews the disagreements.

| Result | Agreement |
|---|---|
| All parts | 47 / 60 (78%) |
| Jev confidence >= 0.65 | 35 / 37 (95%) |
| Jev confidence < 0.65 | 12 / 23 (52%) |
| By Jev role | problem 7/8, hook 6/8, cta 8/8, advice 6/8, example 7/8, payoff 6/8, setup 6/8, other 1/3, unclear 0/1 |

Across the whole run, 563 of 1,691 parts (33%) have Jev confidence below 0.65.

Findings
- Jev's confidence is informative: confident labels agree 95% of the time, unsure ones about half. The UI fades parts below 0.65.
- Most disagreements are sentence fragments (e.g. "Pura Vida Moringa delivers pure," / "nutrient-dense, green superfood power."): the
  transcriber's segments split sentences, so a part often carries half a thought.
- Next improvement to test: merge transcript segments into whole sentences before labelling (new anatomy schema version; re-labelling
  costs about $0.03 per 100 reels with Jev), then repeat this check on the same 60 parts.

Files: sample key, blind labels and comparison are reproducible from the run with the sampling rule above (scratch copies were not kept in
the repo because they contain creator transcripts).
