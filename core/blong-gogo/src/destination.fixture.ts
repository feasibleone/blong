/** A destination module of a test's own: the shape `log.destination.module` expects. */
export default function fixtureWriter(options: Record<string, unknown>) {
    const lines: string[] = [];
    const ended: string[] = [];
    return {
        lines,
        ended,
        tag: options['tag'],
        write(line: string): void {
            lines.push(line);
        },
        close(): void {
            ended.push('close');
        },
        flush(): void {
            ended.push('flush');
        },
    };
}
