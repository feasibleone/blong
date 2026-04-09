import type {Meta, StoryObj} from '@storybook/react';
import {within} from '@testing-library/react';
import type {UserEvent} from '@testing-library/user-event';
import {useState} from 'react';
import type {IFormProps} from '../components/Form/index.js';
import {Form} from '../components/Form/index.js';
import type {ICardConfig, IEnrichedSchema} from '../types/widget.js';

type FormArgs = Partial<IFormProps> & {lang?: string};

const meta = {
    title: 'Forms/Form',
    component: Form,
    tags: ['autodocs'],
    parameters: {layout: 'padded'},
} satisfies Meta<FormArgs>;
export default meta;

type Story = Omit<StoryObj<typeof meta>, 'play'> & {
    play?: (ctx: {canvas: ReturnType<typeof within>; userEvent: UserEvent}) => Promise<void>;
};

// ── Coral (Basic / ReadOnly / Loading) ──────────────────────────────────────

const coralSchema: IEnrichedSchema = {
    title: 'Coral Species',
    properties: {
        speciesName: {
            title: 'Species Name',
            type: 'string',
            required: true,
            widget: {type: 'input'},
        },
        scientificName: {title: 'Scientific Name', type: 'string', widget: {type: 'input'}},
        coralType: {
            title: 'Coral Type',
            type: 'string',
            widget: {
                type: 'dropdown',
                options: [
                    {value: 'hard', label: 'Hard Coral'},
                    {value: 'soft', label: 'Soft Coral'},
                    {value: 'black', label: 'Black Coral'},
                ],
            },
        },
        maxDepth: {title: 'Max Depth (m)', type: 'number', widget: {type: 'integer'}},
        endangered: {title: 'Endangered', type: 'boolean', widget: {type: 'boolean'}},
        description: {title: 'Description', type: 'string', widget: {type: 'textArea'}},
    },
    required: ['speciesName'],
};

export const Basic: Story = {
    render: () => {
        const [value, setValue] = useState<Record<string, unknown>>({
            speciesName: 'Brain Coral',
            coralType: 'hard',
        });
        return (
            <Form
                schema={coralSchema}
                value={value}
                onChange={setValue}
            />
        );
    },
};

export const ReadOnly: Story = {
    args: {
        schema: coralSchema,
        value: {
            speciesName: 'Staghorn Coral',
            scientificName: 'Acropora cervicornis',
            coralType: 'hard',
            maxDepth: 30,
        },
        readOnly: true,
    },
};

export const Loading: Story = {
    args: {
        schema: coralSchema,
        loading: true,
    },
};

// ── Shared input schema ──────────────────────────────────────────────────────

const inputWidgetProperties: IEnrichedSchema['properties'] = {
    // ── left column ──
    input: {title: 'Input', widget: {type: 'input'}},
    password: {title: 'Password', widget: {type: 'password'}},
    text: {title: 'Text', widget: {type: 'textArea'}},
    mask: {title: 'Mask', widget: {type: 'mask', mask: '***.***.***.***'}},
    chips: {title: 'Chips', widget: {type: 'chips'}},
    autocomplete: {title: 'Autocomplete', widget: {type: 'autocomplete'}},
    boolean: {title: 'Boolean', widget: {type: 'boolean'}},
    date: {title: 'Date', widget: {type: 'date'}},
    time: {title: 'Time', widget: {type: 'time'}},
    dateTime: {title: 'Date Time', widget: {type: 'dateTime'}},
    dateRange: {title: 'Date Range', widget: {type: 'dateRange'}},
    number: {title: 'Number', widget: {type: 'number'}},
    currency: {title: 'Currency', widget: {type: 'currency'}},
    integer: {title: 'Integer', widget: {type: 'integer'}},
    // ── center column ──
    image: {title: 'Image', widget: {type: 'image'}},
    imageUpload: {title: 'Image Upload', widget: {type: 'imageUpload'}},
    file: {title: 'File', widget: {type: 'file'}},
    dropdown: {title: 'Dropdown', widget: {type: 'dropdown', dropdown: 'dropdown'}},
    dropdownTree: {
        title: 'Dropdown Tree',
        widget: {
            type: 'dropdownTree',
            options: [
                {
                    key: '1',
                    label: 'Europe',
                    children: [
                        {key: '1-1', label: 'France'},
                        {key: '1-2', label: 'Germany'},
                    ],
                },
                {
                    key: '2',
                    label: 'Asia',
                    children: [
                        {key: '2-1', label: 'Japan'},
                        {key: '2-2', label: 'China'},
                    ],
                },
            ],
        },
    },
    multiSelect: {
        title: 'Multi Select',
        widget: {type: 'multiSelect', dropdown: 'multiSelect'},
    },
    multiSelectTree: {
        title: 'Multi Select Tree',
        widget: {
            type: 'multiSelectTree',
            options: [
                {
                    key: '1',
                    label: 'Europe',
                    children: [
                        {key: '1-1', label: 'France'},
                        {key: '1-2', label: 'Germany'},
                    ],
                },
                {
                    key: '2',
                    label: 'Asia',
                    children: [
                        {key: '2-1', label: 'Japan'},
                        {key: '2-2', label: 'China'},
                    ],
                },
            ],
        },
    },
    select: {
        title: 'Select',
        widget: {type: 'select', dropdown: 'select'},
    },
    table: {
        title: 'Table',
        widget: {type: 'table', columns: ['name', 'value']},
        items: {
            properties: {
                name: {title: 'Name'},
                value: {title: 'Value'},
            },
        },
    },
    // ── right column ──
    selectTable: {
        title: 'Select Table',
        widget: {type: 'selectTable', dropdown: 'dropdown', selectionMode: 'single'},
        items: {properties: {label: {title: 'Currency'}}},
    },
    multiSelectPanel: {
        title: 'Multi Select Panel',
        widget: {type: 'multiSelectPanel', dropdown: 'select'},
    },
    multiSelectTreeTable: {
        title: 'Multi Select Tree Table',
        widget: {
            type: 'multiSelectTreeTable',
            options: [
                {
                    key: '1',
                    label: 'Europe',
                    children: [
                        {key: '1-1', label: 'France'},
                        {key: '1-2', label: 'Germany'},
                    ],
                },
                {
                    key: '2',
                    label: 'Asia',
                    children: [
                        {key: '2-1', label: 'Japan'},
                        {key: '2-2', label: 'China'},
                    ],
                },
            ],
        },
    },
};

const inputSchema: IEnrichedSchema = {
    properties: {
        /** All widget fields nested under 'input' — accessed via dot-notation e.g. 'input.input' */
        input: {
            properties: inputWidgetProperties,
        },
        /** Top-level array property used by the Table story — items share the same widget property set */
        table: {
            type: 'array',
            title: '',
            widget: {type: 'table'},
            items: {
                properties: inputWidgetProperties,
            },
        },
    },
};

const inputCards: Record<string, ICardConfig> = {
    left: {
        label: undefined,
        className: 'xl:col-4',
        widgets: [
            'input.input',
            'input.password',
            'input.text',
            'input.mask',
            'input.chips',
            'input.autocomplete',
            'input.boolean',
            'input.date',
            'input.time',
            'input.dateTime',
            'input.dateRange',
            'input.number',
            'input.currency',
            'input.integer',
        ],
    },
    center: {
        label: undefined,
        className: 'xl:col-4',
        widgets: [
            'input.image',
            'input.imageUpload',
            'input.file',
            'input.dropdown',
            'input.dropdownTree',
            'input.multiSelect',
            'input.multiSelectTree',
            'input.select',
            'input.table',
        ],
    },
    right: {
        label: undefined,
        className: 'xl:col-4',
        widgets: ['input.selectTable', 'input.multiSelectPanel', 'input.multiSelectTreeTable'],
    },
    table: {
        label: undefined,
        className: 'col-12',
        widgets: [
            {
                name: 'table',
                id: 'table1',
                widgets: [
                    'input',
                    'password',
                    'text',
                    'mask',
                    'boolean',
                    'date',
                    'time',
                    'dateTime',
                ],
            },
            {
                name: 'table',
                id: 'table2',
                widgets: [
                    'number',
                    'currency',
                    'integer',
                    'select',
                    'chips',
                    'autocomplete',
                    'dateRange',
                ],
            },
            {
                name: 'table',
                id: 'table3',
                widgets: ['dropdown', 'dropdownTree', 'multiSelect', 'multiSelectTree'],
            },
            {
                name: 'table',
                id: 'table4',
                widgets: ['selectTable', 'multiSelectPanel', 'multiSelectTreeTable'],
            },
        ],
    },
};

const inputDropdowns = {
    dropdown: [
        {value: 1, label: 'EUR'},
        {value: 2, label: 'USD'},
        {value: 3, label: 'BGN'},
        {value: 4, label: 'IQD'},
    ],
    multiSelect: [
        {value: 1, label: 'Rome'},
        {value: 2, label: 'Cairo'},
        {value: 3, label: 'Athens'},
    ],
    select: [
        {value: 1, label: 'One'},
        {value: 2, label: 'Two'},
        {value: 3, label: 'Three'},
    ],
};

// ── Input — widget showcase ──────────────────────────────────────────────────

export const Input: Story = {
    render: () => {
        const [value, setValue] = useState<Record<string, unknown>>({});
        return (
            <Form
                schema={inputSchema}
                cards={inputCards}
                layouts={{default: ['left', 'center', 'right']}}
                dropdowns={inputDropdowns}
                value={value}
                onChange={setValue}
            />
        );
    },
};

Input.play = async ({canvas, userEvent}) => {
    const body = within(document.body);
    const findId = async (role: string, id: string) =>
        canvas.findByRole(role as never, {
            name: (_: string, el: Element) => (el as HTMLElement).id === id,
        });
    const type = async (role: string, id: string, text: string) => {
        const el = await findId(role, id);
        await userEvent.clear(el);
        await userEvent.type(el, text);
    };

    await new Promise(r => setTimeout(r, 100));

    // ── left column ─────────────────────────────────────────────────────────
    await type('textbox', 'input-input', 'input');
    await type('textbox', 'input-password', 'password');
    await type('textbox', 'input-text', 'text');
    // await type('textbox', 'input-mask', '192.168.000.001');
    const chipsEl = await findId('textbox', 'input-chips');
    await userEvent.clear(chipsEl);
    await userEvent.type(chipsEl, 'tag1');
    await userEvent.keyboard('{Enter}');
    await type('combobox', 'input-autocomplete', 'auto');
    await userEvent.click(await canvas.findByLabelText('Boolean'));
    await type('textbox', 'input-date', '01/31/2022');
    await type('textbox', 'input-time', '20:00');
    await type('textbox', 'input-dateTime', '01/31/2022 20:00:00');
    await type('spinbutton', 'input-number', '1234567890');
    await type('spinbutton', 'input-currency', '1234567.89');
    await type('spinbutton', 'input-integer', '1234567890');

    // ── center column ────────────────────────────────────────────────────────
    await userEvent.click(canvas.getByTestId('input-dropdown'));
    await userEvent.click(await body.findByRole('option', {name: 'EUR'}));
    await userEvent.click(canvas.getByTestId('input-dropdownTree'));
    await userEvent.click((await body.findAllByRole('treeitem' as never))[0]);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByTestId('input-multiSelect'));
    await userEvent.click(await body.findByRole('option', {name: 'Rome'}));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByTestId('input-multiSelectTree'));
    await userEvent.click((await body.findAllByRole('treeitem' as never))[0]);
    await userEvent.keyboard('{Escape}');
    within(canvas.getByTestId('input-select') as HTMLElement)
        .getAllByRole('button' as never)[0]
        .click();
    await userEvent.click(canvas.getByTestId('input-table-addButton'));
    await new Promise(r => setTimeout(r, 200));
    await type('textbox', 'input-table-0-name', 'name');
    await type('textbox', 'input-table-0-value', 'value');

    // ── right column ────────────────────────────────────────────────────────
    await userEvent.click(
        within(canvas.getByTestId('input-selectTable') as HTMLElement).getAllByRole(
            'row' as never,
        )[1],
    );
    within(canvas.getByTestId('input-multiSelectPanel') as HTMLElement)
        .getAllByRole('option' as never)[0]
        .click();
    within(canvas.getByTestId('input-multiSelectTreeTable') as HTMLElement)
        .getAllByRole('checkbox' as never)[1]
        .click();

    await new Promise(r => setTimeout(r, 300));
};

export const InputBG: Story = {
    ...Input,
    args: {lang: 'bg'} as FormArgs,
};
InputBG.play = Input.play;

// ── Table — four sub-tables showing all widget types as columns ──────────────

export const Table: Story = {
    render: () => {
        const [value, setValue] = useState<Record<string, unknown>>({});
        return (
            <Form
                schema={inputSchema}
                cards={inputCards}
                layouts={{default: ['table']}}
                dropdowns={inputDropdowns}
                value={value}
                onChange={setValue}
            />
        );
    },
};

Table.play = async ({canvas}) => {
    const addRow = (tableId: string) =>
        (canvas.getByTestId(`${tableId}-addButton`) as HTMLElement).click();
    const openEdit = (tableId: string) =>
        within(canvas.getByTestId(tableId) as HTMLElement)
            .getAllByRole('button' as never)
            .filter((el: Element) => (el as HTMLElement).getAttribute('name') === 'row-edit')
            .pop()
            ?.click();

    await new Promise(r => setTimeout(r, 100));
    addRow('table1');
    await new Promise(r => setTimeout(r, 200));
    openEdit('table1');
    openEdit('table2');
    openEdit('table3');
    openEdit('table4');
    await new Promise(r => setTimeout(r, 300));
};

export const TableBG: Story = {
    ...Table,
    args: {lang: 'bg'} as FormArgs,
};
TableBG.play = Table.play;

// ── Diff — side-by-side JSON comparison ─────────────────────────────────────

const diffPrevious = {
    'General Info': {
        'First name': 'Super',
        'Last name': 'Admin',
        'Business Unit': 'Central office',
        'Lock Status': true,
    },
    Credentials: {
        'Set Username': 'user',
        'Override User Access Policy': 'Policy 2',
    },
    'External Credentials': [{'External System': 'cbs', 'User Type': 'login', Username: 'user'}],
};

const diffCurrent = {
    'General Info': {
        'First name': 'Super',
        'Last name': 'Admin',
        'Business Unit': null,
        'Lock Status': false,
        Language: 'English',
    },
    Credentials: {
        'Set Username': 'user',
        'Override User Access Policy': 'Policy1',
    },
    'External Credentials': [
        {'External System': null, 'User Type': 'login', Username: 'login', Active: true},
        'test:test',
    ],
};

const diffSchema: IEnrichedSchema = {
    properties: {
        previous: {title: '', widget: {type: 'json'}},
        current: {title: '', widget: {type: 'json'}},
    },
};

const diffCards: Record<string, ICardConfig> = {
    previous: {label: 'Previous', className: 'xl:col-6', widgets: ['previous']},
    current: {label: 'Current', className: 'xl:col-6', widgets: ['current']},
};

export const Diff: Story = {
    render: () => {
        const [value] = useState({previous: diffPrevious, current: diffCurrent});
        return (
            <Form
                schema={diffSchema}
                cards={diffCards}
                layouts={{default: ['previous', 'current']}}
                value={value}
                readOnly
            />
        );
    },
};

export const DiffBG: Story = {
    ...Diff,
    args: {lang: 'bg'} as FormArgs,
};
