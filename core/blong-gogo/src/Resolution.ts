export interface IResolution {
    start: () => Promise<unknown>;
    stop: () => Promise<unknown>;
    announce: (service: string, port: number) => void;
    resolve: (
        service: string,
        invalidate: boolean,
        namespace: string,
    ) => Promise<{
        hostname: string;
        port: string;
    }>;
}
