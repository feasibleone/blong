/**
 * ComponentWidget — dynamically loads and renders a portal component.
 *
 * Used as a form field widget with:
 *   `widget: {type: 'component', component: 'portal.page.key', params: {...}}`
 *
 * Dispatches `component/${page}` with the configured page key to obtain a
 * React component, then renders it. Shows a centred spinner while loading.
 *
 * Both `component` and `params` values support `${field}` template expressions
 * resolved against the current form values at mount time.  Uses the
 * blong-template browser engine (Function-constructor based, same syntax as the
 * server-side trusted engine).
 */
import type {IWidgetProps} from '@feasibleone/blong';
import {renderAll} from '@feasibleone/blong-template';
import React from 'react';
import {useBlongForm} from '../components/Form/FormContext.js';
import {useBlongUi} from '../context/BlongUiContext.js';
import {ProgressSpinner} from '../primereact/index.js';

export function ComponentWidget(widgetProps: IWidgetProps) {
    const {schema, loading} = widgetProps;
    const {dispatch} = useBlongUi();
    const formCtx = useBlongForm();
    const page = schema.widget?.component ?? '';
    const params = schema.widget?.params;
    const [errorRender, setErrorRender] = React.useState<Error | null>(null);

    const [LoadedComponent, setLoadedComponent] = React.useState<React.ComponentType<
        IWidgetProps
    > | null>(null);

    const vars = formCtx?.getValues();
    React.useEffect(() => {
        if (!page || loading) return;

        let resolvedPage: string;
        let resolvedParams: Record<string, unknown> = {};
        try {
            resolvedPage = renderAll(page, vars ?? {});
            if (!resolvedPage) return;
            resolvedParams = params
                ? (renderAll(params, vars ?? {}) as Record<string, unknown>)
                : {};
        } catch (error) {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setErrorRender(error as Error);
            return;
        }
        void dispatch<React.ComponentType | null>(`component/${resolvedPage}`, {
            ...resolvedParams,
        })?.then(component => {
            if (component) {
                setErrorRender(null);
                setLoadedComponent(() => component as React.ComponentType<IWidgetProps>);
            }
        });
    }, [page, params, formCtx, dispatch, loading, vars]);

    if (!LoadedComponent) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                }}
            >
                <ProgressSpinner title={errorRender ? errorRender.message : 'Loading...'} />
            </div>
        );
    }

    return <LoadedComponent {...widgetProps} />;
}
