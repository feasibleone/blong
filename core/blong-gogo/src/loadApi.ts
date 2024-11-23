import parser from '@apidevtools/swagger-parser';
import got from 'got';
import fs from 'node:fs';
import {dirname, resolve} from 'node:path';
import merge from 'ut-function.merge';
import yaml from 'yaml';

export default async function loadApi(
    locations: string | string[] | object | object[],
    source: string = process.cwd()
): ReturnType<typeof parser.dereference> {
    const documents = [];
    source = source.startsWith('file://') ? dirname(source.slice(7)) : source;

    for (const location of [].concat(locations)) {
        if (typeof location === 'object') documents.push(location);
        else if (typeof location === 'string') {
            if (location.startsWith('http')) {
                const response = await got(location);
                const contentType = response.headers['content-type'].split(';')[0];
                switch (contentType) {
                    case 'application/json':
                        documents.push(JSON.parse(response.body));
                        break;
                    case 'application/yaml':
                    case 'application/x-yaml':
                        documents.push(yaml.parse(response.body));
                        break;
                    case 'text/plain':
                        // try to parse as JSON
                        try {
                            documents.push(JSON.parse(response.body));
                        } catch {
                            // try to parse as YAML
                            try {
                                documents.push(yaml.parse(response.body));
                            } catch {
                                throw new Error(`Parsing failed for ${location}`);
                            }
                        }
                        break;
                    default:
                        throw new Error(`Unsupported content type: ${contentType}`);
                }
            } else {
                const filename = location.startsWith('file://') ? location.slice(7) : location;
                if (filename.endsWith('.yaml') || filename.endsWith('.yml'))
                    documents.push(
                        yaml.parse(fs.readFileSync(resolve(source, filename), {encoding: 'utf-8'}))
                    );
                else if (filename.endsWith('.json'))
                    documents.push(
                        (await import(resolve(source, filename), {assert: {type: 'json'}})).default
                    );
            }
        }
    }
    return await parser.dereference(merge(...documents));
}
