/**
 * PortalComponent story — tab that renders a dynamic Explorer component.
 */
import type {Meta} from '@storybook/react';
import {Explorer} from '../../Explorer/index.js';
import type {StoryFn} from '../Editor.stories.js';
import {Template} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/PortalComponent', component: Editor};
export default meta;

function ExplorerWidget() {
    return (
        <Explorer
            columns={[
                {field: 'id', header: 'ID'},
                {field: 'name', header: 'Name'},
            ]}
            listAction="itemItemFind"
        />
    );
}

export const PortalComponent: StoryFn = Template.bind({});
PortalComponent.args = {
    loadAction: 'treeTreeGet',
    layouts: {
        edit: {
            orientation: 'top',
            items: [
                {id: 'general', icon: 'pi pi-user', label: 'General', widgets: ['edit', 'habitat']},
                {
                    id: 'explorer',
                    icon: 'pi pi-list',
                    label: 'Explorer',
                    widgets: [],
                    component: ExplorerWidget,
                },
            ],
        },
    },
};
