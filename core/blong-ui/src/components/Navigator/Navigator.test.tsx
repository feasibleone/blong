import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '../../test/render.js';
import {Navigator} from './index.js';

describe('Navigator', () => {
    it('renders with static data', () => {
        const {container} = render(
            <Navigator
                data={[
                    {id: 1, parentId: null, name: 'Root'},
                    {id: 2, parentId: 1, name: 'Child'},
                ]}
                keyField="id"
                parentField="parentId"
                field="name"
            />,
        );
        expect(container.querySelector('.blong-navigator')).toBeTruthy();
    });

    it('renders with title', () => {
        render(
            <Navigator
                title="My Tree"
                data={[{id: 1, parentId: null, name: 'Root'}]}
                keyField="id"
                parentField="parentId"
                field="name"
            />,
        );
        expect(screen.getByText('My Tree')).toBeInTheDocument();
    });

    it('renders with empty data', () => {
        const {container} = render(<Navigator data={[]} />);
        expect(container.querySelector('.blong-navigator')).toBeTruthy();
    });

    it('renders with fetch function', () => {
        const fetchFn = vi.fn().mockResolvedValue({items: [{id: 1, parentId: null, name: 'Root'}]});
        const {container} = render(
            <Navigator
                fetch={fetchFn}
                keyField="id"
                parentField="parentId"
                field="name"
                resultSet="items"
            />,
        );
        expect(container.querySelector('.blong-navigator')).toBeTruthy();
    });
});
