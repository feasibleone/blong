import {library} from '@feasibleone/blong';
import {Type, type TFunction, type TObject, type TSchema} from 'typebox';

interface IColumnSchema {
    type?: string;
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export default library(
    ({config}) =>
        async function schemaCrudBind(
            subject: string,
            object: string,
            schema: TObject,
            existingHandlers: string[] = [],
        ): Promise<{
            handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
            schemas: Record<string, TFunction>;
        }> {
            const knex = (config as Record<string, any>)?.context?.queryBuilder;
            if (!knex) throw new Error('Knex queryBuilder not available in adapter context');

            const existing = new Set(existingHandlers);
            const tableName = object;
            const objectId = `${object}Id`;
            const objectCapitalized = capitalize(object);

            const handlers: Record<
                string,
                (params: Record<string, unknown>) => Promise<unknown>
            > = {};
            const schemas: Record<string, TFunction> = {};

            const required = new Set(schema.required ?? []);
            const idSchema = (schema.properties[objectId] as TSchema) ?? Type.String();

            const entitySchema = Type.Object(
                Object.fromEntries(
                    Object.entries(schema.properties).map(([k, v]) => [k, v as TSchema]),
                ),
            );

            const allOptionalProps: Record<string, TSchema> = {};
            for (const [name, prop] of Object.entries(schema.properties)) {
                allOptionalProps[name] = Type.Optional(prop as TSchema);
            }

            const addProps: Record<string, TSchema> = {};
            for (const [name, prop] of Object.entries(schema.properties)) {
                if (name === objectId && (prop as IColumnSchema).type === 'integer') continue;
                addProps[name] =
                    required.has(name) && name !== objectId
                        ? (prop as TSchema)
                        : Type.Optional(prop as TSchema);
            }

            const getName = `${subject}${objectCapitalized}Get`;
            if (!existing.has(getName)) {
                handlers[getName] = async function (params: Record<string, unknown>) {
                    const {select = '*', ...where} = params;
                    return knex(tableName).where(where).first(select);
                };
                schemas[getName] = Type.Function(
                    [Type.Object({[objectId]: idSchema})],
                    Type.Promise(entitySchema),
                );
            }

            const findName = `${subject}${objectCapitalized}Find`;
            if (!existing.has(findName)) {
                handlers[findName] = async function (params: Record<string, unknown>) {
                    const {select = '*', order, limit, offset, ...where} = params;
                    let query = knex(tableName).where(where);
                    if (order) query = query.orderBy(order as string);
                    if (limit) query = query.limit(limit as number);
                    if (offset) query = query.offset(offset as number);
                    return query.select(select);
                };
                schemas[findName] = Type.Function(
                    [
                        Type.Object({
                            ...allOptionalProps,
                            select: Type.Optional(Type.String()),
                            order: Type.Optional(Type.String()),
                            limit: Type.Optional(Type.Integer()),
                            offset: Type.Optional(Type.Integer()),
                        }),
                    ],
                    Type.Promise(Type.Array(entitySchema)),
                );
            }

            const addName = `${subject}${objectCapitalized}Add`;
            if (!existing.has(addName)) {
                handlers[addName] = async function (params: Record<string, unknown>) {
                    return {
                        [objectId]: (await knex(tableName).insert(params))?.[0],
                    };
                };
                schemas[addName] = Type.Function(
                    [Type.Object(addProps)],
                    Type.Promise(
                        Type.Object({[objectId]: idSchema}),
                    ),
                );
            }

            const editName = `${subject}${objectCapitalized}Edit`;
            if (!existing.has(editName)) {
                handlers[editName] = async function (params: Record<string, unknown>) {
                    const {key: keyName = objectId, ...columns} = params;
                    const {[keyName as string]: key, ...update} = columns;
                    return knex(tableName)
                        .where({[keyName as string]: key})
                        .update(update);
                };
                schemas[editName] = Type.Function(
                    [
                        Type.Object({
                            [objectId]: idSchema,
                            ...allOptionalProps,
                        }),
                    ],
                    Type.Promise(
                        Type.Integer({description: 'Number of affected rows'}),
                    ),
                );
            }

            const removeName = `${subject}${objectCapitalized}Remove`;
            if (!existing.has(removeName)) {
                handlers[removeName] = async function (params: Record<string, unknown>) {
                    return knex(tableName)
                        .where({[objectId]: params[objectId]})
                        .del();
                };
                schemas[removeName] = Type.Function(
                    [Type.Object({[objectId]: idSchema})],
                    Type.Promise(
                        Type.Integer({description: 'Number of affected rows'}),
                    ),
                );
            }

            const mergeName = `${subject}${objectCapitalized}Merge`;
            if (!existing.has(mergeName)) {
                handlers[mergeName] = async function (params: Record<string, unknown>) {
                    return knex(tableName)
                        .insert(params)
                        .onConflict(objectId)
                        .merge();
                };
                schemas[mergeName] = Type.Function(
                    [
                        Type.Object(
                            Object.fromEntries(
                                Object.entries(schema.properties).map(([k, v]) => [
                                    k,
                                    v as TSchema,
                                ]),
                            ),
                        ),
                    ],
                    Type.Promise(Type.Unknown()),
                );
            }

            return {handlers, schemas};
        },
);
