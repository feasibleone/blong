import {orchestrator} from '@feasibleone/blong';

/** Dispatch port for the `test.run.*` methods; active only under the test intents. */
export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    validation: blong.type.Object({
        namespace: blong.type.String(),
        imports: blong.type.Array(blong.type.Unknown()),
        validations: blong.type.Array(blong.type.String()),
    }),
    activation: {
        integration: {
            namespace: 'test',
            imports: ['testRealm.testRun', /\.test$/],
            validations: [],
        },
        'test-ui': {namespace: 'test', imports: ['testRealm.testRun', /\.test$/], validations: []},
    },
}));
