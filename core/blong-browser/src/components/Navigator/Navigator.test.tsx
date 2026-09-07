import {useEffect, useRef} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '../../test/render.js';
import {Navigator, type INavigatorHandle, type INavigatorPathItem} from './Navigator.js';

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

    it('renders with fetch function', async () => {
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
        // Drain the resolved promise state update so it doesn't leak outside the test.
        await act(async () => {});
    });

    it('reports the root→node path when a child node is selected', async () => {
        const onSelectPath = vi.fn();
        render(
            <Navigator
                data={[
                    {key: 'a', label: 'A', parentId: null},
                    {key: 'a/b', label: 'B', parentId: 'a'},
                ]}
                keyField="key"
                parentField="parentId"
                field="label"
                startKey="a"
                onSelectPath={onSelectPath}
            />,
        );
        fireEvent.click(screen.getByText('B'));
        await act(async () => {});
        expect(onSelectPath).toHaveBeenLastCalledWith([
            expect.objectContaining({key: 'a', label: 'A'}),
            expect.objectContaining({key: 'a/b', label: 'B'}),
        ]);
    });

    it('reveals a path via selectPath: materializes children, expands, selects and reports', async () => {
        const onSelectPath = vi.fn();
        const loadChildren = vi.fn(async (node: Record<string, unknown>) =>
            node.key === 'a' ? [{key: 'a/b', label: 'B'}] : [],
        );

        // eslint-disable-next-line @eslint-react/component-hook-factories
        function Harness({path}: {path: INavigatorPathItem[]}) {
            const ref = useRef<INavigatorHandle>(null);
            useEffect(() => {
                void ref.current?.selectPath(path);
            }, [path]);
            return (
                <Navigator
                    ref={ref}
                    data={[{key: 'a', label: 'A'}]}
                    loadChildren={loadChildren}
                    keyField="key"
                    field="label"
                    onSelectPath={onSelectPath}
                />
            );
        }

        render(
            <Harness
                path={[
                    {key: 'a', label: 'A', data: {key: 'a'}},
                    {key: 'a/b', label: 'B', data: {key: 'a/b'}},
                ]}
            />,
        );
        // The child is lazily materialized into the tree (async reveal).
        await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument());
        expect(loadChildren).toHaveBeenCalledWith(expect.objectContaining({key: 'a'}));
        // The full root→node path was reported.
        await waitFor(() =>
            expect(onSelectPath).toHaveBeenCalledWith([
                expect.objectContaining({key: 'a', label: 'A'}),
                expect.objectContaining({key: 'a/b', label: 'B'}),
            ]),
        );
    });

    it('selectPath with an empty path clears the selection', async () => {
        const onSelectPath = vi.fn();

        // eslint-disable-next-line @eslint-react/component-hook-factories
        function Harness() {
            const ref = useRef<INavigatorHandle>(null);
            useEffect(() => {
                void ref.current?.selectPath([]);
            }, []);
            return (
                <Navigator
                    ref={ref}
                    data={[{key: 'a', label: 'A'}]}
                    keyField="key"
                    field="label"
                    onSelectPath={onSelectPath}
                />
            );
        }

        render(<Harness />);
        await act(async () => {});
        expect(onSelectPath).toHaveBeenCalledWith([]);
    });

    it('jumpTo resolves a label path, materializing lazy children and revealing it', async () => {
        const onSelectPath = vi.fn();
        const loadChildren = vi.fn(async (node: Record<string, unknown>) =>
            node.key === 'a' ? [{key: 'a/b', label: 'B'}] : [],
        );

        // eslint-disable-next-line @eslint-react/component-hook-factories
        function Harness() {
            const ref = useRef<INavigatorHandle>(null);
            useEffect(() => {
                void ref.current?.jumpTo(['A', 'B']).then(found => {
                    (window as {__jumpFound?: boolean}).__jumpFound = found;
                });
            }, []);
            return (
                <Navigator
                    ref={ref}
                    data={[{key: 'a', label: 'A'}]}
                    loadChildren={loadChildren}
                    keyField="key"
                    field="label"
                    onSelectPath={onSelectPath}
                />
            );
        }

        render(<Harness />);
        // The child is lazily materialized via the label path.
        await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument());
        expect(loadChildren).toHaveBeenCalledWith(expect.objectContaining({key: 'a'}));
        await waitFor(() =>
            expect(onSelectPath).toHaveBeenCalledWith([
                expect.objectContaining({key: 'a', label: 'A'}),
                expect.objectContaining({key: 'a/b', label: 'B'}),
            ]),
        );
        await waitFor(() => expect((window as {__jumpFound?: boolean}).__jumpFound).toBe(true));
    });

    it('jumpTo returns false when a label does not match', async () => {
        const onSelectPath = vi.fn();

        // eslint-disable-next-line @eslint-react/component-hook-factories
        function Harness() {
            const ref = useRef<INavigatorHandle>(null);
            useEffect(() => {
                void ref.current?.jumpTo(['Nope']).then(found => {
                    (window as {__jumpMissing?: boolean}).__jumpMissing = found;
                });
            }, []);
            return (
                <Navigator
                    ref={ref}
                    data={[{key: 'a', label: 'A'}]}
                    keyField="key"
                    field="label"
                    onSelectPath={onSelectPath}
                />
            );
        }

        render(<Harness />);
        await waitFor(() =>
            expect((window as {__jumpMissing?: boolean}).__jumpMissing).toBe(false),
        );
        expect(onSelectPath).not.toHaveBeenCalled();
    });
});
