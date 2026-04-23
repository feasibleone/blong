import {library} from '@feasibleone/blong';
import {readFileSync, readdirSync} from 'node:fs';
import {join, basename} from 'node:path';

export default library(
    ({config}) =>
        async function schemaProcedureSync(
            procedures: string | Array<{name: string; sql: string}>,
        ): Promise<{created: string[]}> {
            const knex = (config as Record<string, any>)?.context?.queryBuilder;
            if (!knex) throw new Error('Knex queryBuilder not available in adapter context');

            let definitions: Array<{name: string; sql: string}>;

            if (typeof procedures === 'string') {
                const dir = procedures;
                const files = readdirSync(dir).filter(f => f.endsWith('.sql'));
                definitions = files.map(f => ({
                    name: basename(f, '.sql'),
                    sql: readFileSync(join(dir, f), 'utf8'),
                }));
            } else {
                definitions = procedures;
            }

            const created: string[] = [];

            for (const {name, sql} of definitions) {
                await knex.raw(`DROP PROCEDURE IF EXISTS ??`, [name]);
                await knex.raw(sql);
                created.push(name);
            }

            return {created};
        },
);
