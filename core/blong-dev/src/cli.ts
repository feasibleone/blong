export {}; // mark as ESM module so top-level await is valid

const [, , command, ...args] = process.argv;

switch (command) {
    case 'lint':
        await (await import('./commands/lint.ts')).lint(args);
        break;
    case 'lint-staged':
        await (await import('./commands/lintStaged.ts')).lintStaged();
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
        process.exit(1);
}
