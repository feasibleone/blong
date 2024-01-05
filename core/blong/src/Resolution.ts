export interface IResolution {
    start: () => Promise<void>
    stop: () => Promise<void>
    announce: (service: string, port: number) => void
    resolve: (service: string, invalidate: boolean, namespace: string) => Promise<{
        hostname: string;
        port: string;
    }>
}
