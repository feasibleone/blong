import {type IMeta, library} from '@feasibleone/blong';
import {Type, type TFunction, type TSchema} from 'typebox';

function snakeToCamel(str: string): string {
    return str.replace(/([-_]\w)/g, g => g[1].toUpperCase());
}

function sqlTypeToTypebox(sqlType: string): TSchema {
    switch (sqlType.toUpperCase()) {
        case 'VARCHAR':
        case 'CHAR':
        case 'TEXT':
        case 'MEDIUMTEXT':
        case 'LONGTEXT':
        case 'TINYTEXT':
        case 'ENUM':
        case 'SET':
            return Type.String();
        case 'INT':
        case 'INTEGER':
        case 'BIGINT':
        case 'SMALLINT':
        case 'TINYINT':
        case 'MEDIUMINT':
            return Type.Integer();
        case 'DECIMAL':
        case 'FLOAT':
        case 'DOUBLE':
        case 'NUMERIC':
        case 'REAL':
            return Type.Number();
        case 'BOOLEAN':
        case 'BOOL':
        case 'BIT':
            return Type.Boolean();
        case 'DATE':
            return Type.String({format: 'date'});
        case 'DATETIME':
        case 'TIMESTAMP':
            return Type.String({format: 'date-time'});
        case 'TIME':
            return Type.String({format: 'time'});
        case 'JSON':
            return Type.Unknown();
        default:
            return Type.String();
    }
}

export default library(
    ({config}) =>
        async function schemaProcedureBind(
            namespace: string,
            schema?: string,
        ): Promise<{
            handlers: Record<
                string,
                (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>
            >;
            schemas: Record<string, TFunction>;
        }> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const knex = (config as Record<string, any>)?.context?.queryBuilder;
            if (!knex) throw new Error('Knex queryBuilder not available in adapter context');

            const dbName =
                schema ?? (knex.client?.config?.connection?.database as string | undefined);

            const procedures: Array<{ROUTINE_NAME: string}> = await knex
                .select('ROUTINE_NAME')
                .from('information_schema.ROUTINES')
                .where('ROUTINE_SCHEMA', dbName)
                .where('ROUTINE_TYPE', 'PROCEDURE')
                .andWhere('ROUTINE_NAME', 'like', `${namespace}%`);

            const handlers: Record<
                string,
                (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>
            > = {};
            const schemas: Record<string, TFunction> = {};

            for (const proc of procedures) {
                const spName = proc.ROUTINE_NAME;
                const handlerName = snakeToCamel(spName);

                const parameters: Array<{
                    PARAMETER_NAME: string;
                    DATA_TYPE: string;
                    PARAMETER_MODE: string;
                }> = await knex
                    .select('PARAMETER_NAME', 'DATA_TYPE', 'PARAMETER_MODE')
                    .from('information_schema.PARAMETERS')
                    .where('SPECIFIC_SCHEMA', dbName)
                    .where('SPECIFIC_NAME', spName)
                    .whereNotNull('PARAMETER_NAME')
                    .orderBy('ORDINAL_POSITION');

                const inParams = parameters.filter(
                    p => p.PARAMETER_MODE === 'IN' || p.PARAMETER_MODE === 'INOUT',
                );

                handlers[handlerName] = async function (
                    params: Record<string, unknown>,
                ) {
                    const placeholders = inParams.map(() => '?').join(', ');
                    const values = inParams.map(p => params[snakeToCamel(p.PARAMETER_NAME)]);
                    const result = await knex.raw(
                        `CALL \`${spName}\`(${placeholders})`,
                        values,
                    );
                    return Array.isArray(result?.[0]) ? result[0][0] : result?.[0];
                };

                const paramProperties: Record<string, TSchema> = {};
                for (const p of inParams) {
                    paramProperties[snakeToCamel(p.PARAMETER_NAME)] = sqlTypeToTypebox(
                        p.DATA_TYPE,
                    );
                }

                schemas[handlerName] = Type.Function(
                    [Type.Object(paramProperties)],
                    Type.Promise(Type.Unknown()),
                );
            }

            return {handlers, schemas};
        },
);
