import { createRequire } from 'node:module';
import sqlPort from 'ut-port-sql';

import { realm } from '@feasibleone/blong';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
    },
    microservice: {
        adapter: true
    },
    validation: fo.Type.Object({}),
    children: [
        function adapter(layer) {
            return layer.sql(class extends sqlPort(layer) {
                get defaults() {
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
                            /(^|\.)sqlExternal$/
                        ].filter(Boolean)
                    };
                }
            });
        }]
}));
