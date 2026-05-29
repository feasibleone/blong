/**
 * PortalComponent story — tab that renders a dynamically loaded component widget.
 *
 * The 'Explorer' tab uses a field with `widget: {type: 'component', component: 'portal.explorerDemo'}`.
 * The storybook mock in .storybook/dispatch.tsx resolves 'portal.explorerDemo' to a
 * coral-list Explorer component, demonstrating the full dispatch-based component loading flow.
 *
 * The 'TemplatedComponent' story extends this by showing that both `component` and `params`
 * support `${fieldName}` template expressions resolved against the loaded form values.
 */
import coralEditorFixture from '@feasibleone/blong-marine/storybook.js';
import type {Meta} from '@storybook/react-vite';
import {Editor} from '../Editor.js';
import type {StoryFn} from '../Editor.stories.js';
import {Template} from '../Editor.stories.js';

const meta: Meta<typeof Editor> = {title: 'Editor/PortalComponent', component: Editor};
export default meta;

/** Shared layout used by both stories below. */
const templateLayout = {
    edit: ['edit', 'habitat', 'explorer'],
};

export const PortalComponent: StoryFn = Template.bind({});
PortalComponent.args = {
    loadAction: 'coralCoralGet',
    editMode: true,
    schema: {
        ...coralEditorFixture.schema,
        properties: {
            ...coralEditorFixture.schema.properties,
            explorerWidget: {
                title: '',
                widget: {
                    type: 'component',
                    component: 'portal.explorerDemo',
                },
            },
        },
    },
    cards: {
        ...coralEditorFixture.cards,
        explorer: {
            widgets: ['explorerWidget'],
        },
    },
    layouts: templateLayout,
};

/**
 * TemplatedComponent — demonstrates template expressions in `component` and `params`.
 *
 * The widget is configured with:
 *   `component: 'portal.${coralType}.explorer'`
 *   `params:    {coralId: '${coralId}', coralName: '${coralName}'}`
 *
 * When the form loads via `coralCoralGet`, the values are:
 *   `coralType = 'hard'`  →  component resolves to `'portal.hard.explorer'`
 *   `coralId = 1`, `coralName = 'Staghorn Coral'`  →  params are passed to the resolver
 *
 * Each real coral type has a corresponding `component/portal.{type}.explorer`
 * handler in .storybook/dispatch.tsx — in a real app these would be different
 * type-specific sub-components; here they all resolve to the same DemoExplorer.
 */
export const TemplatedComponent: StoryFn = Template.bind({});
TemplatedComponent.args = {
    loadAction: 'coralCoralGet',
    schema: {
        ...coralEditorFixture.schema,
        properties: {
            ...coralEditorFixture.schema.properties,
            explorerWidget: {
                title: '',
                widget: {
                    type: 'component',
                    component: 'portal.${coralType}.explorer',
                    params: {coralId: '${coralId}', coralName: '${coralName}'},
                },
            },
        },
    },
    cards: {
        ...coralEditorFixture.cards,
        explorer: {
            widgets: ['explorerWidget'],
        },
    },
    layouts: templateLayout,
};
