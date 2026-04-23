import {library} from '@feasibleone/blong';
import type {TObject} from 'typebox';

interface IColumnSchema {
    type?: string;
    format?: string;
    maxLength?: number;
    default?: unknown;
}

export default library(
    ({config}) => {
        function addColumn(
            table: any,
            columnName: string,
            prop: IColumnSchema,
            isNullable: boolean,
        ): void {
            let column: any;

            if (columnName.endsWith('Id') && prop.type === 'integer') {
                column = table.increments(columnName);
                return;
            }

            switch (prop.type) {
                case 'string':
                    if (prop.format === 'date-time' || prop.format === 'datetime')
                        column = table.dateTime(columnName);
                    else if (prop.format === 'date') column = table.date(columnName);
                    else if (prop.format === 'time') column = table.time(columnName);
                    else if (prop.format === 'uuid') column = table.uuid(columnName);
                    else if (prop.maxLength != null && prop.maxLength > 255)
                        column = table.text(columnName);
                    else column = table.string(columnName, prop.maxLength ?? 255);
                    break;
                case 'number':
                    column = table.double(columnName);
                    break;
                case 'integer':
                    column = table.integer(columnName);
                    break;
                case 'boolean':
                    column = table.boolean(columnName);
                    break;
                case 'array':
                case 'object':
                    column = table.json(columnName);
                    break;
                default:
                    column = table.text(columnName);
                    break;
            }

            if (isNullable) column.nullable();
            else column.notNullable();
            if (prop.default !== undefined) column.defaultTo(prop.default);
        }

        return async function schemaTableSync(
            tableName: string,
            schema: TObject,
            options: {dropColumns?: boolean} = {},
        ): Promise<{created: boolean; added: string[]; dropped: string[]}> {
            const knex = (config as Record<string, any>)?.context?.queryBuilder;
            if (!knex) throw new Error('Knex queryBuilder not available in adapter context');

            const required = new Set(schema.required ?? []);
            const schemaProps = Object.keys(schema.properties);
            const exists = await knex.schema.hasTable(tableName);

            if (!exists) {
                await knex.schema.createTable(tableName, (table: any) => {
                    for (const [name, prop] of Object.entries(schema.properties)) {
                        addColumn(table, name, prop as IColumnSchema, !required.has(name));
                    }
                });
                return {created: true, added: schemaProps, dropped: []};
            }

            const columnInfo = await knex(tableName).columnInfo();
            const existingColumns = new Set(Object.keys(columnInfo));
            const added: string[] = [];
            const dropped: string[] = [];

            await knex.schema.alterTable(tableName, (table: any) => {
                for (const [name, prop] of Object.entries(schema.properties)) {
                    if (!existingColumns.has(name)) {
                        addColumn(table, name, prop as IColumnSchema, true);
                        added.push(name);
                    }
                }

                if (options.dropColumns) {
                    for (const col of existingColumns) {
                        if (!schemaProps.includes(col)) {
                            table.dropColumn(col);
                            dropped.push(col);
                        }
                    }
                }
            });

            return {created: false, added, dropped};
        };
    },
);
