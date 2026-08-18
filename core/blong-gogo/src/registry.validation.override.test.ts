/**
 * A3.4 — Gateway validation override precedence.
 *
 * Verifies that an explicit realm gateway validation file
 * (`gateway/<subject>/<method>.ts`) REPLACES the auto-generated
 * `subject.validation` schema for the same method, while the model stays
 * `public: true` and unrelated methods keep the auto validations.
 *
 * Regression guard: previously `Registry._validations()` merged the auto and
 * explicit schemas with `ut-function.merge`, which (a) did not reliably give
 * the explicit file precedence and (b) corrupts symbol-keyed TypeBox Kind
 * markers on nested schemas (e.g. a `details` array), producing "Unknown type"
 * validation failures at the gateway.
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';
import Registry from './Registry.ts';

// Minimal mocks — `_validations()` only touches methods/validations plus the
// pieces `_createHandlers` needs (error, platform, gateway, remote, apiSchema).
const log = {logger: () => ({info() {}, error() {}, warn() {}, debug() {}})} as never;
const error = {register: () => () => undefined} as never;
const platform = {context: {}, timing: () => undefined} as never;
const gateway = {} as never;
const remote = {remote: () => ({})} as never;
const rpcServer = {} as never;
const local = {} as never;
const resolution = {} as never;
const watch = {} as never;
const apiSchema = {} as never;

interface ISchema {
    params: {type: string; properties?: Record<string, unknown>; required?: string[]};
    result: unknown;
}

// Auto-generated `add` schema (blong-mock `validation()` for a public model) —
// a broad object schema with required NotNull fields (`invoiceId`, …).
const autoAddSchema: ISchema = {
    params: {
        type: 'object',
        properties: {
            invoice: {
                type: 'object',
                additionalProperties: false,
                required: ['invoiceId', 'invoiceName', 'invoiceStatus', 'invoiceTotal'],
                properties: {
                    invoiceId: {type: 'integer'},
                    invoiceName: {type: 'string'},
                    invoiceStatus: {type: 'string'},
                    invoiceTotal: {type: 'number'},
                },
            },
        },
    },
    result: {type: 'unknown'},
};

// Auto-generated `find` schema for a different (unrelated) method.
const autoFindSchema: ISchema = {
    params: {type: 'object', properties: {paging: {type: 'object'}}},
    result: {type: 'unknown'},
};

// Explicit gateway override (kopi `$subject$ObjectAdd` pattern) — broader
// params (extra optional `details` array) + narrower required fields.
const explicitAddSchema: ISchema = {
    params: {
        type: 'object',
        properties: {
            invoice: {
                type: 'object',
                required: ['invoiceName', 'invoiceStatus'],
                properties: {
                    invoiceName: {type: 'string'},
                    invoiceStatus: {type: 'string'},
                },
            },
            details: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['lineName', 'lineQuantity'],
                    properties: {lineName: {type: 'string'}, lineQuantity: {type: 'number'}},
                },
            },
        },
    },
    result: {type: 'object'},
};

function makeRegistry(): Registry {
    return new Registry(
        {},
        {log, error, rpcServer, remote, gateway, local, resolution, watch, apiSchema, platform},
    );
}

describe('Registry validation override precedence', () => {
    it('later explicit gateway validation replaces the auto subject.validation schema for the same method', async () => {
        const registry = makeRegistry();

        // `subject.validation` registers FIRST (blong-server `srv` layer).
        registry.methods.set('subject.validation', [
            async (params: {local: object}) => {
                const local = params.local as Record<string, unknown>;
                const add = () => autoAddSchema;
                Object.defineProperty(add, 'name', {value: 'invoice.invoice.add'});
                const find = () => autoFindSchema;
                Object.defineProperty(find, 'name', {value: 'invoice.invoice.find'});
                local['invoice.invoice.add'] = add;
                local['invoice.invoice.find'] = find;
            },
        ]);

        // The realm's explicit gateway file registers LATER.
        registry.methods.set('invoice.gateway.validation', [
            async (params: {local: object}) => {
                const local = params.local as Record<string, unknown>;
                const add = function invoiceInvoiceAdd() {
                    return explicitAddSchema;
                };
                local[add.name] = add;
            },
        ]);

        const validations = await (
            registry as unknown as {
                _validations: () => Promise<Record<string, ISchema>>;
            }
        )._validations();

        const overridden = validations['invoice.invoice.add'];
        // The explicit schema WINS for the overridden method (identity — no merge).
        assert.strictEqual(overridden, explicitAddSchema, 'explicit schema replaces the auto one');
        // Broader params: the optional `details` array is accepted.
        assert.ok(
            (overridden.params.properties as Record<string, unknown>)['details'],
            'override accepts an extra optional `details` payload',
        );
        // Narrower required fields: auto-required NotNull fields do not block.
        assert.deepStrictEqual(
            (overridden.params.properties as Record<string, {required?: string[]}>).invoice
                .required,
            ['invoiceName', 'invoiceStatus'],
            'override required fields win (auto-required fields not enforced)',
        );
        assert.ok(
            !(
                'invoiceId' in
                ((overridden.params.properties as Record<string, unknown>).invoice as object)
            ),
            'auto-only fields do not leak into the override',
        );

        // Unrelated methods keep the auto validation.
        assert.strictEqual(
            validations['invoice.invoice.find'],
            autoFindSchema,
            'unrelated methods keep the auto-generated validation',
        );
    });

    it('last registered validation wins deterministically per method', async () => {
        const registry = makeRegistry();
        const firstSchema: ISchema = {
            params: {type: 'object', properties: {a: {type: 'string'}}},
            result: {},
        };
        const secondSchema: ISchema = {
            params: {type: 'object', properties: {b: {type: 'number'}}},
            result: {},
        };
        registry.methods.set('one.validation', [
            async (params: {local: object}) => {
                const local = params.local as Record<string, unknown>;
                const fn = function subjectObjectAdd() {
                    return firstSchema;
                };
                local[fn.name] = fn;
            },
        ]);
        registry.methods.set('two.validation', [
            async (params: {local: object}) => {
                const local = params.local as Record<string, unknown>;
                const fn = function subjectObjectAdd() {
                    return secondSchema;
                };
                local[fn.name] = fn;
            },
        ]);
        const validations = await (
            registry as unknown as {
                _validations: () => Promise<Record<string, ISchema>>;
            }
        )._validations();
        assert.strictEqual(
            validations['subject.object.add'],
            secondSchema,
            'the later-registered validation wins for the same method',
        );
    });
});
