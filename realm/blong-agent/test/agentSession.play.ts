/**
 * `agent.session` — the page a person reads a session on (`@@T-801`).
 *
 * Three things a tap suite cannot show: that the realm's browser layer reaches the portal's menu at
 * all, that the list draws rows from `agent.session.find`, and that a transcript of every kind — a
 * call that opened, reasoning, a tool card with its arguments and result, markdown with a table, a
 * mermaid diagram and two code blocks — renders as a page rather than as text.
 *
 * The conversation is not a fixture in the browser, and the spec seeds nothing: the `playwright`
 * intent lists `test.agent.ui` in the watcher, so the server writes a session and its events at boot
 * through the same two handlers an engine uses. In this intent telemetry goes to the memory ring, so
 * the page reads a stream with no broker anywhere in the run (`@@D-988`, `@@D-1008`).
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({
    blongPermissions: true,
    // Tall enough that the whole transcript is in the picture: a screenshot of an element that
    // scrolls would show the top of the page and claim it showed every kind of output.
    viewport: {width: 1280, height: 1600},
});

test('the list and the transcript of a session', async ({portal}) => {
    await portal.menuClick('agent.session');
    const list = portal.page.locator('[data-view="list"]');
    await expect(list).toBeVisible();

    // A row is what the seed writes: the list answers with every session the database holds, and
    // the seeded one is the newest, so it is the first row.
    const row = list.locator('tr[data-session]').first();
    await expect(row).toBeVisible({timeout: 30_000});
    await expect(row).toContainText('Render the session');
    // The header is asserted by its columns rather than snapshotted, and the row is snapshotted
    // rather than the table: every run of this spec seeds a conversation, so the table grows a row
    // each time and a snapshot of the whole list would fail for a reason nothing is wrong with.
    for (const column of ['title', 'status', 'worker', 'turns', 'tokens', 'activity'])
        await expect(list.locator('thead')).toContainText(column);
    // The row itself is asserted, not snapshotted: a one-line table row is a few pixels tall, and a
    // screenshot of it flaked on a single pixel of height between runs (a comparison that fails on
    // size before it compares anything). What the snapshot is for is the transcript, below.

    await row.click();
    await expect(portal.page.locator('[data-view="session"]')).toBeVisible();
    // The page wrapper carries `data-view`; the stream state and the counts are the view's own.
    const view = portal.page.locator('.agent-session-view');

    // The header starts from the projection the row carries, so the folded summary is on the page
    // before a single frame arrives (`@@T-800`).
    await expect(view.locator('[data-metric="turns"]')).toContainText('2');
    await expect(view).toHaveAttribute('data-stream', 'open', {timeout: 30_000});

    // Every kind in the script has a section, and the page drew them: the counts are the view's own
    // attributes, so the transcript is not mistaken for a page that opened an empty stream.
    await expect(view).not.toHaveAttribute('data-sections', '0');
    await expect(view.locator('.agent-section-reasoning')).toHaveCount(1);
    // Three calls in a row are one row, not three: a run is what the seed writes and what the card
    // summarises, so a folded card hides three tool sections behind one line (`@@D-1010`).
    await expect(view.locator('.agent-section-tool')).toHaveCount(0);
    const run = view.locator('.agent-tools');
    await expect(run).toHaveCount(1);
    await expect(run.locator('.agent-section-title')).toContainText('Used 3 tools');
    // The time is what the tools reported, not the gap between two writes a batch made together:
    // 420 + 180 + 200, and the header of the bar agrees with it.
    await expect(run.locator('.agent-section-time').first()).toContainText('800 ms');
    // The question the turn stopped on is a callout, not a card: it is the one event a person has to
    // act on, and it is drawn as the words that were asked.
    await expect(view.locator('.agent-section-note[data-title="awaiting"]')).toContainText(
        'Shall I apply the change?',
    );
    // The run is folded to one line once its last call answered, which is what keeps the newest
    // section the only thing open.
    await expect(run).toHaveAttribute('data-done', 'yes');
    await expect(run).toHaveAttribute('data-open', 'no');
    // …and the header is the control that opens it, which is what the screenshot below shows: one
    // row per call, and a row opens to the output it answered with.
    await run.locator('.agent-section-head').click();
    await expect(run).toHaveAttribute('data-open', 'yes');
    await expect(run.locator('.agent-tools-row')).toHaveCount(3);
    const firstCall = run.locator('.agent-tools-row').first();
    await expect(firstCall).toContainText('git diff --stat');
    await firstCall.locator('.agent-tools-row-head').click();
    // The arguments it was made with and the output it answered with, each its own block.
    await expect(firstCall.locator('pre.agent-code')).toHaveCount(2);
    await expect(firstCall.locator('pre.agent-code').last()).toContainText('src/a.ts');

    // The message: a table, a diagram and two code blocks, each drawn as itself rather than as text.
    const message = view.locator('.agent-section-message').last();
    await expect(message.locator('table.agent-table')).toBeVisible();
    await expect(message.locator('.agent-diagram svg')).toBeVisible({timeout: 20_000});
    // TypeScript, a diff and a shell command: three fences, and the diff's two halves are the
    // colours the page gained when the scanner was replaced by a grammar (`@@D-1011`).
    await expect(message.locator('pre.agent-code')).toHaveCount(3);
    for (const block of await message.locator('pre.agent-code').all()) await expect(block).toBeVisible();
    // A comment that spans two lines is two comment spans, not a comment and a line of code: the
    // fence is tokenized whole and then cut (`@@D-1011`).
    await expect(message.locator('pre.agent-code .tok-comment')).toHaveCount(2);
    await expect(message.locator('pre.agent-code .tok-insert')).toHaveCount(1);
    await expect(message.locator('pre.agent-code .tok-deleted')).toHaveCount(1);

    // A screenshot of the transcript is the claim that all of that renders together.
    // The diagram is drawn after its own module loads, so the wait above is what makes this
    // deterministic; nothing is masked, because the seed pins the only relative value on the page.
    //
    // The picture is only taken once the window is as small as the transcript needs, because a
    // picture twice the size of what it draws is a picture nobody reviews. The column is the widest
    // thing on the page and the transcript's own height is the tallest, so both are measured rather
    // than guessed — at the size the steps above wanted, not at the size the reader wants.
    const measure = (): Promise<{width: number; height: number}> =>
        view.evaluate(element => {
            const view_ = globalThis as unknown as {
                getComputedStyle: (node: Element) => CSSStyleDeclaration;
            };
            const transcript = element.querySelector('.agent-transcript') as HTMLElement;
            const bar = element.querySelector('.agent-statusbar') as HTMLElement | null;
            const column = element.querySelector('.agent-section') as HTMLElement | null;
            const style = view_.getComputedStyle(transcript);
            const side = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
            // `scrollHeight` is never smaller than the box it scrolls in, so a transcript that fits
            // would report the window's own height: the content's bottom is what is measured.
            const last = transcript.lastElementChild;
            const bottom = last
                ? last.getBoundingClientRect().bottom -
                  transcript.getBoundingClientRect().top +
                  parseFloat(style.paddingBottom)
                : transcript.clientHeight;
            return {
                width: Math.ceil((column?.offsetWidth ?? transcript.clientWidth) + side),
                height: Math.ceil((bar?.offsetHeight ?? 0) + bottom + 2),
            };
        });
    const chrome = await portal.page.evaluate(() => {
        const view_ = globalThis as unknown as {innerWidth: number; innerHeight: number};
        const element = document.querySelector('.agent-session-view') as HTMLElement;
        return {
            width: view_.innerWidth - element.clientWidth,
            height: view_.innerHeight - element.clientHeight,
        };
    });
    const size = await measure();
    // The width first, because a narrower column rewraps the prose and changes the height that is
    // asked for next.
    await portal.page.setViewportSize({width: size.width + chrome.width, height: 1600});
    const fitted = await measure();
    await portal.page.setViewportSize({
        width: size.width + chrome.width,
        height: fitted.height + chrome.height,
    });
    await expect(view).toHaveScreenshot('agent-session-transcript.png', {animations: 'disabled'});
});
