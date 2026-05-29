export {}; // mark as ESM module so top-level await is valid

const [, , command, ...args] = process.argv;

switch (command) {
    case 'lint':
        await (await import('./commands/lint.ts')).lint(args);
        break;
    case 'lint-staged':
        await (await import('./commands/lintStaged.ts')).lintStaged();
        break;
    case 'test':
        await (await import('./commands/test.ts')).test(args);
        break;
    case 'playwright':
        await (await import('./commands/playwright.ts')).playwright(args);
        break;
    default:
        process.stderr.write(`blong-dev: Unknown command "${command ?? ''}"\n`);
        process.stderr.write('Usage:\n');
        process.stderr.write(
            '  blong-dev lint [files...]    Run tsc + cspell + eslint in current package\n',
        );
        process.stderr.write(
            '  blong-dev lint-staged        Lint git staged files across all affected packages\n',
        );
        process.stderr.write('  blong-dev test               Run tap tests in current package\n');
        process.stderr.write(
            '  blong-dev playwright [args]  Run Playwright tests in current package\n',
        );
        process.exit(1);
}
