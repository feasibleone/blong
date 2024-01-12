import {realm, type ModuleApi} from '@feasibleone/blong';
import sqlPort from 'ut-port-sql';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
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
    default: {},
    microservice: {
        adapter: true,
    },
}));
