import {describe, expect, it} from 'vitest';
import {fireEvent, render, screen} from '../test/render.js';
import {getViewer} from './registry.js';
import {registerBuiltinViewers} from './index.js';
import {TableViewer} from './TableViewer.js';
import {SecretViewer} from './SecretViewer.js';
import {YamlViewer} from './YamlViewer.js';
import {MessageViewer} from './MessageViewer.js';
import {DocumentViewer} from './DocumentViewer.js';

const BUILTIN_TYPES = [
    'json',
    'keyValue',
    'file',
    'image',
    'podLog',
    'log',
    'table',
    'yaml',
    'message',
    'document',
    'secret',
];

describe('specialized viewers', () => {
    it('registers the built-in viewer types', () => {
        registerBuiltinViewers();
        for (const type of BUILTIN_TYPES) {
            expect(getViewer(type), `viewer ${type} registered`).toBeDefined();
        }
    });

    it('renders a table viewer from rows', () => {
        const {container} = render(
            <TableViewer
                node={{}}
                data={[
                    {id: 1, name: 'row-a'},
                    {id: 2, name: 'row-b'},
                ]}
            />,
        );
        expect(container.querySelector('.blong-viewer-table')).toBeTruthy();
        expect(screen.getByText('row-a')).toBeInTheDocument();
    });

    it('renders a secret viewer masked by default and reveals on click', () => {
        render(<SecretViewer node={{}} data={{password: 'hunter2'}} />);
        expect(screen.getByText('password')).toBeInTheDocument();
        expect(screen.getByText('••••••••')).toBeInTheDocument();
        expect(screen.queryByText('hunter2')).toBeNull();
        fireEvent.click(screen.getByText('Reveal values'));
        expect(screen.getByText('hunter2')).toBeInTheDocument();
    });

    it('renders a yaml viewer', () => {
        const {container} = render(<YamlViewer node={{}} data={{apiVersion: 'v1', kind: 'Pod'}} />);
        expect(container.querySelector('.blong-viewer-yaml')).toBeTruthy();
        expect(screen.getByText(/apiVersion:/)).toBeInTheDocument();
    });

    it('renders a message viewer with a parsed value', () => {
        render(<MessageViewer node={{}} data={{topic: 't', partition: 0, offset: 1, value: '{"a":1}'}} />);
        expect(screen.getByText('topic')).toBeInTheDocument();
        expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
    });

    it('renders a document viewer with a field summary', () => {
        const {container} = render(<DocumentViewer node={{}} data={{a: 1, b: 2}} />);
        expect(container.querySelector('.blong-viewer-document')).toBeTruthy();
        expect(screen.getByText('2 fields')).toBeInTheDocument();
    });
});
