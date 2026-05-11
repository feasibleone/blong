import {act, within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import React from 'react';
import type {IWidgetProps} from '@feasibleone/blong';
import {fireEvent, screen} from '@testing-library/react';
import {bgTranslations} from '../../../.storybook/dispatch.js';
import {useAppStore} from '../../state/appStore.js';
import {widgetRegistry} from '../../widgets/index.js';
import {render} from '../../test/render.js';
import {Editor} from './index.js';
import {
    Basic,
    Design,
    EditorWithExplorer,
    Files,
    FilesInTab,
    Loading,
    ServerValidation,
    Steps,
    StepsDisabledBack,
    StepsHiddenBack,
    Submit,
    Tabs,
    Toolbar,
} from './Editor.stories.js';
import {CascadedDropdowns} from './stories/CascadedDropdowns.stories.js';
import {CascadedTables} from './stories/CascadedTables.stories.js';
import {CustomEditors} from './stories/CustomEditors.stories.js';
import {MasterDetail} from './stories/MasterDetail.stories.js';
import {MasterDetailPolymorphic} from './stories/MasterDetailPolymorphic.stories.js';
import {Pivot, PivotBG} from './stories/Pivot.stories.js';
import {PolymorphicLayout} from './stories/PolymorphicLayout.stories.js';
import {ResponsiveLayout} from './stories/ResponsiveLayout.stories.js';
import {TabbedLayout} from './stories/TabbedLayout.stories.js';
import {ThumbIndexLayout} from './stories/ThumbIndexLayout.stories.js';
import {Validation, ValidationBG} from './stories/Validation.stories.js';

/** dispatch mock: returns pre-seeded data; 'treeTreeEditError' rejects with validation errors */
const dispatch = vi.fn().mockImplementation(async (method: string) => {
    if (method === 'treeTreeEditError') {
        const err = new Error('Server validation error') as Error & {
            validation?: Record<string, string>;
        };
        err.validation = {treeName: 'Duplicate name', treeType: 'Invalid Type'};
        throw err;
    }
    return {treeName: 'Oak', treeId: 1, treeType: 1, treeDescription: '', createdOn: '2023-03-08'};
});

describe('<Editor />', () => {
    it('Basic render equals snapshot', async () => {
        const {findByTestId} = render(<Basic />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Loading render equals snapshot', async () => {
        const neverResolve = vi.fn().mockImplementation(() => new Promise(() => {}));
        const {findByTestId} = render(<Loading />, {dispatch: neverResolve});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * Design render equals snapshot
     * MISMATCH JUSTIFICATION: target injects drag-drop handles per card in
     * design mode. blong-browser controls design mode via DesignModeProvider at
     * the suite level. The Editor component itself has no `design` prop —
     * both snapshots render the same card layout without handles.
     */
    it('Design render equals snapshot', async () => {
        const {findByTestId} = render(<Design />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Tabs render equals snapshot', async () => {
        const {findByTestId} = render(<Tabs />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * CascadedDropdowns render equals snapshot
     * MISMATCH JUSTIFICATION: blong-browser wires dropdowns via global `dispatch`;
     * target uses an `onDropdown` prop. The selected options differ because
     * the dispatch mock returns no data for the dropdown keys used in this story.
     */
    it('CascadedDropdowns render equals snapshot', async () => {
        const {findByTestId, container} = render(<CascadedDropdowns />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (CascadedDropdowns.play) {
            await act(() =>
                CascadedDropdowns.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * CascadedTables render equals snapshot
     * Story uses three `widget.type='table'` cards (Person, Document, Attachment).
     * The DataTable renders correctly; row-selection-driven cascading is a
     * runtime interaction not captured by this static snapshot test.
     */
    it('CascadedTables render equals snapshot', async () => {
        const {findByTestId, container} = render(<CascadedTables />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (CascadedTables.play) {
            await act(() =>
                CascadedTables.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * CustomEditors render equals snapshot
     * MISMATCH JUSTIFICATION: target allows passing custom widget component
     * factories at the story level via `editors` prop. blong-browser uses a global
     * widgetRegistry; story-level registration is not yet implemented.
     */
    it('CustomEditors render equals snapshot', async () => {
        const {findByTestId} = render(<CustomEditors />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * MasterDetail render equals snapshot
     * MISMATCH JUSTIFICATION: target `card.watch = '$.selected.person'`
     * fills the detail card when a table row is selected. blong-browser does not
     * yet implement the `watch` reactive card-fill pattern.
     */
    it('MasterDetail render equals snapshot', async () => {
        const {findByTestId, container} = render(<MasterDetail />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (MasterDetail.play) {
            await act(() =>
                MasterDetail.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * MasterDetailPolymorphic render equals snapshot
     * MISMATCH JUSTIFICATION: `card.match` polymorphic card visibility is
     * not yet implemented in blong-browser.
     */
    it('MasterDetailPolymorphic render equals snapshot', async () => {
        const {findByTestId, container} = render(<MasterDetailPolymorphic />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (MasterDetailPolymorphic.play) {
            await act(() =>
                MasterDetailPolymorphic.play!({
                    canvas: within(container),
                    userEvent: userEvent.setup(),
                }),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * Pivot render equals snapshot
     * Story uses `widget.type='table'` cards (Group A, Group B), matching
     * the DataTable-based structure of the target Pivot snapshot.
     */
    it('Pivot render equals snapshot', async () => {
        const {findByTestId} = render(<Pivot />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * Pivot BG render equals snapshot
     * Same structure as Pivot with Bulgarian card labels (Група А / Група Б).
     */
    it('Pivot BG render equals snapshot', async () => {
        const {findByTestId} = render(<PivotBG />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * PolymorphicLayout render equals snapshot
     * MISMATCH JUSTIFICATION: `card.match` polymorphic card selection is not
     * yet implemented. Both cards render unconditionally.
     */
    it('PolymorphicLayout render equals snapshot', async () => {
        const {container} = render(<PolymorphicLayout />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        // PolymorphicLayout renders multiple Editor instances so there are multiple test roots;
        // snapshot the outermost container instead.
        expect(container.firstChild).toMatchSnapshot();
    });

    it('ResponsiveLayout render equals snapshot', async () => {
        const {findByTestId} = render(<ResponsiveLayout />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('TabbedLayout render equals snapshot', async () => {
        const {findByTestId} = render(<TabbedLayout />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * ThumbIndexLayout render equals snapshot
     * orientation='left' renders PanelMenu (vertical accordion nav) instead
     * of TabMenu, matching the target PanelMenu-based ThumbIndex structure.
     * Nested sub-items within panel sections are not yet implemented.
     */
    it('ThumbIndexLayout render equals snapshot', async () => {
        const {findByTestId} = render(<ThumbIndexLayout />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Submit render equals snapshot', async () => {
        const {findByTestId, container} = render(<Submit />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (Submit.play) {
            await act(() =>
                Submit.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Validation render equals snapshot', async () => {
        // Apply story args explicitly — Template.bind({}) doesn't forward .args in JSX render.
        const {findByTestId, container} = render(Validation(Validation.args ?? {}), {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (Validation.play) {
            await act(() =>
                Validation.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * ValidationBG render equals snapshot
     * Applies bgTranslations + language 'bg' via appStore before rendering so
     * field labels and button text are in Bulgarian, matching the Storybook story.
     * Cleaned up to English after the test.
     */
    it('ValidationBG render equals snapshot', async () => {
        useAppStore.getState().setTranslations(bgTranslations);
        useAppStore.getState().setLanguage('bg');
        try {
            const {findByTestId, container} = render(ValidationBG(ValidationBG.args ?? {}), {
                dispatch,
            });
            await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
            if (ValidationBG.play) {
                await act(() =>
                    ValidationBG.play!({canvas: within(container), userEvent: userEvent.setup()}),
                );
            }
            await act(() => new Promise(resolve => setTimeout(resolve, 500)));
            expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
        } finally {
            useAppStore.getState().setTranslations({});
            useAppStore.getState().setLanguage('en');
        }
    });

    it('Server validation render equals snapshot', async () => {
        // Apply story args explicitly — Template.bind({}) doesn't forward .args in JSX render.
        const {findByTestId, container} = render(ServerValidation(ServerValidation.args ?? {}), {
            dispatch,
        });
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (ServerValidation.play) {
            await act(() =>
                ServerValidation.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Toolbar render equals snapshot', async () => {
        const {findByTestId} = render(<Toolbar />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * Files render equals snapshot
     * MISMATCH JUSTIFICATION: imageUpload, ocr, webcamera, and file widget
     * types are not yet implemented in blong-browser. The snapshot shows plain
     * card layout with text inputs.
     */
    it('Files render equals snapshot', async () => {
        const {findByTestId, container} = render(<Files />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (Files.play) {
            await act(() => Files.play!({canvas: within(container), userEvent: userEvent.setup()}));
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * FilesInTab render equals snapshot
     * MISMATCH JUSTIFICATION: Same file widget limitation as Files.
     */
    it('FilesInTab render equals snapshot', async () => {
        const {findByTestId, container} = render(<FilesInTab />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (FilesInTab.play) {
            await act(() =>
                FilesInTab.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('Steps render equals snapshot', async () => {
        const {findByTestId} = render(<Steps />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('StepsDisabledBack render equals snapshot', async () => {
        const {findByTestId, container} = render(<StepsDisabledBack />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (StepsDisabledBack.play) {
            await act(() =>
                StepsDisabledBack.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    it('StepsHiddenBack render equals snapshot', async () => {
        const {findByTestId, container} = render(<StepsHiddenBack />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (StepsHiddenBack.play) {
            await act(() =>
                StepsHiddenBack.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    /**
     * EditorTabsExplorer render equals snapshot
     * The History tab injects an Explorer (DataTable) via the `component` slot
     * on ILayoutTabItem. The play function navigates to the History tab so the
     * Explorer is visible in the snapshot.
     */
    it('EditorTabsExplorer render equals snapshot', async () => {
        const {findByTestId, container} = render(<EditorWithExplorer />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
        if (EditorWithExplorer.play) {
            await act(() =>
                EditorWithExplorer.play!({canvas: within(container), userEvent: userEvent.setup()}),
            );
        }
        await act(() => new Promise(resolve => setTimeout(resolve, 500)));
        expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
    });

    // ── Structural assertions (verify DOM structure rather than exact HTML) ────

    it('Basic: role="toolbar" element is present', async () => {
        const {container} = render(<Basic />, {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 200)));
        expect(container.querySelector('[role="toolbar"]')).toBeTruthy();
    });

    it('Basic: Edit button is present in read-only mode', async () => {
        // Basic story is in editMode; render with editMode=false to get the Edit button.
        const {container} = render(Basic({editMode: false}), {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 200)));
        // Edit button renders as icon-only — check aria-label, not text content.
        const editBtn = container.querySelector('[aria-label="Edit"]');
        expect(editBtn).toBeTruthy();
    });

    it('Tabs: tab navigation (role="menubar") is present', async () => {
        // Apply story args explicitly — Template.bind({}) doesn't forward .args in JSX render.
        const {container} = render(Tabs(Tabs.args ?? {}), {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 200)));
        // PrimeReact 10: TabMenu renders role="menubar" (was role="tablist" in v8)
        expect(container.querySelector('[role="menubar"]')).toBeTruthy();
    });

    /**
     * Steps: no toolbar — mirrors target Steps story which sets toolbar:false.
     * In blong-browser the equivalent is editable={false} to prevent the Edit button.
     */
    it('Steps: steps indicator (ol/role=tablist) is present', async () => {
        // Apply story args explicitly — Template.bind({}) doesn't forward .args in JSX render.
        const {container} = render(Steps(Steps.args ?? {}), {dispatch});
        await act(() => new Promise(resolve => setTimeout(resolve, 200)));
        const stepsList = container.querySelector(
            '.p-steps-list, .p-steps, [role="tablist"], .blong-form-steps',
        );
        expect(stepsList).toBeTruthy();
    });
});

// ── Editor render isolation — typing in one field must not rerender sibling widgets ──
//
// Mirrors the equivalent test suite in Form.test.tsx.
// The Editor wraps a Form and manages extra state (isDirty, localValue, savedSuccess, …).
// Before the fix, handleFormChange called setLocalValue and setIsDirty on every keystroke,
// which caused Editor → Form → all widgets to rerender.  This suite catches that regression.

describe('Editor render isolation', () => {
    const SPY_TYPE = '_editor_spy';

    const renderCounts: Record<string, number> = {};

    const SpyWidget = React.memo(function SpyWidget({name, value, onChange, onBlur}: IWidgetProps) {
        renderCounts[name] = (renderCounts[name] ?? 0) + 1;
        return (
            <input
                data-testid={name}
                value={String(value ?? '')}
                onChange={e => onChange(e.target.value)}
                onBlur={onBlur}
            />
        );
    });

    let prevWidget: React.ComponentType<IWidgetProps> | undefined;
    beforeAll(() => {
        prevWidget = widgetRegistry.get(SPY_TYPE);
        widgetRegistry.register(SPY_TYPE, SpyWidget as React.ComponentType<IWidgetProps>);
    });
    afterAll(() => {
        if (prevWidget) widgetRegistry.register(SPY_TYPE, prevWidget);
    });
    beforeEach(() => {
        Object.keys(renderCounts).forEach(k => delete renderCounts[k]);
    });

    const spySchema = {
        properties: {
            fieldA: {title: 'Field A', widget: {type: SPY_TYPE as 'input'}},
            fieldB: {title: 'Field B', widget: {type: SPY_TYPE as 'input'}},
        },
    };
    const spyCards = {
        edit: {label: 'Edit', widgets: ['fieldA', 'fieldB']},
    };

    it('typing in fieldA does not rerender fieldB widget', async () => {
        render(
            <Editor
                schema={spySchema}
                cards={spyCards}
                editMode
                value={{fieldA: '', fieldB: ''}}
            />,
        );

        // Wait for initial render to settle, then reset counts.
        await act(async () => {});
        renderCounts.fieldA = 0;
        renderCounts.fieldB = 0;

        const inputA = screen.getByTestId('fieldA') as HTMLInputElement;
        await act(async () => {
            fireEvent.change(inputA, {target: {value: 'x'}});
        });

        // fieldB must NOT have rerendered (no Editor-level state change on keystroke).
        expect(renderCounts.fieldB ?? 0).toBe(0);
        // fieldA should have rerendered (its own Controller updated its value).
        expect(renderCounts.fieldA ?? 0).toBeGreaterThan(0);
    });

    it('typing in multiple fields only rerenders the active field widget', async () => {
        render(
            <Editor
                schema={spySchema}
                cards={spyCards}
                editMode
                value={{fieldA: '', fieldB: ''}}
            />,
        );

        await act(async () => {});

        for (const [testId, char] of [
            ['fieldA', 'a'],
            ['fieldB', 'b'],
            ['fieldA', 'c'],
        ] as const) {
            renderCounts.fieldA = 0;
            renderCounts.fieldB = 0;

            const input = screen.getByTestId(testId) as HTMLInputElement;
            await act(async () => {
                fireEvent.change(input, {target: {value: char}});
            });

            const sibling = testId === 'fieldA' ? 'fieldB' : 'fieldA';
            expect(renderCounts[sibling] ?? 0).toBe(0);
        }
    });
});
