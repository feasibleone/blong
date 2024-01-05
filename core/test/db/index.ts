import {realm, type ModuleApi} from '@feasibleone/blong';
import {createRequire} from 'node:module';
import sqlPort from 'ut-port-sql';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    url: import.meta.url,
    default: {},
    microservice: {
        adapter: true,
    },
    validation: fo.Type.Object({}),
    children: [
        function adapter(layer: ModuleApi) {
            return layer.sql(
                class extends sqlPort(layer) {
                    public get defaults(): object {
                        return {
                            cache: true,
                            connectionTimeout: 60000,
                            requestTimeout: 60000,
                            concurrency: 200,
                            create: false,
                            createTT: true,
                            doc: false,
                            linkSP: true,
                            logLevel: 'info',
                            retry: false,
                            updates: false,
                            imports: [
                                /(^|\.)sql$|\.sqlPolicy$/,
                                /(^|\.)sqlSeed$/,
                                /(^|\.)sqlData/,
                                /(^|\.)sqlStandard$/,
                                // test && /(^|\.)sql(Unit)?Test$/,
                                /(^|\.)sqlExternal$/,
                            ].filter(Boolean),
                        };
                    }
                }
            );
        },
    ],
}));
