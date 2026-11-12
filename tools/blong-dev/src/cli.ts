export {}; // mark as ESM module so top-level await is valid

import {findCommand, helpText, renderIndex, resolveHelp} from './usage.ts';

const [, , command, ...args] = process.argv;

// Help is answered before a command is dispatched, at whichever of the three levels the
// command line names: no command (the list), a command (its verbs), or a command and a
// verb (that verb's parameters and examples).
const requested = resolveHelp(command, args);
if (requested !== undefined) {
    if (requested.command !== undefined && findCommand(requested.command) === undefined) {
        process.stderr.write(`blong-dev: Unknown command "${requested.command}"\n\n`);
        process.stderr.write(renderIndex());
        process.exit(1);
    }
    process.stdout.write(helpText(requested.command, requested.verb));
    process.exit(0);
}

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
    case 'report':
        await (await import('./commands/report.ts')).report(args);
        break;
    case 'ci-report':
        await (await import('./commands/ciReport.ts')).ciReport(args);
        break;
    case 'ci':
        await (await import('./commands/ci.ts')).ci(args);
        break;
    case 'playwright':
        await (await import('./commands/playwright.ts')).playwright(args);
        break;
    case 'browsers':
        await (await import('./commands/browsers.ts')).browsers(args);
        break;
    case 'proxy':
        await (await import('./commands/proxy.ts')).proxy(args);
        break;
    case 'call':
        await (await import('./commands/call.ts')).call(args);
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
    case 'db':
        await (await import('./commands/db.ts')).db(args);
        break;
    case 'user':
        await (await import('./commands/user.ts')).user(args);
        break;
    case 'cspell':
        await (await import('./commands/cspell.ts')).cspell(args);
        break;
    case 'publish':
        (await import('./commands/publish.ts')).publish(args);
        break;
    case 'glossary':
        await (await import('./commands/glossary.ts')).glossary(args);
        break;
    case 'memory':
        await (await import('./commands/memory.ts')).memory(args);
        break;
    case 'plan':
        await (await import('./commands/plan.ts')).plan(args);
        break;
    case 'docs':
        await (await import('./commands/docs.ts')).docs(args);
        break;
    default:
        process.stderr.write(`blong-dev: Unknown command "${command ?? ''}"\n\n`);
        process.stderr.write(renderIndex());
        process.exitCode = 1;
}
