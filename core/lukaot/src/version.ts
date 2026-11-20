/**
 * The emitter's own version, carried as a base field (PRD R20; §5.1 "Base
 * fields (pid, hostname, service, version)").
 *
 * Read from the manifest rather than duplicated as a literal so the value
 * cannot drift from `package.json`. It is read with `readFileSync` and not
 * imported as JSON: the `tap` TypeScript loader drops import attributes when it
 * transpiles, so `import ... with {type: 'json'}` works under plain `node` but
 * makes every test file that transitively imports the logger fail to load. The
 * base fields identify the process that emitted the record, so the default is
 * *this* package's version; a service that wants its own version passes one to
 * `createLogger` (see `LoggerOptions.version`).
 */

import {readFileSync} from 'node:fs';

/** This package's version, read from its manifest at module load. */
export const packageVersion: string = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {version: string}
).version;
