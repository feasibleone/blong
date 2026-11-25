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

    // The seeded row is found by its own title, not by being the newest: the list answers with every
    // session a developer's database holds, and a real run against a runtime host is newer than this
    // run's seed — which made the spec read a transcript it never wrote (`@@F-845`).
    const row = list.locator('tr[data-session]').filter({hasText: 'Render the session'}).first();
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
    // Two deltas of one thought are one section, and thinking is drawn as an icon rather than as a
    // heading (`@@T-827`).
    await expect(view.locator('.agent-section-reasoning')).toHaveCount(1);
    await expect(view.locator('.agent-section-reasoning .agent-section-title')).toHaveCount(0);
    // Three calls in a row are one row, not three, and the lone `view` after the message is a card of
    // its own — which is the boundary the grouping rule is (`@@D-1010`).
    const [firstRun, secondRun] = [
        view.locator('.agent-tools').first(),
        view.locator('.agent-tools').last(),
    ];
    await expect(view.locator('.agent-tools')).toHaveCount(2);
    await expect(view.locator('.agent-section-tool')).toHaveCount(1);
    await expect(firstRun.locator('.agent-section-title')).toContainText('Used 3 tools');
    // The time is the sum of what the tools reported — 45004 + 180 + 420 — and it is over half a
    // minute, which the page marks (`@@T-827`).
    await expect(firstRun.locator('.agent-section-time').first()).toContainText('45.6s');
    await expect(firstRun.locator('.agent-section-time').first()).toHaveAttribute(
        'data-slow',
        'yes',
    );
    // The question the turn stopped on is a callout, not a card: it is the one event a person has to
    // act on, and it is drawn as the words that were asked.
    await expect(view.locator('.agent-section-note[data-title="awaiting"]')).toContainText(
        'Shall I apply the change?',
    );

    // The run is folded to one line once its last call answered, which is what keeps the newest
    // section the only thing open — and a caret is the pointer's business while it is folded
    // (`@@T-827`).
    await expect(firstRun).toHaveAttribute('data-done', 'yes');
    await expect(firstRun).toHaveAttribute('data-open', 'no');
    await expect(firstRun.locator('.agent-caret')).toHaveCSS('opacity', '0');
    await firstRun.locator('.agent-section-head').hover();
    await expect(firstRun.locator('.agent-caret')).toHaveCSS('opacity', '1');
    // …and the header is the control that opens it, which is what the screenshot below shows: one
    // row per call, and a row opens to what it did.
    await firstRun.locator('.agent-section-head').click();
    await expect(firstRun).toHaveAttribute('data-open', 'yes');
    await expect(firstRun.locator('.agent-tools-row')).toHaveCount(3);

    // A shell is its command and its output, with the tick that says it worked and no pill around it
    // (`@@T-827`).
    const shellCall = firstRun.locator('.agent-tools-row').first();
    await expect(shellCall).toContainText('git diff --stat');
    await expect(shellCall.locator('.agent-exit-ok')).toHaveText('✓');
    await expect(shellCall.locator('.agent-exit')).not.toHaveClass(/agent-pill/);
    await shellCall.locator('.agent-tools-row-head').click();
    await expect(shellCall.locator('pre.agent-code')).toHaveCount(2);
    await expect(shellCall.locator('pre.agent-code').first()).toContainText('git diff --stat');
    await expect(shellCall.locator('pre.agent-code').last()).toContainText('src/a.ts');
    // The runtime's own trailer is not output: the exit code is the badge, not a line of text.
    await expect(shellCall.locator('pre.agent-code').last()).not.toContainText('shellId');

    // A failure keeps its pill and its number, because it is the one row a reader has to find.
    const failingCall = firstRun.locator('.agent-tools-row').nth(2);
    await expect(failingCall.locator('.agent-exit-bad')).toHaveText('✗ 1');
    await expect(failingCall.locator('.agent-exit-bad')).toHaveClass(/agent-pill/);

    // An edit is its diff: the added and the removed line, coloured, and the count on the row.
    const editCall = firstRun.locator('.agent-tools-row').nth(1);
    await expect(editCall.locator('.agent-tools-row-stats')).toHaveText('+1 −1');
    await editCall.locator('.agent-tools-row-head').click();
    await expect(editCall.locator('.agent-diff-add')).toHaveCount(1);
    await expect(editCall.locator('.agent-diff-del')).toHaveCount(1);
    await expect(editCall.locator('.agent-diff-hunk')).toHaveCount(1);

    // The lone read is the file it read, sized by its text rather than by the diff-shaped snapshot
    // the runtime answers with (`@@T-824`).
    const readCall = view.locator('.agent-section-tool').first();
    await expect(readCall.locator('.agent-tools-row')).toHaveCount(1);
    await expect(readCall.locator('.agent-tools-row-stats')).toContainText('3 lines');
    await readCall.locator('.agent-tools-row-head').click();
    await expect(readCall.locator('pre.agent-code')).toContainText('randomUUID');

    // A question is a card: what was asked, the choices, and what the person said.
    await secondRun.locator('.agent-section-head').click();
    const askCall = secondRun.locator('.agent-tools-row', {hasText: 'askHuman'});
    await expect(askCall.locator('.agent-tools-row-command')).toContainText(
        'Shall I fix the trailing space?',
    );
    await askCall.locator('.agent-tools-row-head').click();
    await expect(askCall.locator('.agent-ask-question')).toContainText(
        'Shall I fix the trailing space?',
    );
    await expect(askCall.locator('.agent-ask-options .agent-pill')).toHaveCount(2);
    await expect(askCall.locator('.agent-ask-answer')).toContainText('yes');
    // A write is its diff and its size, and a call under a second carries no time at all.
    const createCall = secondRun.locator('.agent-tools-row', {hasText: 'create'});
    await expect(createCall.locator('.agent-tools-row-stats')).toHaveText('+1 −0');
    await expect(createCall.locator('.agent-section-time')).toHaveCount(0);
    // Opened, a write is the file it wrote — highlighted by the name the file has — and not a diff
    // envelope (`@@T-824`).
    await createCall.locator('.agent-tools-row-head').click();
    await expect(createCall.locator('pre.agent-code')).toContainText('export const moved');

    // The message: a table, a diagram and two code blocks, each drawn as itself rather than as text.
    const message = view.locator('.agent-section-message').last();
    await expect(message.locator('table.agent-table')).toBeVisible();
    await expect(message.locator('.agent-diagram svg')).toBeVisible({timeout: 20_000});
    // TypeScript, a diff and a shell command: three fences, and the diff's two halves are the
    // colours the page gained when the scanner was replaced by a grammar (`@@D-1011`).
    await expect(message.locator('pre.agent-code')).toHaveCount(3);
    for (const block of await message.locator('pre.agent-code').all())
        await expect(block).toBeVisible();
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
    // The colour a comment is drawn in is read before the palette moves, so the second picture can be
    // compared against it (`@@T-815`).
    const tokenColour = (): Promise<string> =>
        message
            .locator('pre.agent-code .tok-comment')
            .first()
            .evaluate(element => {
                const view_ = globalThis as unknown as {
                    getComputedStyle: (node: Element) => CSSStyleDeclaration;
                };
                return view_.getComputedStyle(element).color;
            });
    const darkTokens = await tokenColour();
    await expect(view).toHaveScreenshot('agent-session-transcript.png', {animations: 'disabled'});

    // The same transcript on a light background (`@@T-815`). The stylesheet carries two token sets —
    // one that reads on the theme's sunken surface and one that reads on white — and a picture in
    // one palette would pass every run while the other lost its comments and strings.
    // A theme that ships one light variant, because the families that carry both keep whichever
    // palette the reader last chose — a spec that selected one of those would depend on state the
    // page remembers rather than on the palette it is asserting (`@@T-815`).
    const theme = portal.page.locator('.blong-theme-switcher__select');
    await theme.click();
    await portal.page.getByRole('option', {name: 'Fluent Light'}).click();
    const app = portal.page.locator('.blong-app');
    await expect(app).toHaveClass(/blong-app-light/);
    // The palette changes the wrapping, so the window is measured again rather than reused.
    const light = await measure();
    await portal.page.setViewportSize({width: light.width + chrome.width, height: 1600});
    const lightFitted = await measure();
    await portal.page.setViewportSize({
        width: lightFitted.width + chrome.width,
        height: lightFitted.height + chrome.height,
    });
    // A rule that only works on the dark surface names the same classes and a colour that reads as
    // nothing on white, so the two pictures are told apart by the colour, not by the file name.
    expect(await tokenColour()).not.toBe(darkTokens);
    await expect(view).toHaveScreenshot('agent-session-transcript-light.png', {
        animations: 'disabled',
    });
});
