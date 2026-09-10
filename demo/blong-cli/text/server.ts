import {realm} from '@feasibleone/blong';

/**
 * The demo realm.
 *
 * Deliberately trivial: the demo is about the `cli` intent, not about the
 * domain. Layers are auto-discovered from the folders beside this file, and
 * there is no db adapter, no `meta/` and no browser entry — a command needs
 * none of that. Its handlers read their arguments, and the filesystem through
 * `this.platform`.
 */
export default realm(() => ({url: import.meta.url}));
