import type {IHandlerProxy, IModelSpec} from '@feasibleone/blong';
import {withDefaults} from '../defaults.js';

const fixtureData: Record<string, Record<string, Record<string, unknown>[]>> = {};
const subjectObject: Record<string, Record<string, IModelSpec>> = {};
export default async (models: IModelSpec[], blong: IHandlerProxy<unknown>) => {
    const mocks: Record<string, () => Promise<object>> = {};
    const fixture = async (name: string) => {
        const subject = name.split('.')[0];
        fixtureData[subject] ||= {};
        Object.assign(fixtureData[subject], await blong.handler[`${subject}Fixture`]({}, {}));
        return fixtureData[subject][name] ?? [];
    };
    for (const rawModel of models) {
        const model = withDefaults(rawModel);
        const {subject, object, keyField} = model;
        subjectObject[subject] ||= {};
        subjectObject[subject][object] = model;
        const get = async ({[keyField]: id}: Record<string, unknown>) => {
            return {
                [object]:
                    (await fixture(`${subject}.${object}`)).find(item => item[keyField] === id) ||
                    null,
            };
        };
        Object.assign(mocks, {
            [`${subject}.${object}.schema`]() {
                // console.log(`Generating schema mock for ${subject}.${object}...`);
                return {};
            },
            [`${subject}.${object}.find`]() {
                // console.log(`Generating find mock for ${subject}.${object}...`);
                return fixture(`${subject}.${object}`);
            },
            [`${subject}.${object}.get`]: get,
            async [`${subject}.${object}.report`](params: Record<string, unknown>) {
                // console.log(`Generating report mock for ${subject}.${object} with params`, params);
                return {
                    rows: await fixture(`${subject}.${object}`),
                };
            },
            async [`${subject}.${object}.edit`]({
                [keyField]: id,
                ...data
            }: Record<string, unknown>) {
                // console.log(`Generating edit mock for ${subject}.${object} with id ${id} and data`, data);
                const items = await fixture(`${subject}.${object}`);
                const index = items.findIndex(item => item[keyField] === id);
                if (index !== -1) {
                    items[index] = {...items[index], ...data};
                    return get({[keyField]: id});
                } else {
                    return {success: false, message: 'Item not found'};
                }
            },
            async [`${subject}.${object}.add`](data: Record<string, unknown>) {
                // console.log(`Generating add mock for ${subject}.${object} with data`, data);
                const items = await fixture(`${subject}.${object}`);
                data[keyField] = Math.max(0, ...items.map(item => Number(item[keyField]) || 0)) + 1;
                items.push(data);
                return get({[keyField]: data[keyField]});
            },
        });
        mocks[`${subject}.dropdown.list`] ||= async () => {
            const result: Record<string, {value: unknown; label: unknown}[]> = {};
            // console.log(`Generating dropdown list mock for ${subject}...`);
            for (const object of Object.keys(subjectObject[subject] ?? {})) {
                const model = subjectObject[subject][object];
                const {nameField, keyField} = withDefaults(model);
                const fixtureData = await fixture(`${subject}.${object}`);
                const name = `${subject}.${object}`;
                result[name] = fixtureData.map(({[keyField]: value, [nameField
                        .split('.')
                        .pop()!]: label}) => ({
                    value,
                    label,
                }));
            }
            console.log(`Generated dropdown list mock for ${subject}:`, result);
            return result;
        };
    }
    console.log('Generated mocks:', Object.keys(mocks));

    return mocks;
};
