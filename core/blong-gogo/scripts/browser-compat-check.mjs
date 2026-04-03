// core/blong-gogo/scripts/browser-compat-check.mjs
//
// Usage:
//   node scripts/browser-compat-check.mjs
//
// Starts the ui-demo Vite dev server, opens Chromium via Playwright,
// captures ALL console output and network errors, prints a summary, and exits.
// Run after every code change. Exit code 1 if errors were found.

import {chromium} from 'playwright';
import {spawn} from 'child_process';

const TIMEOUT_MS = 30_000;

async function startVite() {
    const proc = spawn('node', ['../../common/scripts/install-run-rush-pnpm.js', 'run', 'dev'], {
        cwd: new URL('../../ui-demo', import.meta.url).pathname,
        stdio: 'pipe',
    });
    // Wait until Vite prints its "ready" line; strip ANSI codes before matching
    const url = await new Promise((resolve, reject) => {
        const onData = chunk => {
            const text = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
            const match = text.match(/Local:\s+(http:\/\/localhost:\d+)/);
            if (match) resolve(match[1]);
        };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);
        setTimeout(() => reject(new Error('Vite did not start in time')), TIMEOUT_MS);
    });
    return {proc, url};
}

async function run() {
    console.log('Starting Vite dev server…');
    const {proc: vite, url: viteUrl} = await startVite();

    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    const errors = [];
    const warnings = [];

    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'error')   errors.push(text);
        if (type === 'warning') warnings.push(text);
        // print everything so the agent log shows real-time output
        console.log(`[browser:${type}] ${text}`);
    });

    page.on('pageerror', err => {
        errors.push(`UNCAUGHT: ${err.message}`);
        console.error(`[browser:pageerror] ${err.message}`);
    });

    page.on('requestfailed', req => {
        const msg = `REQUEST FAILED: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`;
        errors.push(msg);
        console.error(`[browser:request] ${msg}`);
    });

    console.log(`Navigating to ${viteUrl} …`);
    await page.goto(viteUrl, {waitUntil: 'networkidle', timeout: TIMEOUT_MS});

    // Give async framework init a moment to complete
    await page.waitForTimeout(3000);

    await browser.close();
    vite.kill();

    console.log('\n─── Summary ───────────────────────────────────');
    console.log(`Errors:   ${errors.length}`);
    console.log(`Warnings: ${warnings.length}`);
    if (errors.length) {
        console.error('\nErrors found:');
        errors.forEach(e => console.error('  •', e));
        process.exit(1);
    } else {
        console.log('\n✓ No browser errors detected.');
    }
}

run().catch(err => { console.error('Browser compatibility check failed:', err); process.exit(1); });
