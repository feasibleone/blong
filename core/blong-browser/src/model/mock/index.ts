import type {IHandlerProxy, IModelSpec} from '@feasibleone/blong';
import {withDefaults} from '../defaults.js';
import {subjectObjectSchema} from './subjectObjectSchema.js';

export default async (models: IModelSpec[], blong: Pick<IHandlerProxy<{}>, 'handler'>) => {
    const components: Record<string, unknown> = {};
    for (const rawModel of models) {
        const model = withDefaults(rawModel);
        const {subject, object} = model;
        components[`${subject}.${object}.schema`] = await subjectObjectSchema(model)(blong);
    }

    return components;
};
