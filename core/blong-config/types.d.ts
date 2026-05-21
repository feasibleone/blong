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

declare module 'ut-function.merge' {
    export default function merge<T, S1>(target: T, source: S1): T & S1;
    export default function merge<T, S1, S2>(target: T, source1: S1, source2: S2): T & S1 & S2;
    export default function merge<T, S1, S2, S3>(target: T, source1: S1, source2: S2, source3: S3): T & S1 & S2 & S3;
    export default function merge<T>(...args: unknown[]): T;
}
