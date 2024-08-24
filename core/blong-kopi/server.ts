import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        db: blong.type.Object({}),
    }),
    children: ['./error', './adapter', './orchestrator', './gateway'],
    config: {
        default: {
            db: {
                namespace: 'db/$subject',
                imports: '$subject.db',
            },
            $subjectDispatch: {
                destination: 'db',
                namespace: ['$subject'],
                imports: ['$subject.$object'],
                validations: ['$subject.$object.validation'],
            },
        },
        dev: {},
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
    },
}));
