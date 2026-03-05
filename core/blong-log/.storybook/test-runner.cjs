/**
 * Storybook test-runner configuration for visual regression tests.
 *
 * Uses Playwright page.screenshot() + jest-image-snapshot to save actual PNG
 * baseline images that can be visually reviewed.
 *
 * Run with Storybook serving on port 6006:
 *   npm run storybook:test
 *
 * Or for CI (self-contained build+serve+test):
 *   npm run storybook:test:ci
 *
 * Update baselines: npm run visual:update
 *
 * Baseline PNGs are stored in:
 *   src/client/__image_snapshots__/
 *
 * Markup snapshots are stored in:
 *   src/client/__markup_snapshots__/
 */

const path = require('path');
const fs = require('fs');

/** @type {import('@storybook/test-runner').TestRunnerConfig} */
module.exports = {
    async postVisit(page, context) {
        // Lazily extend expect inside the Jest test context
        const {toMatchImageSnapshot} = require('jest-image-snapshot');
        expect.extend({toMatchImageSnapshot});

        // Wait for network idle and rendering to settle
        await page.waitForLoadState('networkidle');

        // Extra delay so SVAR grid finishes rendering and CSS transitions settle
        await page.waitForTimeout(500);

        // ── Capture markup structure for analysis ─────────────────────────

        // Get the root div that contains LogViewer
        const rootStructure = await page.evaluate(() => {
            const root = document.querySelector('#storybook-root');
            if (!root) return null;

            // Recursively analyze DOM structure
            function analyzeElement(el, depth = 0) {
                const styles = window.getComputedStyle(el);
                const info = {
                    tag: el.tagName.toLowerCase(),
                    depth,
                    classes: Array.from(el.classList),
                    id: el.id || null,
                    display: styles.display,
                    position: styles.position,
                    width: styles.width,
                    height: styles.height,
                    flexGrow: styles.flexGrow,
                    flexShrink: styles.flexShrink,
                    flexDirection: styles.flexDirection,
                    overflow: styles.overflow,
                    childCount: el.children.length,
                };

                // Only go deep enough to see the wrapper structure
                if (depth < 5 && el.children.length > 0) {
                    info.children = Array.from(el.children).map(child =>
                        analyzeElement(child, depth + 1),
                    );
                }

                return info;
            }

            return analyzeElement(root);
        });

        // Save markup snapshot for analysis
        const snapshotsDir = path.join(__dirname, '..', 'src', 'client', '__markup_snapshots__');
        if (!fs.existsSync(snapshotsDir)) {
            fs.mkdirSync(snapshotsDir, {recursive: true});
        }

        const markupPath = path.join(snapshotsDir, `${context.id.replace(/\//g, '-')}.json`);
        fs.writeFileSync(markupPath, JSON.stringify(rootStructure, null, 2));

        // ── Analyze wrapper structure for height issues ───────────────────

        const heightAnalysis = await page.evaluate(() => {
            const results = [];
            let current = document.querySelector('#storybook-root');

            // Traverse up to 10 levels deep to find the LogViewer wrapper
            for (let i = 0; i < 10 && current; i++) {
                const styles = window.getComputedStyle(current);
                const rect = current.getBoundingClientRect();

                results.push({
                    selector: current.id || current.className || current.tagName.toLowerCase(),
                    tag: current.tagName.toLowerCase(),
                    computedHeight: styles.height,
                    computedMaxHeight: styles.maxHeight,
                    actualHeight: `${rect.height}px`,
                    display: styles.display,
                    position: styles.position,
                    flexGrow: styles.flexGrow,
                    flexDirection: styles.flexDirection,
                    overflow: styles.overflow,
                    top: styles.top,
                    bottom: styles.bottom,
                });

                current = current.firstElementChild;
            }

            return results;
        });

        // Log analysis for first story (to avoid spam)
        if (context.id === 'logviewer--dark-theme') {
            console.log('\n📊 Height Analysis for', context.id);
            console.log('═'.repeat(80));
            heightAnalysis.forEach((item, idx) => {
                console.log(`\nLevel ${idx}: <${item.tag}> [${item.selector}]`);
                console.log(`  Computed height: ${item.computedHeight}`);
                console.log(`  Actual height: ${item.actualHeight}`);
                console.log(`  Display: ${item.display}, Position: ${item.position}`);
                console.log(`  FlexGrow: ${item.flexGrow}, FlexDir: ${item.flexDirection}`);
                console.log(`  Overflow: ${item.overflow}`);
                if (item.position === 'absolute') {
                    console.log(`  Top: ${item.top}, Bottom: ${item.bottom}`);
                }
            });
            console.log('\n' + '═'.repeat(80));

            // Check for problematic wrappers
            const issues = [];
            heightAnalysis.forEach((item, idx) => {
                if (item.computedHeight === 'auto' && item.position !== 'absolute') {
                    issues.push(
                        `⚠️  Level ${idx}: ${item.selector} has height:auto (may not stretch)`,
                    );
                }
                if (item.flexGrow === '0' && item.display.includes('flex')) {
                    issues.push(
                        `⚠️  Level ${idx}: ${item.selector} has flex-grow:0 (won't expand)`,
                    );
                }
            });

            if (issues.length > 0) {
                console.log('\n🔍 Potential Issues:');
                issues.forEach(issue => console.log(issue));
            }
        }

        // ── Visual snapshot test ──────────────────────────────────────────

        // Full-page screenshot comparison — saves real PNG files
        const screenshot = await page.screenshot({fullPage: true});
        expect(screenshot).toMatchImageSnapshot({
            customSnapshotsDir: path.join(__dirname, '..', 'src', 'client', '__image_snapshots__'),
            customSnapshotIdentifier: context.id,
        });
    },
};
