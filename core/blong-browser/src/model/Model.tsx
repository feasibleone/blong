import type {IComponent} from '@feasibleone/blong';
import {useEffect} from 'react';
import {Portal} from '../components/Portal/index.js';
import {useBlongUi} from '../index.js';
import {useAppStore} from '../state/appStore.js';
import type {ITab} from '../types/portal.js';

export function Model({
    componentName,
    params,
}: {
    componentName: string;
    params?: Record<string, unknown>;
}) {
    const {dispatch} = useBlongUi();
    useEffect(() => {
        // Reset first to avoid bleed-through from previous stories
        useAppStore.setState({portal: {tabs: [], activeTabId: null, menuConfig: null}});
        const store = useAppStore.getState();
        store.setPermissions(true);

        void (async () => {
            try {
                const component = await dispatch<IComponent>(`component/${componentName}`);
                const tab: ITab = {
                    id: 'test-tab',
                    actionName: 'test-action',
                    params,
                    title: componentName,
                    component: (await component?.component(params)) as React.ComponentType,
                };
                store.openTab(tab);
            } catch {}
        })();

        return () => {
            useAppStore.setState({portal: {tabs: [], activeTabId: null, menuConfig: null}});
        };
    }, []);
    return <Portal />;
}
