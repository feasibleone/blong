export {}; // mark as ESM module so top-level await is valid

import {writeUnknownCommand, writeUsage} from './usage.ts';

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
    case 'proxy':
        await (await import('./commands/proxy.ts')).proxy(args);
        break;
    case 'trace':
        await (await import('./commands/trace.ts')).trace(args);
        break;
    case 'log':
        await (await import('./commands/log.ts')).log(args);
        break;
    case 'sql':
        await (await import('./commands/sql.ts')).sql(args);
        break;
    case '--help':
    case '-h':
    case 'help':
        // Print the command list (exit 0) so `--help` is never mistaken for a crash.
        writeUsage(process.stdout);
        process.exit(0);
        break;
    default:
        writeUnknownCommand(process.stderr, command);
        process.exit(1);
}
