import {declare} from '@feasibleone/lukaot';

/**
 * What the resource realm reports while it seeds the data a deployment ships (`@@D-896`).
 *
 * Both names exist because a seed is the one place the framework writes over rows a person may have
 * edited: a seed that left a hand edit alone is not a failure, but it is a fact an operator needs to
 * see, and it is the only record that says which language or which resource was kept.
 */
export default declare({
    log: {
        coreLabelSeedKeptEdits: {
            level: 'warn',
            message: 'label seed kept {skipped} hand-edited {language} label(s) and replaced the rest',
            mtid: 'event',
            method: 'core.label.seed',
        },
        coreTranslationSeedSkipped: {
            level: 'warn',
            message:
                'translation seed {language}: kept {skipped} hand-edited, skipped {missing} unknown resource(s){examples}',
            mtid: 'event',
            method: 'core.translation.seed',
        },
    },
});
