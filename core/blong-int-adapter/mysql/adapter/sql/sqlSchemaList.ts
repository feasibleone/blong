import {handler} from '@feasibleone/blong';

export default handler(
    proxy =>
        async function sqlSchemaList(params, $meta) {
            return this.config?.context?.queryBuilder
                ?.select('schema_name')
                .from('information_schema.schemata')
                .then(result => {
                    return result.map((row: any) => row.SCHEMA_NAME);
                });
        },
);
