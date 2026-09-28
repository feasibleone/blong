# Realm Eval Harness (MVP)

Formal, repeatable measure of how well the Blong instructions + skills produce a working realm.

## Files

- `prompt.md` — canonical realm-creation task (deterministic, full realm).
- `rubric.json` — weighted checklist: 16 machine checks (sum 70) + 3 semantic judge items (sum 30).
  Total 0–100.
- `run.mjs` — standalone Node runner (scores an output dir, estimates tokens, writes `runs/`).
- `runs/` — per-run `run-N/metrics.json` + `results.csv` trend log.

## How to run (one eval run)

1. Open a **fresh agent session** against the instructions version under test (e.g. `current` or
   `optimized`).
2. Paste the contents of `prompt.md` as the single user message. The agent implements the realm.
3. Record the session transcript (chat log) for token accounting.
4. After the agent finishes, copy its produced realm files to a known directory (or keep the
   workspace) and score:

```bash
node run.mjs --output <realm-dir> \
  --label baseline-1 --version current \
  --semantic 8,7,9 \
  --transcript /path/to/transcript.log
```

For the semantic judge items, have a reviewer (or a second pass) assign 0–10 for
`intent-match, would-run, completeness` — either via `--semantic a,b,c` or a `judge.json` file
(`{"intent-match": 8, "would-run": 7, "completeness": 9}`) placed inside the realm output dir.

## Token metric (MVP)

The local session store exposes **no token counts** (verified), so the MVP estimates tokens as
`transcript chars / 4`. Pass `--tokens <file>` with `{"input": n, "output": n}` when real counts are
available (e.g. from platform telemetry) — those take precedence. Store raw chars alongside the
estimate for later recalibration.

## Protocol

- **Baseline**: run 2× against the CURRENT instructions → `runs/run-N/metrics.json` (before any
  optimization edits).
- **Measure**: re-run the SAME prompt + rubric against the OPTIMIZED instructions.
- **Pass**: optimized `total ≥ baseline total` AND `tokens ≤ baseline tokens` (both must hold).
  Delta is logged in `results.csv`; if the gate fails, revisit the pilot rewrites before rollout.

## Roadmap

- v2: add the existing multi-case corpus
  (`.github/skills/{blong-core,blong-schema}/evals/evals.json`)
- realm variants; weighted rubric; automated LLM-judge scoring; with/without-skill matrix.
- v3: CI regression gate comparing PR runs against the stored baseline; add correction-turn count
  and actual test-run (tap/hot-reload) pass metrics.
