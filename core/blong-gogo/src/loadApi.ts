import parser from '@apidevtools/swagger-parser';
import type {IPlatformApi} from '@feasibleone/blong/types';
import ky from 'ky';
import merge from 'ut-function.merge';
import yaml from 'yaml';

export default async function loadApi(
    locations: string | string[] | object | object[] | {assets: object},
    source: string = process.cwd(),
    platformApi: IPlatformApi,
): ReturnType<typeof parser.dereference> {
    const documents = [];
    source = source.startsWith('file://') ? platformApi.dirname(source.slice(7)) : source;
    if (typeof locations === 'object' && 'assets' in locations) {
        locations = Object.entries(locations.assets)
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
            .map(([, value]) => value);
    }

    for (const location of ([] as unknown[]).concat(locations as unknown)) {
        if (typeof location === 'object') documents.push(location);
        else if (typeof location === 'string') {
            if (location.startsWith('http')) {
                const response = await ky.get(location);
                const contentType = response?.headers?.get('content-type')?.split(';')[0];
                switch (contentType) {
                    case 'application/json':
                        documents.push(JSON.parse(await response.text()));
                        break;
                    case 'application/yaml':
                    case 'application/x-yaml':
                        documents.push(yaml.parse(await response.text()));
                        break;
                    case 'text/plain':
                        // try to parse as JSON
                        try {
                            documents.push(JSON.parse(await response.text()));
                        } catch {
                            // try to parse as YAML
                            try {
                                documents.push(yaml.parse(await response.text()));
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
                        yaml.parse(
                            platformApi
                                .readFileSync(platformApi.resolve(source, filename), {
                                    encoding: 'utf-8',
                                })
                                .toString('utf-8'),
                        ),
                    );
                else if (filename.endsWith('.json'))
                    documents.push(
                        (
                            await import(platformApi.resolve(source, filename), {
                                with: {type: 'json'},
                            })
                        ).default,
                    );
            }
        }
    }
    return await parser.dereference(merge(...documents));
}
