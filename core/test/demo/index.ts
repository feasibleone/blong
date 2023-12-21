
import { realm } from '@feasibleone/blong';
import pkg from './package.json';

import mock from './adapter/mock';
import script from './adapter/script';
import errors from './error/error';
import subjectDispatch from './orchestrator/subjectDispatch';

import subjectNumberSum from './orchestrator/subject/subjectNumberSum';
import subjectObjectPredicate2 from './orchestrator/subject/subjectObjectPredicate2';
import sum from './orchestrator/subject/sum';

import validate1 from './gateway/subject.validation/subjectNumberSum';
import validate2 from './gateway/subject.validation/subjectObjectPredicate2';

export default realm(fo => ({
    pkg,
    default: {},
    dev: {
        test: true
    },
    microservice: {
        error: true,
        adapter: true,
        orchestrator: true,
        gateway: true
    },
    validation: fo.Type.Object({}),
    children: [
        function error(layer) { return layer.error(errors); },
        function adapter(layer) { return layer.mock(mock); },
        function adapter(layer) { return layer.script(script(layer)); },
        function orchestrator(layer) { return layer.subjectDispatch(subjectDispatch(layer)); },
        function orchestrator(layer) {
            return layer
                .subject(import('./orchestrator/subject/subjectObjectPredicate'))
                .subject([
                    sum,
                    subjectNumberSum,
                    subjectObjectPredicate2
                ])
                .subject(import('./orchestrator/subject/subjectObjectSendReceive'));
        },
        function gateway(layer) {
            return layer.validation([
                validate1,
                validate2
            ], 'subject');
        },
        function test(layer) { return layer.feature(''); },
        function test(layer) {
            return layer.sequence(function add() {
                return [
                    '',
                    {
                        name: '',
                        method: ''
                    }
                ];
            });
        },
        function test() {
            return function ui(fo) {
                return fo.sequence(function playwright() {
                    return [
                        {
                            params: {__dirname},
                            name: 'utCore.playwright',
                            result() {}
                        },
                        fo.config?.type === 'unit' && 'portal.playwright.run'
                    ];
                });
            };
        }
    ]
}));
