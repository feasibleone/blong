/**
 * lukaot — the bundle-safe entry point.
 *
 * A page's bundler follows a static import into `node:async_hooks` and stops there, so the ambient
 * identity a browser also needs lives behind this subpath: it imports nothing, and a platform
 * bootstrap attaches the real implementation once the server entry has loaded it.
 *
 * ```ts
 * import {attachVocabulary} from '@feasibleone/lukaot/context';
 * import * as vocabulary from '@feasibleone/lukaot';
 * attachVocabulary(vocabulary);
 * ```
 *
 * An unattached facade is not an error: every reader answers "no identity" and every scope-binding
 * runs the function it was handed with no scope around it, which is the deliberate degradation a
 * dispatch path needs.
 */

export {attachVocabulary, detachVocabulary, vocabulary} from './src/attachable.ts';
export type {AttachedVocabulary} from './src/attachable.ts';
