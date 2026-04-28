/**
 * Ambient module declarations for third-party packages that lack TypeScript
 * declarations.  These shims give each module the minimal shape the consuming
 * code actually relies on; they intentionally use `any` for the parts that are
 * not exercised in a type-safe way.
 */

declare module 'reconnect-core' {
    type Connect = (...args: unknown[]) => unknown;
    type Reconnect = {
        on(event: string, handler: (...args: unknown[]) => void): Reconnect;
        connect(opts?: object): Reconnect;
        disconnect(): unknown;
        removeAllListeners(): void;
    };
    function reconnectCore(
        factory: (...args: unknown[]) => unknown,
    ): (connect: (...args: unknown[]) => void) => Reconnect;
    export default reconnectCore;
}

declare module 'ut-bitsyntax' {
    const bitSyntax: {
        builder(pattern: string): (data: object) => Buffer;
        matcher(pattern: string): (...args: unknown[]) => unknown;
    };
    export default bitSyntax;
}

declare module 'mongo-uri-builder' {
    function mongoUriBuilder(options: object): string;
    export default mongoUriBuilder;
}

declare module 'ut-function.interpolate' {
    function interpolate(template: string, params?: object): string;
    export default interpolate;
}

declare module 'ut-bus/resolver.ts' {
    function resolver(
        hostname: string,
        type: string,
        tls?: boolean,
    ): Promise<{target: string; port: string}>;
    export default resolver;
}

declare module 'ut-dns-discovery' {
    type AnnounceCallback = (error?: Error | null) => void;
    type Discovery = () => {
        announce(service: string, port: string | number, cb: AnnounceCallback): void;
        unannounce(service: string, port: string | number, cb: AnnounceCallback): void;
    };
    const discovery: Discovery;
    export default discovery;
}

// Vite / esbuild glob-import support
interface ImportMeta {
    glob(patterns: string | string[]): Record<string, () => Promise<unknown>>;
    glob<T>(patterns: string | string[], options?: object): Record<string, () => Promise<T>>;
}

declare module 'picomatch' {
    function picomatch(glob: string | string[], options?: object): (path: string) => boolean;
    export default picomatch;
}

declare module 'minimist' {
    interface ParsedArgs {
        _: string[];
        [key: string]: unknown;
    }
    function minimist(args?: string[], opts?: object): ParsedArgs;
    export = minimist;
}

declare module 'rc' {
    function rc(
        name: string,
        defaults?: object,
        argv?: object,
        parse?: (content: string) => object,
    ): object;
    export = rc;
}

declare module 'ut-function.cbc' {
    function cbc(key: string | Buffer, validate?: boolean): {
        encrypt(data: string | Buffer): Buffer;
        decrypt(data: string | Buffer): string;
    };
    export default cbc;
}

declare module 'ut-function.template' {
    function template(obj: object, context: object): object;
    export default template;
}
