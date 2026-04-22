import type {IHandlerProxy, IModelSpec} from '@feasibleone/blong';
import {withDefaults} from '../defaults.js';
import {subjectDropdownList} from './subjectDropdownList.js';
import {subjectObjectSchema} from './subjectObjectSchema.js';

export default async (models: IModelSpec[], blong: IHandlerProxy<unknown>) => {
    const mocks: Record<string, () => Promise<object>> = {};
    for (const rawModel of models) {
        const model = withDefaults(rawModel);
        const {subject, object} = model;
        mocks[`${subject}.${object}.schema`] = await subjectObjectSchema(model, blong);
        mocks[`${subject}.dropdown.list`] = await subjectDropdownList(model, blong);
    }

    return mocks;
};
