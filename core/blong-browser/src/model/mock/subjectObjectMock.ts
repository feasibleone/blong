import type {IAdapter, IHandlerProxy, IModelSpec} from '@feasibleone/blong';
import {withDefaults} from '../defaults.js';

const fixtureData: Record<string, Record<string, Record<string, unknown>[]>> = {};
const subjectObject: Record<string, Record<string, IModelSpec>> = {};
export default async function mock(
    this: IAdapter<object, object>,
    models: IModelSpec[],
    blong: IHandlerProxy<unknown>,
) {
    const mocks: Record<string, () => Promise<object>> = {};
    const fixture = async (name: string) => {
        const subject = name.split('.')[0];
        if (!fixtureData[subject]) {
            fixtureData[subject] ||= {};
            Object.assign(fixtureData[subject], await blong.handler[`${subject}Fixture`]({}, {}));
        }
        return fixtureData[subject][name] ?? [];
    };
    for (const rawModel of models) {
        const model = withDefaults(rawModel);
        const {subject, object, keyField} = model;
        subjectObject[subject] ||= {};
        subjectObject[subject][object] = model;
        async function get(
            this: IAdapter<object, object>,
            {[keyField]: id, ...rest}: Record<string, unknown>,
        ) {
            this.log?.info?.(
                {
                    [keyField]: id,
                    ...rest,
                    $meta: {method: `${subject}.${object}.get`},
                },
                `Mock get ${id}`,
            );
            return structuredClone({
                [object]:
                    (await fixture(`${subject}.${object}`)).find(item => item[keyField] === id) ||
                    null,
            });
        }
        Object.assign(mocks, {
            [`${subject}.${object}.schema`](this: IAdapter<object, object>) {
                this.log?.info?.(
                    {
                        $meta: {method: `${subject}.${object}.schema`},
                    },
                    'Mock schema',
                );
                return {};
            },
            async [`${subject}.${object}.find`](this: IAdapter<object, object>) {
                // console.log(`Generating find mock for ${subject}.${object}...`);
                this.log?.info?.(
                    {
                        $meta: {method: `${subject}.${object}.find`},
                    },
                    'Mock find',
                );
                return structuredClone(await fixture(`${subject}.${object}`));
            },
            [`${subject}.${object}.get`]: get,
            async [`${subject}.${object}.report`](
                this: IAdapter<object, object>,
                params: Record<string, unknown>,
            ) {
                this.log?.info?.(
                    {
                        ...params,
                        $meta: {method: `${subject}.${object}.report`},
                    },
                    'Mock report',
                );
                return {
                    rows: await fixture(`${subject}.${object}`),
                };
            },
            async [`${subject}.${object}.edit`](
                this: IAdapter<object, object>,
                {
                    [object]: {[keyField]: id, ...data},
                    ...rest
                }: Record<string, Record<string, unknown>>,
            ) {
                this.log?.info?.(
                    {
                        [object]: {[keyField]: id, ...data},
                        ...rest,
                        $meta: {method: `${subject}.${object}.edit`},
                    },
                    `Mock edit ${id}`,
                );
                const items = await fixture(`${subject}.${object}`);
                const index = items.findIndex(item => item[keyField] === id);
                if (index !== -1) {
                    items[index] = {...items[index], ...data};
                    return get.apply(this, [{[keyField]: id}]);
                } else {
                    return {success: false, message: 'Item not found'};
                }
            },
            async [`${subject}.${object}.add`](
                this: IAdapter<object, object>,
                {[object]: data, ...rest}: Record<string, Record<string, unknown>>,
            ) {
                this.log?.info?.(
                    {
                        [object]: data,
                        ...rest,
                        $meta: {method: `${subject}.${object}.add`},
                    },
                    'Mock add',
                );
                const items = await fixture(`${subject}.${object}`);
                data[keyField] = Math.max(0, ...items.map(item => Number(item[keyField]) || 0)) + 1;
                items.push(data);
                return get.apply(this, [{[keyField]: data[keyField]}]);
            },
        });
        mocks[`${subject}.dropdown.list`] ||= async () => {
            const result: Record<string, {value: unknown; label: unknown}[]> = {};
            this.log?.info?.(
                {$meta: {method: `${subject}.dropdown.list`}},
                `Generating dropdown list mock`,
            );
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
            this.log?.info?.(
                {
                    ...result,
                    $meta: {method: `${subject}.dropdown.list`},
                },
                'Mock dropdown',
            );
            return result;
        };
    }
    this.log?.info?.(
        {$meta: {method: 'subject.object.mock'}, mocks: Object.keys(mocks).join(', ')},
        'Generated mocks',
    );

    return mocks;
}
