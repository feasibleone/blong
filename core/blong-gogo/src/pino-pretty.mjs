// ESM shim for the pretty pino transport.
//
// pino's multi-target transport loads `.ts` targets via CJS `require()` (see
// pino/lib/transport-stream.js), which needs a working ts-node/pirates hook and
// fails under `tap` (SyntaxError: Unexpected identifier 'PinoPretty'). Pointing
// the target at this `.mjs` shim makes pino load it via ESM `import()`, and the
// re-exported `.ts` module is handled by Node's native type stripping.
export {default} from './pino-pretty.ts';
