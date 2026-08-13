// ESM shim for the cacache pino transport.
//
// See `pino-pretty.mjs` for why a `.mjs` shim is used: pino's multi-target
// transport would otherwise load this `.ts` file via CJS `require()`, which
// breaks under `tap`. Loading via this shim uses ESM `import()` + Node's native
// type stripping.
export {default} from './pino-cacache.ts';
