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
export default realm(() => ({
    url: import.meta.url,
    config: {
        // The layers the `blong-cli` command runs with (D-436): `cli` appears in no entry of
        // `WELL_KNOWN_LAYERS`, so the package that ships a command names what the command needs.
        // `orchestrator` is all of it — the handlers read their arguments and the filesystem and
        // reach no adapter, no gateway and no database, which is why the realm declares nothing else.
        cli: {orchestrator: {}},
        default: {},
    },
}));
