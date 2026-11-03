/**
 * What a test pays before it can click: the same login screen, served the two ways a
 * Blong app can be served.
 *
 * Every spec in every suite begins here — a fresh browser context, one document, the
 * app's module graph, a login — and that boot is the largest single cost of a run. It is
 * also the one cost nobody has measured in CI, because a failing spec reports the phase
 * it was in, not how long the phases took when everything worked.
 *
 * So this file measures instead of judging: it boots the login screen three times against
 * the dev server, once more with a trace collecting, and three times against a build of
 * the same app served from disk, then prints one table. Nothing is asserted about the
 * numbers — a shared runner's CPU decides them, and a threshold tuned on one machine
 * fails on the next. What the run carries away is the table (in its output and in the
 * Allure result) and `.playwright/latency.json`, so two runs can be compared.
 *
 * The build leg is what makes it a comparison rather than a number. A dev server serves
 * one module per request and transforms on demand, a build serves a handful of chunks, so
 * the two differ exactly in the thing the boot is waiting for — and the difference is what
 * decides whether the runner should serve a build. Two notes on reading it:
 * a build's `/rpc` calls pass through `vite preview`, which proxies to the run's dev
 * server, so the `submit` phase carries one extra hop; and the build itself is excluded
 * from the timings (it happens first, once).
 *
 * A measurement, not a gate: it costs a build, so locally it is opt-in with
 * `BLONG_LATENCY=1`. CI runs it unconditionally. `@@T-605`
 */
import {
    latencySummary,
    measureBoot,
    reportLatency,
    serveBuiltApp,
    type IBootSample,
} from '@feasibleone/blong-browser/playwright/latency';

import {expect, test, type IBlongTestOptions} from '@feasibleone/blong-browser/playwright';

/** Contexts per leg: one number is an anecdote, three are a spread. */
const RUNS = 3;

// The runner collects a trace for every context a test creates (`retain-on-failure`),
// which leaves no leg to compare against, so it is switched off here and asked for
// explicitly in the one leg that prices it. A failure still reports its error, and this
// spec asserts no behaviour that a trace would explain.
test.use({trace: 'off'});

test.describe('boot latency', () => {
    test.skip(
        !process.env.CI && !process.env.BLONG_LATENCY,
        'a measurement, not an assertion: set BLONG_LATENCY=1 to run it beside a dev server',
    );
    // A build of the app, then seven boots. Generous because the machine is shared.
    test.setTimeout(600_000);

    test('the login screen, from the dev server and from a build', async ({browser, baseURL}) => {
        const appUrl = new URL('./', baseURL).href;
        // The run's own credentials: `defineBlongConfig` sets them in `use`, and the cast
        // is needed only because Playwright types `project.use` with its own options.
        const {blongUsername, blongPassword} = test.info().project.use as IBlongTestOptions;

        const measure = (label: string, url: string, trace = false) =>
            measureBoot(browser, {
                label,
                url,
                username: blongUsername,
                password: blongPassword,
                trace,
            });

        const samples: IBootSample[] = [];
        for (let run = 1; run <= RUNS; run += 1) {
            samples.push(await measure(`dev #${run}`, appUrl));
        }
        // CI keeps a trace only for a failure, so this sample prices what it costs to
        // collect one — the question a slow run raises first and answers last.
        samples.push(await measure('dev + trace', appUrl, true));

        const built = await serveBuiltApp({
            packageDir: process.cwd(),
            rpcOrigin: new URL(appUrl).origin,
        });
        try {
            for (let run = 1; run <= RUNS; run += 1) {
                samples.push(await measure(`build #${run}`, built.url));
            }
        } finally {
            await built.stop();
        }

        const report = `${reportLatency(samples, {file: '.playwright/latency.json'})}\n${latencySummary(samples)}`;
        console.log(
            `\n[latency] dev server: ${appUrl}\n[latency] build:      ${built.url}\n[latency]\n${report}`,
        );
        test.info().annotations.push({type: 'boot-latency', description: report});

        // The table means something only if every leg really reached the portal: a leg
        // that timed out halfway is fast, and would read as the faster way to serve.
        expect(samples.map(sample => sample.label)).toEqual([
            'dev #1',
            'dev #2',
            'dev #3',
            'dev + trace',
            'build #1',
            'build #2',
            'build #3',
        ]);
        // And only if each boot was one navigation of a served module graph: a second
        // document load is the dependency scan reloading the page again, which is the
        // failure the dev server was freed from (`@@D-746`) and would not show up as a
        // number that reads wrong.
        expect(samples.filter(sample => sample.documents !== 1)).toEqual([]);
        expect(samples.filter(sample => sample.scripts === 0)).toEqual([]);
    });
});
