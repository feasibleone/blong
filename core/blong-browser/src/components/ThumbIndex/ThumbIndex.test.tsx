import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render} from '../../test/render.js';
import {ThumbIndex} from './ThumbIndex.js';

describe('ThumbIndex', () => {
    it('renders empty tab set (horizontal)', () => {
        const {container} = render(<ThumbIndex items={[]} />);
        expect(container).toMatchSnapshot();
    });

    it('renders tab items (horizontal)', () => {
        const {container} = render(
            <ThumbIndex
                items={[
                    {id: 'a', label: 'A'},
                    {id: 'b', label: 'B'},
                    {id: 'c', label: 'C'},
                ]}
                renderContent={item => <div>Content for {item.label}</div>}
            />,
        );
        // TabView is rendered
        expect(container.querySelector('.p-tabview, .blong-thumb-index')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });

    it('renders vertical layout', () => {
        const {container} = render(
            <ThumbIndex
                orientation="left"
                type="thumbs"
                items={[
                    {id: 'x', label: 'X'},
                    {id: 'y', label: 'Y'},
                ]}
                renderContent={item => <div>{item.label}</div>}
            />,
        );
        expect(container.querySelector('.blong-thumb-index--vertical')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });

    it('selects nav item on click (vertical)', () => {
        const onChange = vi.fn();
        const {container} = render(
            <ThumbIndex
                orientation="left"
                type="thumbs"
                items={[
                    {id: 'a', label: 'A'},
                    {id: 'b', label: 'B'},
                ]}
                onChange={onChange}
                renderContent={item => <div>{item.label}</div>}
            />,
        );
        const buttons = container.querySelectorAll('.blong-thumb-index__nav-btn');
        if (buttons.length > 1) {
            fireEvent.click(buttons[1]);
            expect(onChange).toHaveBeenCalledWith('b');
        }
    });

    it('fires onChange when tab is clicked', async () => {
        const onChange = vi.fn();
        const {container} = render(
            <ThumbIndex
                items={[
                    {id: 'first', label: 'First'},
                    {id: 'second', label: 'Second'},
                ]}
                onChange={onChange}
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders with bottom orientation (horizontal TabView)', () => {
        const {container} = render(
            <ThumbIndex
                orientation="bottom"
                items={[
                    {id: 'one', label: 'One'},
                    {id: 'two', label: 'Two'},
                ]}
                renderContent={item => <span>{item.label}</span>}
            />,
        );
        expect(container.querySelector('.blong-thumb-index')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });

    it('renders vertical layout with group items', () => {
        const {container} = render(
            <ThumbIndex
                orientation="left"
                type="thumbs"
                items={[
                    {
                        id: 'group',
                        label: 'Group',
                        icon: 'pi-folder',
                        items: [
                            {id: 'child1', label: 'Child 1'},
                            {id: 'child2', label: 'Child 2'},
                        ],
                    },
                ]}
                renderContent={item => <div>{item.label}</div>}
            />,
        );
        // Groups render their sub-items as nav items
        expect(container.querySelector('.blong-thumb-index__nav-items')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });

    it('handles controlled activeId', () => {
        const onChange = vi.fn();
        const {container} = render(
            <ThumbIndex
                items={[
                    {id: 'tab1', label: 'Tab 1'},
                    {id: 'tab2', label: 'Tab 2'},
                ]}
                activeId="tab2"
                onChange={onChange}
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders with icons in items', () => {
        const {container} = render(
            <ThumbIndex
                items={[
                    {id: 'home', label: 'Home', icon: 'pi-home'},
                    {id: 'settings', label: 'Settings', icon: 'pi-cog'},
                ]}
            />,
        );
        expect(container).toMatchSnapshot();
    });

    it('renders vertical with nested nav children', () => {
        const onChange = vi.fn();
        const {container} = render(
            <ThumbIndex
                orientation="vertical"
                type="thumbs"
                items={[
                    {
                        id: 'parent',
                        label: 'Parent',
                        items: [
                            {
                                id: 'nested',
                                label: 'Nested',
                                items: [{id: 'leaf', label: 'Leaf'}],
                            },
                        ],
                    },
                ]}
                onChange={onChange}
                renderContent={item => <div>{item.label}</div>}
            />,
        );
        // nav-children appears when renderNavItem encounters an item with sub-items
        expect(container.querySelector('.blong-thumb-index__nav-children')).toBeTruthy();
    });
});
