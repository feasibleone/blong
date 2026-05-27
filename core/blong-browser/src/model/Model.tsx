import type {IComponent} from '@feasibleone/blong';
import {useEffect} from 'react';
import {Portal} from '../components/Portal/Portal.js';
import {useBlong} from '../index.js';
import {useAppStore} from '../state/appStore.js';
import type {ITab} from '../types/portal.js';

export function Model({
    componentName,
    params,
}: {
    componentName: string;
    params?: Record<string, unknown>;
}) {
    const {handler} = useBlong();
    useEffect(() => {
        // Reset first to avoid bleed-through from previous stories
        useAppStore.setState({portal: {tabs: [], activeTabId: null, portalConfig: null}});
        const store = useAppStore.getState();
        store.setPermissions(true);

        void (async () => {
            try {
                const component = await (handler[`component/${componentName}`]({}, {}) as Promise<IComponent>);
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
            useAppStore.setState({portal: {tabs: [], activeTabId: null, portalConfig: null}});
        };
        // eslint-disable-next-line @eslint-react/exhaustive-deps -- run once on mount
    }, []);
    return <Portal />;
}
