import {describe, expect, it} from 'vitest';
import {act, fireEvent, render, within} from '../../test/render.js';
import {Commander, type ICommanderSource} from './Commander.js';

const source: ICommanderSource = {
    name: 'sql-dev',
    label: 'SQL (dev)',
    levels: [
        {
            resourceType: 'schema',
            keyField: 'schemaName',
            labelField: 'schemaName',
            list: {method: 'sql-dev.schema.list', resultSet: 'items'},
        },
    ],
};

const listChildren = async () => [{schemaName: 'core'}, {schemaName: 'access'}];

async function selectSource(container: HTMLElement) {
    fireEvent.click(within(container.querySelector('.blong-commander-tree') as HTMLElement).getByText('SQL (dev)'));
    await act(async () => {});
}

describe('Commander', () => {
    it('renders the home welcome panel (not a source table) when nothing is selected', async () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        expect(container.querySelector('.blong-commander')).toBeTruthy();
        // Home shows the welcome panel with clickable source tiles, not a table
        // duplicating the tree.
        const home = container.querySelector('.blong-commander-home') as HTMLElement;
        expect(home).toBeTruthy();
        expect(within(home).getByText('SQL (dev)')).toBeInTheDocument();
        expect(container.querySelector('.p-datatable')).toBeNull();
        // Clicking the tile drills into the source (table appears).
        fireEvent.click(within(home).getByText('SQL (dev)'));
        await act(async () => {});
        expect(container.querySelector('.p-datatable')).toBeTruthy();
    });

    it('renders a path bar', () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        expect(container.querySelector('.blong-commander-path-bar')).toBeTruthy();
    });

    it('renders a nav bar with navigation buttons and a toolbar', () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        const nav = container.querySelector('.blong-commander-path-bar');
        expect(nav).toBeTruthy();
        // back / forward / up / refresh buttons
        expect(nav?.querySelector('[aria-label="Back"]')).toBeTruthy();
        expect(nav?.querySelector('[aria-label="Forward"]')).toBeTruthy();
        expect(nav?.querySelector('[aria-label="Up"]')).toBeTruthy();
        expect(nav?.querySelector('[aria-label="Refresh"]')).toBeTruthy();
        // toolbar: sort + view style
        const toolbar = container.querySelector('.blong-commander-toolbar');
        expect(toolbar).toBeTruthy();
    });

    it('shows a ".." row as the first table row after a source is selected', async () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        await selectSource(container);
        const upLink = container.querySelector('.blong-commander-up-link');
        expect(upLink).toBeTruthy();
        expect(upLink?.textContent).toBe('..');
    });

    it('shows the row label as a clickable link in the first column', async () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        await selectSource(container);
        const nameLink = container.querySelector('.blong-commander-name-link');
        expect(nameLink).toBeTruthy();
        expect(nameLink?.textContent).toBe('core');
    });

    it('navigates back home via the ".." row and clicking the whole ".." row goes up', async () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        await selectSource(container);
        const upLink = container.querySelector('.blong-commander-up-link');
        expect(upLink).toBeTruthy();
        fireEvent.click(upLink as Element);
        await act(async () => {});
        // Back to home — the ".." row is gone and the welcome panel shows.
        expect(container.querySelector('.blong-commander-up-link')).toBeNull();
        expect(container.querySelector('.blong-commander-home')).toBeTruthy();
        // Clicking the WHOLE ".." row (not just the link) also goes up.
        await selectSource(container);
        const upRow = container
            .querySelectorAll('.p-datatable-tbody tr')
            .item(0) as HTMLElement;
        expect(upRow.textContent).toContain('..');
        fireEvent.click(upRow);
        await act(async () => {});
        expect(container.querySelector('.blong-commander-home')).toBeTruthy();
    });

    it('navigates up on Backspace', async () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        await selectSource(container);
        expect(container.querySelector('.blong-commander-up-link')).toBeTruthy();
        fireEvent.keyDown(window, {key: 'Backspace'});
        await act(async () => {});
        expect(container.querySelector('.blong-commander-up-link')).toBeNull();
    });

    it('hides the ".." row when showParentRow is false', async () => {
        const {container} = render(
            <Commander sources={[source]} listChildren={listChildren} showParentRow={false} />,
        );
        await selectSource(container);
        expect(container.querySelector('.blong-commander-up-link')).toBeNull();
    });

    it('combines breadcrumbs and jump-to-path in a single widget', async () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        const crumbJump = container.querySelector('.blong-commander-crumb-jump') as HTMLElement;
        expect(crumbJump).toBeTruthy();
        // Clicking the empty space switches to the jump-to-path input.
        fireEvent.click(crumbJump);
        const input = crumbJump.querySelector('input') as HTMLInputElement;
        expect(input).toBeTruthy();
        // Typing a label path + Enter navigates and closes the input.
        fireEvent.change(input, {target: {value: 'SQL (dev)'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        await act(async () => {});
        expect(crumbJump.querySelector('input')).toBeNull();
        const table = container.querySelector('.p-datatable-tbody') as HTMLElement;
        expect(within(table).getByText('core')).toBeInTheDocument();
    });

    it('exits jump-to-path mode on Escape', () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        const crumbJump = container.querySelector('.blong-commander-crumb-jump') as HTMLElement;
        fireEvent.click(crumbJump);
        const input = crumbJump.querySelector('input') as HTMLElement;
        expect(input).toBeTruthy();
        fireEvent.keyDown(input, {key: 'Escape'});
        expect(crumbJump.querySelector('input')).toBeNull();
    });

    it('renders a resizable splitter between tree and content', () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        expect(container.querySelector('.p-splitter')).toBeTruthy();
        expect(container.querySelectorAll('.p-splitter-panel').length).toBe(2);
    });

    it('renders Open and Help toolbar buttons and toggles the key help', () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        const toolbar = container.querySelector('.blong-commander-toolbar') as HTMLElement;
        expect(toolbar.querySelector('[aria-label="Open (F2)"]')).toBeTruthy();
        expect(toolbar.querySelector('[aria-label="Help (?)"]')).toBeTruthy();
        // Open is disabled until a row is selected.
        expect((toolbar.querySelector('[aria-label="Open (F2)"]') as HTMLButtonElement).disabled).toBe(true);
        // Help toggles the key-help overlay.
        fireEvent.click(toolbar.querySelector('[aria-label="Help (?)"]') as Element);
        expect(container.textContent).toContain('Commander keys');
        fireEvent.click(toolbar.querySelector('[aria-label="Help (?)"]') as Element);
        expect(container.textContent).not.toContain('Commander keys');
    });

    it('sorts rows by clicking the column titles', async () => {
        const {container} = render(<Commander sources={[source]} listChildren={listChildren} />);
        await selectSource(container);
        const nameLinks = () =>
            [...container.querySelectorAll('.blong-commander-name-link')].map(a => a.textContent);
        expect(nameLinks()).toEqual(['core', 'access']);
        const sortHeader = container.querySelector('.blong-commander-sort-header') as HTMLElement;
        expect(sortHeader).toBeTruthy();
        // Ascending sort → 'access' first.
        fireEvent.click(sortHeader);
        await act(async () => {});
        expect(nameLinks()).toEqual(['access', 'core']);
        // Clicking again reverses the order.
        fireEvent.click(sortHeader);
        await act(async () => {});
        expect(nameLinks()).toEqual(['core', 'access']);
    });
});
