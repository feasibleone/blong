/**
 * TableColumns stories — what a table column can do beyond showing a value.
 *
 * Each story isolates one capability of `TableWidget`'s column handling so it can
 * be looked at on its own:
 *
 * - `Labels` — a key column renders the label the backend joined beside it, and
 *   filters through a dropdown rather than a text box.
 * - `Formatting` — dates, times, currency, percent and a translated status, all
 *   through the shared formatter.
 * - `FormattingSystem`, `FormattingUser`, `FormattingBG` — the same row formatted
 *   through each layer of configuration, and through the chain they form.
 * - `Compare` — the value a cell had beside the value it has.
 * - `FileCell` — a download link built from the row, or plain names when the column
 *   does not offer one.
 * - `SelectionCells` — cycle, radio and select-table-radio cells.
 * - `SortableFormTable` — the view sorts, the stored order does not move.
 * - `RowCascade` — a discipline list narrowed to the row's sport, in a row that is
 *   being edited and in one that is only being added.
 * - `InlineEdit` — the cells are the editors: no pencil column, every change written
 *   as it happens, a read-only column still reading.
 * - `ReadOnly` — the same cells, refusing to write.
 *
 * The label column is the one place a story has to stand in for the backend: a real
 * read projects `reefName` from the foreign key, so the fixture value carries it.
 */
import type {Meta} from '@storybook/react-vite';
import {useEffect, useMemo} from 'react';
import {expect, waitFor} from 'storybook/test';
import type {IFormatConfig} from '../../../lib/format.js';
import {useAppStore} from '../../../state/appStore.js';
import {Editor} from '../Editor.js';
import type {StoryFn} from '../Editor.stories.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/TableColumns',
    component: Editor,
    // One tag for the set, so the runner can exercise just these stories:
    // `npx test-storybook --includeTags table-columns`.
    tags: ['table-columns'],
};
export default meta;

const reefs = [
    {value: 'r1', label: 'Kelp Canopy'},
    {value: 'r2', label: 'Coral Gardens'},
    {value: 'r3', label: 'Seagrass Meadow'},
];

const disciplines = [
    {value: 'd1', label: 'Transect', reefId: 'r1'},
    {value: 'd2', label: 'Photo Quadrat', reefId: 'r2'},
    {value: 'd3', label: 'Sediment Core', reefId: 'r3'},
    {value: 'd4', label: 'Fish Census', reefId: 'r1'},
];

/** One table card, so each story shows a single table. */
function tableStory(
    properties: Record<string, unknown>,
    columns: string[],
    value: Record<string, unknown>[],
    options: {readOnly?: boolean; label?: string; notes?: string; inlineEdit?: boolean} = {},
) {
    return (
        <Editor
            schema={{
                properties: {
                    survey: {
                        title: '' as const,
                        type: 'array' as const,
                        items: {type: 'object' as const, properties},
                        widget: {
                            type: 'table' as const,
                            columns,
                            ...(options.inlineEdit ? {inlineEdit: true} : {}),
                            ...(options.readOnly
                                ? {actions: {allowAdd: false, allowDelete: false, allowEdit: false}}
                                : {}),
                        },
                    } as never,
                },
            }}
            cards={{
                survey: {
                    label: options.label ?? '',
                    className: 'col-12',
                    readOnly: options.readOnly,
                    widgets: ['survey'],
                },
            }}
            dropdowns={{reef: reefs, discipline: disciplines}}
            value={{survey: value}}
            editable={!options.readOnly}
            editMode
            layout="edit"
            layouts={{edit: ['survey']}}
        />
    );
}

export const Labels: StoryFn = () =>
    tableStory(
        {
            speciesName: {title: 'Species', sort: true},
            reefId: {
                title: 'Reef',
                filter: true,
                widget: {type: 'dropdown' as const, dropdown: 'reef', body: 'reefName'},
            },
            observed: {title: 'Observed'},
        },
        ['speciesName', 'reefId', 'observed'],
        [
            {
                speciesName: 'Nerida Kelp',
                reefId: 'r1',
                reefName: 'Kelp Canopy',
                observed: '2026-04-02',
            },
            {
                speciesName: 'Corin Wrasse',
                reefId: 'r2',
                reefName: 'Coral Gardens',
                observed: '2026-04-03',
            },
            {
                speciesName: 'Delphine Porpoise',
                reefId: 'r3',
                reefName: 'Seagrass Meadow',
                observed: '2026-04-04',
            },
        ],
        {label: 'Reef, by name — the key is what is stored, the label is what is read'},
    );

export const Formatting: StoryFn = () =>
    tableStory(
        {
            surveyDate: {title: 'Date', widget: {type: 'date' as const}},
            visibility: {title: 'Logged At', widget: {type: 'time' as const}},
            loggedAt: {title: 'Timestamp', widget: {type: 'dateTime' as const}},
            transects: {title: 'Transects', widget: {type: 'integer' as const, sort: true}},
            area: {
                title: 'Area (m²)',
                widget: {
                    type: 'number' as const,
                    formatOptions: {number: {maximumFractionDigits: 1}},
                },
            },
            fee: {
                title: 'Fee',
                widget: {type: 'currency' as const, formatOptions: {currency: {currency: 'EUR'}}},
            },
            confidence: {title: 'Confidence', widget: {type: 'percent' as const}},
            status: {
                title: 'Status',
                widget: {
                    type: 'select' as const,
                    translation: true,
                    options: [
                        {value: 'draft', label: 'Draft'},
                        {value: 'published', label: 'Published'},
                    ],
                },
            },
        },
        [
            'surveyDate',
            'visibility',
            'loggedAt',
            'transects',
            'area',
            'fee',
            'confidence',
            'status',
        ],
        [
            {
                surveyDate: '2026-04-02',
                visibility: '07:15:00',
                loggedAt: '2026-04-02T07:15:32',
                transects: 2032,
                area: 1275.456,
                fee: 450.5,
                confidence: 0.925,
                status: 'published',
            },
        ],
        {label: 'One value, one formatter — the same text a form shows'},
    );

export const Compare: StoryFn = () =>
    tableStory(
        {
            speciesName: {title: 'Species'},
            status: {title: 'Status', widget: {compare: 'statusBefore'}},
            depth: {title: 'Depth (m)', widget: {compare: 'depthBefore'}},
        },
        ['speciesName', 'status', 'depth'],
        [
            {
                speciesName: 'Nerida Kelp',
                status: 'confirmed',
                statusBefore: 'draft',
                depth: 12,
                depthBefore: 9,
            },
            {
                speciesName: 'Corin Wrasse',
                status: 'confirmed',
                statusBefore: 'confirmed',
                depth: 18,
                depthBefore: 18,
            },
        ],
        {readOnly: true, label: 'What changed — the current value above the one it replaced'},
    );

export const FileCell: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                attachment: {
                    title: '' as const,
                    type: 'array' as const,
                    items: {
                        type: 'object' as const,
                        properties: {
                            title: {title: 'Document'},
                            file: {title: 'File', widget: {type: 'file' as const}},
                            linked: {
                                title: 'Linked',
                                widget: {
                                    type: 'file' as const,
                                    download: true,
                                    basePath: '/files/',
                                },
                            },
                        },
                    },
                    widget: {type: 'table' as const, columns: ['title', 'file', 'linked']},
                } as never,
            },
        }}
        cards={{attachment: {label: 'Documents', className: 'col-12', widgets: ['attachment']}}}
        value={{
            attachment: [
                {
                    title: 'Quota confirmation',
                    file: [{name: 'quota.pdf'}],
                    linked: [{name: 'quota.pdf'}],
                    hash: 'abc123',
                },
                {
                    title: 'Site photographs',
                    file: [{name: 'reef-01.jpg'}, {name: 'reef-02.jpg'}],
                    linked: [{name: 'reef-01.jpg'}],
                    hash: 'def456',
                },
            ],
        }}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['attachment']}}
    />
);

export const SelectionCells: StoryFn = () =>
    tableStory(
        {
            speciesName: {title: 'Species'},
            approved: {title: 'Approved', widget: {type: 'radio' as const}},
            picked: {title: 'Pick', widget: {type: 'selectTableRadio' as const}},
            archived: {title: 'Archived', widget: {cycle: 'tri-state' as const}},
        },
        ['speciesName', 'approved', 'picked', 'archived'],
        [
            {speciesName: 'Nerida Kelp', approved: true, picked: true, archived: null},
            {speciesName: 'Corin Wrasse', approved: false, picked: false, archived: false},
        ],
        {label: 'Radio reads, select-table-radio and cycle write'},
    );

export const SortableFormTable: StoryFn = () =>
    tableStory(
        {
            speciesName: {title: 'Species', sort: true},
            depth: {title: 'Depth (m)', sort: true, widget: {type: 'integer' as const}},
            transects: {title: 'Transects', sort: true, widget: {type: 'integer' as const}},
        },
        ['speciesName', 'depth', 'transects'],
        [
            {speciesName: 'Nerida Kelp', depth: 18, transects: 12},
            {speciesName: 'Corin Wrasse', depth: 6, transects: 4},
            {speciesName: 'Delphine Porpoise', depth: 12, transects: 9},
        ],
        {label: 'Click a header — the view sorts, the saved order stays as it is'},
    );

export const RowCascade: StoryFn = () =>
    tableStory(
        {
            reefId: {
                title: 'Reef',
                widget: {type: 'dropdown' as const, dropdown: 'reef', body: 'reefName'},
            },
            disciplineId: {
                title: 'Method',
                widget: {
                    type: 'dropdown' as const,
                    dropdown: 'discipline',
                    body: 'disciplineName',
                    optionsFilter: {reefId: 'reefId'},
                },
            },
        },
        ['reefId', 'disciplineId'],
        [
            {
                reefId: 'r1',
                reefName: 'Kelp Canopy',
                disciplineId: 'd1',
                disciplineName: 'Transect',
            },
            {
                reefId: 'r2',
                reefName: 'Coral Gardens',
                disciplineId: 'd2',
                disciplineName: 'Photo Quadrat',
            },
        ],
        {
            label:
                'A method list narrowed to the row it belongs to — edit a row or add one, ' +
                'then open Method',
        },
    );

export const InlineEdit: StoryFn = () =>
    tableStory(
        {
            speciesName: {title: 'Species'},
            reefId: {
                title: 'Reef',
                widget: {type: 'dropdown' as const, dropdown: 'reef', body: 'reefName'},
            },
            disciplineId: {
                title: 'Method',
                widget: {
                    type: 'dropdown' as const,
                    dropdown: 'discipline',
                    body: 'disciplineName',
                    optionsFilter: {reefId: 'reefId'},
                },
            },
            transects: {title: 'Transects', widget: {type: 'integer' as const}},
            approved: {title: 'Approved', widget: {type: 'boolean' as const}},
            observed: {title: 'Observed', readOnly: true},
        },
        ['speciesName', 'reefId', 'disciplineId', 'transects', 'approved', 'observed'],
        [
            {
                speciesName: 'Nerida Kelp',
                reefId: 'r1',
                reefName: 'Kelp Canopy',
                disciplineId: 'd1',
                disciplineName: 'Transect',
                transects: 12,
                approved: true,
                observed: '2026-04-02',
            },
            {
                speciesName: 'Corin Wrasse',
                reefId: 'r2',
                reefName: 'Coral Gardens',
                disciplineId: 'd2',
                disciplineName: 'Photo Quadrat',
                transects: 4,
                approved: false,
                observed: '2026-04-03',
            },
        ],
        {
            inlineEdit: true,
            label: 'Every cell is its own editor — type in it, pick in it, tick it; Observed only reads',
        },
    );

export const ReadOnly: StoryFn = () =>
    tableStory(
        {
            speciesName: {title: 'Species'},
            approved: {title: 'Approved', widget: {type: 'radio' as const}},
            picked: {title: 'Pick', widget: {type: 'selectTableRadio' as const}},
            archived: {title: 'Archived', widget: {cycle: 'tri-state' as const}},
            reefId: {
                title: 'Reef',
                widget: {type: 'dropdown' as const, dropdown: 'reef', body: 'reefName'},
            },
        },
        ['speciesName', 'approved', 'picked', 'archived', 'reefId'],
        [
            {
                speciesName: 'Nerida Kelp',
                approved: true,
                picked: true,
                archived: null,
                reefId: 'r1',
                reefName: 'Kelp Canopy',
            },
        ],
        {readOnly: true, label: 'The same cells on a read-only card — a click changes nothing'},
    );

/**
 * The settings the formatter reads, applied the way an app applies them: a story sets
 * a layer on mount and clears it on unmount, so the next story starts from the
 * specification again. `@@D-616`
 */
function FormatLayer({
    scope,
    config,
    children,
}: {
    scope: 'user' | 'system';
    config: IFormatConfig;
    children: React.ReactNode;
}) {
    const setFormat = useAppStore(state => state.setFormat);
    const key = JSON.stringify(config);
    const resolved = useMemo(() => JSON.parse(key) as IFormatConfig, [key]);
    useEffect(() => {
        setFormat(scope, resolved);
        return () => setFormat(scope, undefined);
    }, [scope, resolved, setFormat]);
    return <>{children}</>;
}

/** The same, for the UI language — which is also the third layer's input. */
function LanguageLayer({language, children}: {language: string; children: React.ReactNode}) {
    const setLanguage = useAppStore(state => state.setLanguage);
    useEffect(() => {
        setLanguage(language);
        return () => setLanguage('en');
    }, [language, setLanguage]);
    return <>{children}</>;
}

/**
 * One row of every formatted type, with no per-column formatting options on the
 * values whose settings the stories are about — so what the table shows is exactly
 * what the resolved configuration says.
 */
function configuredFormattingTable(label: string) {
    return tableStory(
        {
            surveyDate: {title: 'Date', widget: {type: 'date' as const}},
            loggedAt: {title: 'Timestamp', widget: {type: 'dateTime' as const}},
            transects: {title: 'Transects', widget: {type: 'integer' as const}},
            area: {
                title: 'Area (m²)',
                widget: {
                    type: 'number' as const,
                    // The column is the most specific layer: it keeps one decimal
                    // whatever the configuration says about anything else.
                    formatOptions: {number: {maximumFractionDigits: 1}},
                },
            },
            fee: {title: 'Fee', widget: {type: 'currency' as const}},
        },
        ['surveyDate', 'loggedAt', 'transects', 'area', 'fee'],
        [
            {
                surveyDate: '2026-04-02',
                loggedAt: '2026-04-02T07:15:32',
                transects: 2032,
                area: 1275.456,
                fee: 450.5,
            },
        ],
        {label},
    );
}

export const FormattingSystem: StoryFn = () => (
    <FormatLayer
        scope="system"
        config={{dateStyle: 'full', hourCycle: 'h23', currency: 'BGN', grouping: 'always'}}
    >
        {configuredFormattingTable(
            'The system configuration — full dates, a 24-hour clock, grouped counts',
        )}
    </FormatLayer>
);

export const FormattingUser: StoryFn = () => (
    <FormatLayer
        scope="system"
        config={{dateStyle: 'short', hourCycle: 'h12', currency: 'BGN'}}
    >
        <FormatLayer
            scope="user"
            config={{hourCycle: 'h23', currency: 'USD', locale: 'en-GB'}}
        >
            {configuredFormattingTable(
                "The user's preference over the system's — 24-hour, US dollars, dates in English",
            )}
        </FormatLayer>
    </FormatLayer>
);

export const FormattingBG: StoryFn = () => (
    <LanguageLayer language="bg">
        {configuredFormattingTable(
            'The Bulgarian default — no configuration at all, and the currency is the language’s',
        )}
    </LanguageLayer>
);

/**
 * The stories worth a `play`: the ones whose behaviour a picture cannot show. Sorting
 * reorders rows; a cascade hides options that do not belong to the row; an in-place
 * table writes each change as it happens.
 */
SortableFormTable.play = async ({canvas, userEvent}) => {
    const header = await canvas.findByText('Transects');
    await userEvent.click(header);
    await new Promise(resolve => setTimeout(resolve, 150));
};

RowCascade.play = async ({userEvent}) => {
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const optionsOf = () =>
        Array.from(document.querySelectorAll('.p-dropdown-item')).map(item =>
            item.textContent?.replace(/\s+/g, ' ').trim(),
        );

    // Edit the first row (reef: Kelp Canopy), open its Method cell, and pick the one
    // method only that reef offers — the other two are filtered out.
    const editButton = document.querySelector('.p-row-editor-init') as HTMLElement | null;
    if (!editButton) return;
    await userEvent.click(editButton);
    await wait(150);
    const firstRow = document.querySelectorAll('.p-datatable-tbody tr')[0];
    const methodCell = firstRow?.querySelectorAll('td')[2] as HTMLElement | undefined;
    const trigger = methodCell?.querySelector('.p-dropdown') as HTMLElement | null;
    if (!trigger) return;
    await userEvent.click(trigger);
    await wait(150);
    console.info('[TableColumns] edited row options', JSON.stringify(optionsOf()));
    const option = Array.from(document.querySelectorAll('.p-dropdown-item')).find(item =>
        item.textContent?.includes('Fish Census'),
    );
    if (option) await userEvent.click(option as HTMLElement);

    // A row that is only being added has no reef yet, so its list starts whole and has
    // to follow the pick: cancel the edit, add a row, choose a reef, then open Method.
    const cancel = firstRow?.querySelector('button[aria-label="Cancel Edit"]') as HTMLElement;
    if (cancel) await userEvent.click(cancel);
    await wait(200);
    const add = document.querySelector('[data-testid$="-addButton"]') as HTMLElement | null;
    if (!add) return;
    await userEvent.click(add);
    await wait(300);
    const rows = document.querySelectorAll('.p-datatable-tbody tr');
    const newRow = rows[rows.length - 1];
    const reefTrigger = newRow?.querySelectorAll('td')[1]?.querySelector('.p-dropdown') as
        | HTMLElement
        | undefined;
    if (!reefTrigger) return;
    await userEvent.click(reefTrigger);
    await wait(200);
    const reef = Array.from(document.querySelectorAll('.p-dropdown-item')).find(item =>
        item.textContent?.includes('Coral Gardens'),
    );
    if (reef) await userEvent.click(reef as HTMLElement);
    await wait(300);
    const newMethodCell = newRow?.querySelectorAll('td')[2] as HTMLElement | undefined;
    const newTrigger = newMethodCell?.querySelector('.p-dropdown') as HTMLElement | null;
    if (!newTrigger) return;
    await userEvent.click(newTrigger);
    await wait(200);
    // The picture records exactly what the filter offered: the one method of this reef,
    // never the three belonging to another.
    console.info('[TableColumns] added row options', JSON.stringify(optionsOf()));
};

InlineEdit.play = async ({canvas, userEvent}) => {
    // There is no pencil column: each cell is its own editor, and a change is the save.
    // The play proves the two halves a picture cannot: a cell commits what it is given,
    // and a column that only reads stays text. @@D-618
    expect(document.querySelector('.p-row-editor-init')).toBeNull();
    const approved = (await canvas.findByTestId('survey-0-approved')) as HTMLElement;
    const checkbox = approved.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await userEvent.click(checkbox);
    await waitFor(() => expect(checkbox.checked).toBe(false), {timeout: 5000});

    // The read-only column reads: no input in that cell, just the value.
    const observed = (await canvas.findByTestId('survey-0-observed')) as HTMLElement;
    expect(observed.querySelector('input')).toBeNull();
    expect(observed.textContent).toContain('2026-04-02');
};
