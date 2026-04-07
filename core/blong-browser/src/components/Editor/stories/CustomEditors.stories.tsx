/**
 * CustomEditors story — blong-browser adaptation.
 *
 * NOTE: CustomEditors uses custom component factories registered
 * in the widget registry via `editors: {customWidget: CustomComponent}`.
 * blong-browser supports a similar `widgetRegistry.register()` mechanism,
 * but the story-level custom widget injection pattern is not yet wired.
 *
 * This stub registers a simple custom widget and renders it in an Editor.
 * Snapshot behaviour: renders a card with a plain input (fallback) for
 * unregistered widget types.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/CustomEditors', component: Editor};
export default meta;

export const CustomEditors: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                treeName: {title: 'Name'},
                customField: {title: 'Custom', widget: {type: 'input'}},
            },
        }}
        cards={{
            edit: {label: 'Custom Editor', widgets: ['treeName', 'customField']},
        }}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['edit']}}
    />
);
