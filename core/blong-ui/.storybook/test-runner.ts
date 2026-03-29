/**
 * Storybook test-runner configuration.
 *
 * Two snapshot layers per story:
 *
 * 1. **Image snapshots** — full-page PNG screenshots via jest-image-snapshot.
 *    Stored in stories/__snapshots__/*.png. Catch visual regressions.
 *
 * 2. **Markup snapshots** — serialized inner-HTML of #storybook-root stored as
 *    stories/__snapshots__/markup/*.html. Catch structural/DOM regressions and
 *    are easier to reason about than pixel diffs (plain text, git-diffable).
 *
 * Both are updated via `npm run visual:update` (or `--updateSnapshot` flag).
 */

import type {TestRunnerConfig} from '@storybook/test-runner';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// ESM: derive __dirname from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

const MARKUP_DIR = join(__dir, '../stories/__snapshots__/markup');

/**
 * Serialize the children of `#storybook-root` to a multiline, indented
 * string that matches the format produced by Jest's `pretty-format`
 * DOMElement plugin (the same format used by `toMatchSnapshot()` in
 * @testing-library tests).
 *
 * Runs inside the Playwright browser context so it operates on the real
 * live DOM — no jsdom or extra dependencies required.
 */
async function serializeMarkup(
    page: Parameters<TestRunnerConfig['postRender']>[0],
): Promise<string> {
    return page.evaluate(() => {
        function serializeNode(node: Node, indent: string): string {
            if (node.nodeType === 3 /* TEXT_NODE */) {
                const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
                return text ? `${indent}${text}\n` : '';
            }
            if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';
            const el = node as Element;
            const tag = el.tagName.toLowerCase();
            const attrStr =
                el.attributes.length === 0
                    ? ''
                    : Array.from(el.attributes)
                          .map(a => `\n${indent}  ${a.name}="${a.value}"`)
                          .join('');
            const childIndent = `${indent}  `;
            const children = Array.from(el.childNodes)
                .map(c => serializeNode(c, childIndent))
                .filter(s => s.length > 0)
                .join('');
            if (!children) {
                return attrStr
                    ? `${indent}<${tag}${attrStr}\n${indent}/>\n`
                    : `${indent}<${tag} />\n`;
            }
            return attrStr
                ? `${indent}<${tag}${attrStr}\n${indent}>\n${children}${indent}</${tag}>\n`
                : `${indent}<${tag}>\n${children}${indent}</${tag}>\n`;
        }

        const root = document.querySelector('#storybook-root');
        if (!root) return '';
        return Array.from(root.childNodes)
            .map(c => serializeNode(c, ''))
            .filter(Boolean)
            .join('');
    });
}

/** True when Jest is running with --updateSnapshot (same mechanism as jest-image-snapshot). */
function isUpdateSnapshot(): boolean {
    try {
        // @ts-expect-error — accessing Jest internals; safe at runtime
        return expect.getState()?.snapshotState?._updateSnapshot === 'all';
    } catch {
        return false;
    }
}

const config: TestRunnerConfig = {
    setup() {
        expect.extend({toMatchImageSnapshot});
        if (!existsSync(MARKUP_DIR)) mkdirSync(MARKUP_DIR, {recursive: true});
    },
    async postRender(page, context) {
        // Wait for any animations to settle
        await page.waitForTimeout(200);

        const snapshotId = context.id.replace(/[^a-z0-9]/gi, '-');

        // ── 1. Image snapshot ────────────────────────────────────────────────
        const image = await page.screenshot();
        // @ts-expect-error — jest-image-snapshot extends expect at runtime
        expect(image).toMatchImageSnapshot({
            customSnapshotsDir: join(__dir, '../stories/__snapshots__'),
            customSnapshotIdentifier: snapshotId,
            failureThreshold: 0.02,
            failureThresholdType: 'percent',
        });

        // ── 2. Markup snapshot ───────────────────────────────────────────────
        const formatted = await serializeMarkup(page);
        const markupFile = join(MARKUP_DIR, `${snapshotId}.html`);

        if (isUpdateSnapshot()) {
            writeFileSync(markupFile, formatted, 'utf8');
        } else {
            let baseline: string;
            try {
                baseline = readFileSync(markupFile, 'utf8');
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                    // No baseline yet — write it on first run (mirrors jest snapshot behaviour)
                    writeFileSync(markupFile, formatted, 'utf8');
                    return;
                }
                throw e;
            }
            expect(formatted).toBe(baseline);
        }
    },
};

export default config;
