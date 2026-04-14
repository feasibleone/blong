/**
 * Model system — public exports.
 *
 * @example Realm component handler using createModelHandlers:
 *
 *   // marine/component/index.ts
 *   import {createModelHandlers} from '@feasibleone/blong-browser';
 *   import models from '../model/index.js';
 *   export default createModelHandlers(models);
 *
 * @example Storybook/test mock:
 *
 *   import {setupModelMock} from '@feasibleone/blong-browser/src/model/mock.js';
 *   setupModelMock({subjects: {...}, dropdowns: {...}});
 */
export type {
    IBrowserConfig,
    IBrowserPermissions,
    ICardOverride,
    IDropdownOption,
    IEditorConfig,
    ILayoutTab,
    IMethodsConfig,
    IModelSpec,
    IPartialModelSpec,
    IPropertyOverride,
    IReportConfig,
    IResolvedModelSpec,
    ISchemaOverlay,
    IWidgetOverride,
} from '@feasibleone/blong';
export {createModelHandlers} from './createModelHandlers.js';
export {deepMerge, withDefaults} from './defaults.js';
export {dropdownRegistry} from './dropdownRegistry.js';
export {setupModelMock, teardownModelMock} from './mock.js';
export {getObjectSchema, getSubjectApi, setBaseUrl, setFetchFn} from './schemaFetcher.js';
