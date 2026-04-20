import type {IPlatformApi} from '@feasibleone/blong/types';

/**
 * Generate a `~.schema.ts` file from handler `type Handler` signatures.
 *
 * Reads each handler file, extracts the `type Handler = (...) => ...` signature,
 * converts it to a TypeBox schema via `@sinclair/typebox-codegen`, and writes
 * a single barrel file that exports `validationHandlers({…})`.
 */
export async function generateSchemaFile(
    platform: IPlatformApi,
    files: {filename: string; name: string}[],
    dir: string,
): Promise<void> {
    const [schema, names] = files.reduce(
        (prev, {filename, name}) => {
            const schema = platform
                .readFileSync(filename)
                .toString()
                .match(
                    /^(\/\*\*((?!\*\/\n).)*\*\/\n)?type Handler = \(((?!(>|}|>});?\n).)*(>|}|>});?\n/ms,
                )?.[0];
            return schema
                ? [
                      [...prev[0], schema.replace('type Handler = (', `type ${name} = (`)],
                      [...prev[1], name],
                  ]
                : prev;
        },
        [[], []],
    );
    const {Formatter, TypeScriptToTypeBox} = await import('@sinclair/typebox-codegen');
    if (schema.length)
        platform.writeFileSync(
            platform.join(dir, '~.schema.ts'),
            Formatter.Format(`/* eslint-disable indent,semi */
            /* eslint-disable @typescript-eslint/naming-convention */
            /* eslint-disable @rushstack/typedef-var */

            import {validationHandlers} from '@feasibleone/blong';
            import { Type, type Static } from 'typebox';

            ${TypeScriptToTypeBox.Generate(schema.sort().join('\n'), {useTypeBoxImport: false}).trim()}

            export default validationHandlers({
                ${names.sort().join(',\n')}
            });

            declare module '@feasibleone/blong' {
                interface ISchema {
                    ${names
                        .map(
                            name =>
                                `${name}(params: Parameters<${name}>[0], $meta: IMeta): ReturnType<${name}>;`,
                        )
                        .join('\n')}
                }
            }

        `),
        );
}
