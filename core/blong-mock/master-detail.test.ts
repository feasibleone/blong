/**
 * Master-detail (IModelSpec.details) — verifies that a public model declaring
 * detail entities (e.g. invoice + `line`/`payment`) automatically:
 * - treats each detail as an ARRAY property at the SAME level as the master
 *   record — the model schema has a dedicated key for the master object
 *   (`schema.properties.invoice`) and one sibling array key per detail
 *   (`schema.properties.line`, `schema.properties.payment`), whose
 *   `items.properties` (the detail-row schema) is declared there by the realm,
 * - so the auto `add`/`edit` gateway validation accepts
 *   `{invoice: {...}, line: [...], payment: [...]}` (no manual gateway
 *   override needed),
 * - and gets an editable table card + a tab per detail in the New/Open forms.
 */
import assert from 'node:assert';
import {test} from 'node:test';
import {withDefaults} from './defaults.ts';
import {validation} from './index.ts';

interface IDetailSchema {
    type?: string;
    title?: string;
    widget?: {type?: string; keyField?: string};
    items?: {type?: string; properties?: Record<string, unknown>};
}

test('withDefaults injects sibling detail arrays, cards and tabs for IModelSpec.details', () => {
    const model = withDefaults({
        subject: 'invoice',
        object: 'invoice',
        public: true,
        schema: {
            properties: {
                invoice: {
                    properties: {
                        invoiceName: {title: 'Name'},
                    },
                },
                // Detail arrays are SIBLINGS of the master object — the realm
                // declares the detail-ROW schema (items.properties) here.
                line: {
                    items: {
                        properties: {
                            lineName: {type: 'string'},
                            lineQuantity: {type: 'number'},
                        },
                    },
                },
            },
        },
        details: [{object: 'line'}, {object: 'payment'}],
    });

    const schema = model.schema as unknown as {
        properties: Record<string, IDetailSchema & {properties?: Record<string, unknown>}>;
    };
    const masterProps = schema.properties.invoice.properties as Record<string, unknown>;

    // Sibling array property per detail, SAME level as the master object.
    assert.ok(schema.properties.line, 'injects a line array property sibling of the master object');
    assert.equal(schema.properties.line.type, 'array');
    assert.equal(schema.properties.line.widget?.type, 'table');
    assert.equal(schema.properties.line.widget?.keyField, 'lineId');
    assert.equal(schema.properties.line.items?.type, 'object');
    assert.deepEqual(
        Object.keys(schema.properties.line.items?.properties ?? {}),
        ['lineName', 'lineQuantity'],
        'detail-ROW schema (items.properties) is declared by the realm on the sibling',
    );
    assert.ok(schema.properties.payment, 'injects a payment array property sibling');
    assert.equal(schema.properties.payment.items?.type, 'object');
    assert.ok(
        !('line' in masterProps),
        'master object schema stays clean — no detail array nested under the master record',
    );
    assert.ok(masterProps.invoiceName, 'master fields are preserved');

    // Detail card per detail entity (top-level field path, no master prefix).
    assert.ok(model.cards['details-line'], 'injects a details-line card');
    assert.deepEqual((model.cards['details-line'] as {widgets: string[]}).widgets, ['line']);
    assert.ok(model.cards['details-payment']);

    // Edit layout becomes a tab layout with one tab per detail.
    const edit = model.layouts.edit as {items: Array<{id: string}>};
    assert.ok(Array.isArray(edit.items), 'edit layout uses tabs when details are present');
    assert.deepEqual(
        edit.items.map(i => i.id),
        ['edit', 'details-line', 'details-payment'],
    );
});

test('auto add validation includes sibling detail arrays (no override needed)', () => {
    const validations = validation([
        {
            subject: 'invoice',
            object: 'invoice',
            public: true,
            schema: {
                properties: {
                    invoice: {
                        properties: {invoiceName: {title: 'Name'}},
                    },
                    line: {
                        items: {
                            properties: {
                                lineName: {type: 'string'},
                                lineQuantity: {type: 'number'},
                            },
                        },
                    },
                },
            },
            details: [{object: 'line'}],
        },
    ]);

    const addSchema = validations['invoice.invoice.add']() as unknown as {
        params: {
            required: string[];
            properties: Record<
                string,
                {type?: string; items?: {type?: string; properties?: Record<string, unknown>}}
            >;
        };
    };
    const params = addSchema.params;
    // The master object and the detail arrays are SIBLING top-level params.
    assert.deepEqual(Object.keys(params.properties), ['invoice', 'line']);
    assert.equal(params.properties.line.type, 'array');
    assert.equal(params.properties.line.items?.type, 'object');
    assert.ok(
        params.properties.line.items?.properties?.lineName,
        'line row properties are validated',
    );
    assert.ok(params.required.includes('invoice'));
});
