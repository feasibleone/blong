import {ModuleApi, realm} from '@feasibleone/blong';
import pkg from './package.json';

import mock from './adapter/mock.js';
import script from './adapter/script.js';
import errors from './error/error.js';

import subjectAge from './orchestrator/subject/subjectAge.js';
import subjectNumberSum from './orchestrator/subject/subjectNumberSum.js';
import sum from './orchestrator/subject/sum.js';

import validate1 from './orchestrator/subject/~.schema.js';

export default realm(blong => ({
    pkg,
    config: {
        default: {},
        dev: {
            test: true,
        },
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
    },
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: [
        function error(layer: ModuleApi) {
            return layer.error(errors);
        },
        function adapter(layer: ModuleApi) {
            return layer.mock(mock);
        },
        function adapter(layer: ModuleApi) {
            return layer.script(script(layer));
        },
        function orchestrator(layer: ModuleApi) {
            // return layer.subjectDispatch(subjectDispatch(layer));
        },
        function orchestrator(layer: ModuleApi) {
            return layer
                .subject(import('./orchestrator/subject/age.js'))
                .subject([sum, subjectNumberSum, subjectAge])
                .subject(import('./orchestrator/subject/subjectObjectSendReceive.js'));
        },
        function gateway(layer: ModuleApi) {
            return layer.validation([validate1], 'subject');
        },
        function test(layer: ModuleApi) {
            return layer.feature('');
        },
        function test(layer: ModuleApi) {
            return layer.sequence(function add() {
                return [
                    '',
                    {
                        name: '',
                        method: '',
                    },
                ];
            });
        },
        function test() {
            return function ui(layer: ModuleApi) {
                return layer.sequence(function playwright() {
                    return [
                        {
                            params: {__dirname},
                            name: 'utCore.playwright',
                            result() {},
                        },
                        layer.config?.type === 'unit' && 'portal.playwright.run',
                    ];
                });
            };
        },
    ],
}));
