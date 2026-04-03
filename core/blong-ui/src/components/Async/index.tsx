/**
 * Async — dynamic async component loader with loading skeleton.
 */
import {ProgressBar} from 'primereact/progressbar';
import React, {Suspense, lazy, type ComponentType} from 'react';

interface IAsyncProps {
    component: () => Promise<ComponentType<Record<string, unknown>>>;
    params?: Record<string, unknown>;
    fallback?: React.ReactNode;
}

export function Async({component, params, fallback}: IAsyncProps) {
    // Use lazy + Suspense for proper streaming
    const LazyComponent = lazy(async () => {
        const Comp = await component();
        return {default: Comp};
    });

    return (
        <Suspense
            fallback={
                fallback ?? (
                    <div className="blong-async-loading">
                        <ProgressBar
                            mode="indeterminate"
                            style={{height: '3px'}}
                        />
                    </div>
                )
            }
        >
            <LazyComponent {...(params ?? {})} />
        </Suspense>
    );
}
