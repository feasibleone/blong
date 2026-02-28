import pretty from 'pino-pretty';

export default options =>
    pretty({
        ...options,
        messageFormat(
            log: {
                context?: string;
                prefix?: string;
                [messageKey: string]: unknown;
                config?: unknown;
                configBase?: unknown;
                req?: {
                    method: string;
                    url: string;
                    headers?: Record<string, string>;
                    body?: unknown;
                    json?: unknown;
                };
                res?: {
                    statusCode: number;
                    statusMessage: string;
                    headers?: Record<string, string>;
                    body?: unknown;
                };
                $meta?: {
                    mtid?: string;
                    method?: string;
                };
            },
            messageKey,
            levelLabel,
            {colors},
        ) {
            const {
                context,
                prefix,
                [messageKey]: message,
                config,
                configBase,
                req,
                res,
                $meta,
            } = log;
            return [
                context && colors.greenBright(context),
                prefix,
                $meta?.mtid && colors.magenta($meta.mtid),
                $meta?.method && colors.yellow($meta.method),
                message,
                config &&
                    `\u001B]8;;blong://json/${JSON.stringify(config)}\u001B\\config\u001B]8;;\u001B\\`,
                configBase,
                req &&
                    !res &&
                    `▶ ${colors.magenta(req.method)} ${colors.yellow(req.url)}${
                        req.headers
                            ? `\n${Object.entries(req.headers)
                                  .map(
                                      ([key, value]) =>
                                          `    ${colors.blue(key)}: ${colors.green(value)}`,
                                  )
                                  .join('\n')}`
                            : ''
                    }`,
                res &&
                    `◀ ${req ? `${colors.magenta(req.method)} ${colors.yellow(req.url)} ` : ''}${colors.blueBright(res.statusCode)}${
                        res.headers
                            ? `\n${Object.entries(res.headers)
                                  .map(
                                      ([key, value]) =>
                                          `    ${colors.blue(key)}: ${colors.green(value)}`,
                                  )
                                  .join('\n')}`
                            : ''
                    }`,
            ]
                .filter(Boolean)
                .join(' ');
        },
    });
