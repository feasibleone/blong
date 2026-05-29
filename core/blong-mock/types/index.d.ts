import type { IAdapter, IHandlerProxy, IModelSpec, ValidationFn } from '@feasibleone/blong';
export { withDefaults } from './defaults.ts';
export declare function mock(this: IAdapter<{
    context: {
        fixtureData?: Record<string, Record<string, Record<string, unknown>[]>>;
        subjectObject?: Record<string, Record<string, IModelSpec>>;
    };
    portal?: object;
}, object>, models: IModelSpec[], blong: IHandlerProxy<unknown>): Promise<Record<string, () => Promise<object>>>;
export declare function validation(models: IModelSpec[]): Record<string, ValidationFn>;
