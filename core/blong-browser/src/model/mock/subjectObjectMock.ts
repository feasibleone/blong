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
            async [`${subject}.${object}.find`](
                this: IAdapter<object, object>,
                {
                    paging: {pageNumber, pageSize} = {pageNumber: 1, pageSize: 10},
                    paging,
                    orderBy,
                    search,
                    ...params
                }: {
                    paging?: {pageNumber: number; pageSize: number};
                    orderBy?: (string | {field: string; dir: 'ASC' | 'DESC'})[];
                    search?: string;
                    [key: string]: unknown;
                },
            ) {
                // console.log(`Generating find mock for ${subject}.${object}...`);
                this.log?.info?.(
                    {
                        $meta: {method: `${subject}.${object}.find`},
                        paging,
                        orderBy,
                        search,
                        ...params,
                    },
                    'Mock find',
                );
                return structuredClone(await fixture(`${subject}.${object}`))
                    .filter(item => {
                        for (const [key, value] of Object.entries(params)) {
                            if (item[key] !== value) return false;
                        }
                        if (search) {
                            if (
                                !Object.values(item).some(val =>
                                    String(val).toLowerCase().includes(search.toLowerCase()),
                                )
                            )
                                return false;
                        }
                        return true;
                    })
                    .sort((a, b) => {
                        if (!orderBy) return 0;
                        for (const order of orderBy) {
                            const field = typeof order === 'string' ? order : order.field;
                            const dir = typeof order === 'string' ? 'ASC' : order.dir;
                            if (typeof a[field] === 'number' && typeof b[field] === 'number') {
                                if (a[field] < b[field]) return dir === 'ASC' ? -1 : 1;
                                if (a[field] > b[field]) return dir === 'ASC' ? 1 : -1;
                            } else {
                                const aStr = String(a[field]).toLowerCase();
                                const bStr = String(b[field]).toLowerCase();
                                if (aStr < bStr) return dir === 'ASC' ? -1 : 1;
                                if (aStr > bStr) return dir === 'ASC' ? 1 : -1;
                            }
                        }
                        return 0;
                    })
                    .slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
            },
            [`${subject}.${object}.get`]: get,
            async [`${subject}.${object}.remove`](
                this: IAdapter<object, object>,
                {[keyField]: id, ...rest}: Record<string, unknown>,
            ) {
                this.log?.info?.(
                    {
                        [keyField]: id,
                        ...rest,
                        $meta: {method: `${subject}.${object}.remove`},
                    },
                    `Mock remove ${id}`,
                );
                const items = await fixture(`${subject}.${object}`);
                const index = items.findIndex(item => item[keyField] === id);
                if (index !== -1) {
                    items.splice(index, 1);
                    return {success: true};
                } else {
                    return {success: false, message: 'Item not found'};
                }
            },
            async [`${subject}.${object}.report`](
                this: IAdapter<object, object>,
                {
                    paging: {pageNumber, pageSize} = {pageNumber: 1, pageSize: 25},
                    paging,
                    orderBy,
                    search,
                    ...filterParams
                }: {
                    paging?: {pageNumber: number; pageSize: number};
                    orderBy?: (string | {field: string; dir: 'ASC' | 'DESC'})[];
                    search?: string;
                    [key: string]: unknown;
                },
            ) {
                this.log?.info?.(
                    {
                        paging,
                        orderBy,
                        search,
                        ...filterParams,
                        $meta: {method: `${subject}.${object}.report`},
                    },
                    'Mock report',
                );
                const allRows = await fixture(`${subject}.${object}`);
                let result = structuredClone(allRows);
                // Apply flat filter params (e.g. {coralName: 'Pink'})
                for (const [key, value] of Object.entries(filterParams)) {
                    if (value !== undefined && value !== null && value !== '') {
                        result = result.filter(item =>
                            String(item[key] ?? '')
                                .toLowerCase()
                                .includes(String(value).toLowerCase()),
                        );
                    }
                }
                if (search) {
                    const s = String(search).toLowerCase();
                    result = result.filter(item =>
                        Object.values(item).some(v =>
                            String(v ?? '')
                                .toLowerCase()
                                .includes(s),
                        ),
                    );
                }
                if (orderBy?.length) {
                    result = result.sort((a, b) => {
                        for (const order of orderBy!) {
                            const field = typeof order === 'string' ? order : order.field;
                            const dir = typeof order === 'string' ? 'ASC' : (order.dir ?? 'ASC');
                            const av = a[field];
                            const bv = b[field];
                            if (av === bv) continue;
                            if (typeof av === 'number' && typeof bv === 'number') {
                                return dir === 'ASC' ? av - bv : bv - av;
                            }
                            const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
                            return dir === 'ASC' ? cmp : -cmp;
                        }
                        return 0;
                    });
                }
                const recordsTotal = result.length;
                const items = result.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
                return {items, pagination: {recordsTotal}};
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
