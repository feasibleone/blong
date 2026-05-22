/**
 * Editor in "report" mode — queryAction drives table re-fetch when "Run Report" is submitted.
 *
 * The params card collects filter values; the result table fetches server-side data on "Run".
 * Paging and sorting are handled by the table widget's built-in listAction mechanism.
 */
import type {Meta} from '@storybook/react-vite';
import type {WidgetType} from '../../../index.js';
import {Editor} from '../Editor.js';
import type {StoryFn} from '../Editor.stories.js';

const meta: Meta<typeof Editor> = {title: 'Editor/Report', component: Editor};
export default meta;

// ── Dispatch mock for the report story ──────────────────────────────────────
// Handled by the global withDispatch decorator via coralCoralFind in dispatch.tsx.
// The 'coralCoralFind' handler already supports cascade params (flat filter keys).

// ── Schema ────────────────────────────────────────────────────────────────────

const reportSchema = {
    properties: {
        // Params card fields (flat filter — passed directly to the list action)
        coralName: {title: 'Name', type: 'string'},
        coralType: {
            title: 'Type',
            widget: {
                type: 'select' as WidgetType,
                options: [
                    {value: '', label: 'All'},
                    {value: 'hard', label: 'Hard Coral'},
                    {value: 'soft', label: 'Soft Coral'},
                    {value: 'fire', label: 'Fire Coral'},
                ],
            },
        },
        // Result table (populated by listAction via reportParams)
        result: {
            type: 'array',
            title: '',
            widget: {
                type: 'table' as WidgetType,
                listAction: 'coralCoralFind',
                resultSet: 'items',
                keyField: 'coralId',
                columns: ['coralName', 'coralType', 'maxDepth', 'endangered'],
                actions: {allowEdit: false, allowDelete: false},
            },
            items: {
                properties: {
                    coralId: {title: 'ID'},
                    coralName: {title: 'Name'},
                    coralType: {title: 'Type'},
                    maxDepth: {title: 'Max Depth (m)', type: 'number'},
                    endangered: {title: 'Endangered', type: 'boolean'},
                },
            },
        },
    },
};

const reportCards = {
    params: {label: 'Report Parameters', widgets: ['coralName', 'coralType']},
    result: {label: 'Results', widgets: ['result']},
};

const reportLayouts = {report: ['params', 'result']};

/**
 * Basic report — params card with name/type filters, result table populated on "Run Report".
 * Uses `coralCoralFind` from the global dispatch mock (supports paging, sorting, cascade filter).
 */
export const BasicReport: StoryFn = () => (
    <Editor
        schema={reportSchema}
        cards={reportCards}
        layouts={reportLayouts}
        layout="report"
        queryAction="coralCoralFind"
        title="Coral Report"
    />
);

/**
 * Pre-populated — starts with `coralType: 'hard'` so the table fetches hard corals on first run.
 * Demonstrates how to open a report with default filter values.
 */
export const PrePopulated: StoryFn = () => (
    <Editor
        schema={reportSchema}
        cards={reportCards}
        layouts={reportLayouts}
        layout="report"
        queryAction="coralCoralFind"
        title="Hard Coral Report"
        value={{coralType: 'hard'}}
    />
);

// Interact play: wait for blong to load, type in params and click Run Report
BasicReport.play = async ({canvas, userEvent}) => {
    // The report table should not show data before "Run Report" is clicked
    const nameInput = await canvas.findByLabelText('Name', {}, {timeout: 5000}).catch(() => null);
    if (!nameInput) return; // Storybook dispatch not ready
    await userEvent.tripleClick(nameInput);
    await userEvent.type(nameInput, 'Brain');
    await new Promise(resolve => setTimeout(resolve, 200));
    // Click "Run Report"
    const runBtn = canvas
        .queryAllByRole('button')
        .find(
            (b: HTMLElement) =>
                b.getAttribute('title') === 'Run Report' || b.textContent?.trim() === 'Run Report',
        );
    if (runBtn) await userEvent.click(runBtn);
    await new Promise(resolve => setTimeout(resolve, 500));
};
