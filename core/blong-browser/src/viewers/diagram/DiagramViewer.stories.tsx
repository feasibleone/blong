import type {Meta, StoryObj} from '@storybook/react-vite';
import DiagramViewer from './DiagramViewer.js';

/**
 * DiagramViewer stories — the renderer registry, and what happens when it has
 * nothing to offer.
 *
 * The diagram text below is the shape the semantic-log service emits: a Mermaid
 * sequence diagram whose participant names are namespaces and whose arrows are
 * the calls between them (a leg id, then the participant it was aimed at). The
 * second and third stories are the two failures a real deployment meets — a
 * notation this build has no renderer for, and text that is not a diagram at
 * all — and both are shown rather than blank.
 */
const meta: Meta<typeof DiagramViewer> = {
    title: 'Viewers/DiagramViewer',
    component: DiagramViewer,
    parameters: {layout: 'padded'},
    tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof meta>;

const OBSERVED_FLOW = [
    '%% access.user.find observed 4 times, last 2026-09-17T12:40:31.000Z',
    'sequenceDiagram',
    '    participant access',
    '    participant db',
    '    participant party',
    '    access->>db: access.db.party.subject.find',
    '    db->>party: db.party.subject.find',
    '    party-->>db: found',
    '    db-->>access: ok',
].join('\n');

/** What the service produces for an observed flow, drawn by the default renderer. */
export const ObservedFlow: Story = {
    args: {diagram: OBSERVED_FLOW},
};

/** A notation no renderer is registered for: the text is shown as it came. */
export const UnknownNotation: Story = {
    args: {diagram: OBSERVED_FLOW, renderer: 'react-flow'},
};

/** Text that is not a diagram: nothing is drawn, and nothing is hidden either. */
export const NotADiagram: Story = {
    args: {diagram: 'this is not a diagram'},
};

/** Nothing observed yet is an empty diagram, not an error. */
export const Empty: Story = {
    args: {diagram: ''},
};
