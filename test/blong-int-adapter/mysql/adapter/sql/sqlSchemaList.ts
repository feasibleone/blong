import {handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function sqlSchemaList(_params, _$meta) {
            return this.config?.context?.queryBuilder
                ?.select('schema_name')
                .from('information_schema.schemata')
                .then((result: {SCHEMA_NAME: string}[]) => {
                    return result.map((row: {SCHEMA_NAME: string}) => row.SCHEMA_NAME);
                });
        },
);
