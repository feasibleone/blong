import {handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function sqlSchemaList() {
            // @ts-expect-error -- `this` is bound to adapter context by the blong runtime
            return this.config?.context?.queryBuilder
                ?.select('schema_name')
                .from('information_schema.schemata')
                .then((result: {SCHEMA_NAME: string}[]) => result.map(row => row.SCHEMA_NAME));
        },
);
