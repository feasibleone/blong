/**
 * The publish-only half of the framework's build (@@D-831).
 *
 * `heft build --clean` writes `dist/types.js`, which is what the package's `default` export
 * condition resolves and what every deployed process runs. The declaration bundle written here —
 * `dist/types.d.ts`, the inlined type surface npm consumers read — is needed by nobody at runtime,
 * and bundling it is 35 s of a build the deploy workflow runs twice per release.
 *
 * The switch is an environment variable rather than a second `build` script in `package.json`, so
 * that a caller which must not publish declarations says so once and a caller that publishes says
 * nothing: unset means bundle, which is what the release pipeline relies on when it packs `dist`
 * and publishes it.
 */
import {spawnSync} from 'node:child_process';

if (process.env.BLONG_SKIP_DTS) {
    console.log(
        'buildDeclarations: skipped (BLONG_SKIP_DTS); `dist/types.js` is what a deployment runs',
    );
    process.exit(0);
}

const result = spawnSync('dts-bundle-generator', ['--config', 'dts-gen.config.json'], {
    stdio: 'inherit',
    // The binary in `node_modules/.bin` is a `.cmd` shim on Windows, which needs a shell.
    shell: process.platform === 'win32',
});

if (result.error) {
    console.error(`buildDeclarations: dts-bundle-generator did not run: ${result.error.message}`);
    process.exit(1);
}

process.exit(result.status ?? 1);
