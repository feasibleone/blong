import sqlPort from 'ut-port-sql';
export default (layer: {config?: {test?: unknown}}): unknown =>
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
                    layer.config?.test && /(^|\.)sql(Unit)?Test$/,
                    /(^|\.)sqlExternal$/,
                ].filter(Boolean),
            };
        }
    };
