/**
 * PolymorphicLayout story — blong-browser adaptation.
 *
 * Shows three Editor instances side by side, each with a different value and
 * a single matching card — demonstrating that the same card set can be surfaced
 * selectively per value type: person, existing organisation, new organisation.
 */
import type {Meta} from '@storybook/react-vite';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../Editor.js';

const meta: Meta<typeof Editor> = {title: 'Editor/PolymorphicLayout', component: Editor};
export default meta;

const sharedSchema = {
    properties: {
        name: {title: 'Name'},
        role: {title: 'Role'},
        registrationNumber: {title: 'Registration Number'},
    },
} as const;

const sharedCards = {
    createOrganization: {
        label: 'Create Organization',
        className: 'col-12',
        widgets: ['name', 'registrationNumber'],
    },
    editPerson: {
        label: 'Person',
        className: 'col-12',
        widgets: ['name', 'role'],
    },
    editOrganization: {
        label: 'Edit Organization',
        className: 'col-12',
        widgets: ['name', 'registrationNumber'],
    },
};

export const PolymorphicLayout: StoryFn = () => (
    <div style={{display: 'flex', alignItems: 'flex-start'}}>
        <div style={{flex: 1}}>
            <Editor
                schema={sharedSchema}
                cards={sharedCards}
                value={{name: 'John Doe', role: 'Director'}}
                editable
                editMode
                layout="person"
                layouts={{person: ['editPerson']}}
            />
        </div>
        <div style={{flex: 1}}>
            <Editor
                schema={sharedSchema}
                cards={sharedCards}
                value={{name: 'Acme Inc.', registrationNumber: '111-111-111'}}
                editable
                editMode
                layout="org"
                layouts={{org: ['editOrganization']}}
            />
        </div>
        <div style={{flex: 1}}>
            <Editor
                schema={sharedSchema}
                cards={sharedCards}
                editable
                editMode
                layout="create"
                layouts={{create: ['createOrganization']}}
            />
        </div>
    </div>
);
