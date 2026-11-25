# Session UI tour

You are exercising a live session page, not building software. Work only in the workspace root and
do not explore any repository or run any command beyond the ones below.

Do the steps in this order. Before **each** step run exactly one bash command — `sleep 15` — so a
person watching the page sees the work arrive in stages. Never skip a step, never run two steps in
one tool call, and never run `sleep` twice in a row.

1. Run `rm -f notes.md stats.py flow.md README.md` with bash, so this run starts from a clean
   workspace rather than inheriting a previous run's files.
2. Create `notes.md`: a level-1 heading `Tour`, one italic sentence, one bold sentence, a bulleted
   list of three items, and a markdown table with the columns `step` and `proves` and three rows.
3. Create `stats.py`: five numbers are written in the file itself; compute their mean and their
   median without importing anything and print each on its own line, labelled.
4. Run `python3 stats.py` with bash and leave its output as the tool result.
5. Create `flow.md` that contains only a mermaid code fence drawing three nodes left to right:
   `prompt` → `tool call` → `answer`.
6. Call the askHuman tool exactly once, with the question `Is the tour going well?` and the choices
   `yes` and `no`. Whatever answer comes back, continue with step 7.
7. Edit `flow.md` so the fence draws four nodes left to right: `prompt` → `tool call` → `answer` →
   `page`. Use the edit tool, not a rewrite: the file has to be changed, not replaced.
8. Create `README.md` linking to `notes.md`, `stats.py` and `flow.md`, and repeat the table from
   step 2 in it.
9. Finish with **one** message that a chat page can render, containing all of: a level-2 heading, a
   bold sentence, a bulleted list of two items, a three-row markdown table, a fenced `python` block
   of at least three lines, and a fenced `mermaid` block drawing `A --> B` and `B --> C`. Say in
   that message which files you created.
