import parser from '@apidevtools/swagger-parser';
import got from 'got';
import {resolve} from 'node:path';
import merge from 'ut-function.merge';

export default async function loadApi(
    locations: string | string[] | object | object[],
    source: string = process.cwd()
): ReturnType<typeof parser.dereference> {
    const documents = [];
    for (const location of [].concat(locations)) {
        if (typeof location === 'object') documents.push(location);
        else if (typeof location === 'string') {
            if (location.startsWith('http'))
                documents.push(await got(location, {responseType: 'json'}).json());
            else
                documents.push(
                    (await import(resolve(source, location), {assert: {type: 'json'}})).default
                );
        }
    }
    return await parser.dereference(merge(...documents));
}
