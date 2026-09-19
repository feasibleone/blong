/**
 * semantic-log — attachable surface.
 *
 * The one entry point that imports nothing, so a runtime can reach identity and
 * capabilities from code that a browser also bundles: the vocabulary is attached
 * by a platform bootstrap and degrades to "no identity" until it is. See
 * `src/attachable.ts` for the contract and the reason the subpath exists.
 */

export {attachSemanticVocabulary, detachSemanticVocabulary, vocabulary} from './src/attachable.ts';
export type {AttachedVocabulary} from './src/attachable.ts';
