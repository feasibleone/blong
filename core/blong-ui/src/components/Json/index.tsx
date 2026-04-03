/**
 * Json — JSON diff viewer.
 */

interface IJsonProps {
    value: unknown;
    previous?: unknown;
    showUnchangedValues?: boolean;
    keyValue?: boolean;
}

type DiffLine = {
    key: string;
    current?: unknown;
    previous?: unknown;
    status: 'added' | 'removed' | 'changed' | 'unchanged';
};

function buildDiff(current: unknown, previous: unknown | undefined): DiffLine[] {
    if (typeof current !== 'object' || current === null) {
        return [
            {
                key: 'value',
                current,
                previous,
                status:
                    previous === undefined
                        ? 'added'
                        : current === previous
                          ? 'unchanged'
                          : 'changed',
            },
        ];
    }

    const currentObj = current as Record<string, unknown>;
    const previousObj = (previous ?? {}) as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(currentObj), ...Object.keys(previousObj)]);
    const lines: DiffLine[] = [];

    for (const key of allKeys) {
        const curr = currentObj[key];
        const prev = previousObj[key];
        let status: DiffLine['status'] = 'unchanged';
        if (!(key in previousObj)) status = 'added';
        else if (!(key in currentObj)) status = 'removed';
        else if (JSON.stringify(curr) !== JSON.stringify(prev)) status = 'changed';
        lines.push({key, current: curr, previous: prev, status});
    }

    return lines;
}

export function Json({value, previous, showUnchangedValues = true, keyValue}: IJsonProps) {
    if (keyValue) {
        const diff = buildDiff(value, previous);
        return (
            <dl className="blong-json blong-json--kv">
                {diff
                    .filter(l => showUnchangedValues || l.status !== 'unchanged')
                    .map(line => (
                        <div
                            key={line.key}
                            className={`blong-json__line blong-json__line--${line.status}`}
                        >
                            <dt className="blong-json__key">{line.key}</dt>
                            <dd className="blong-json__value">
                                {line.status === 'changed' && (
                                    <span className="blong-json__prev">
                                        {JSON.stringify(line.previous)}
                                    </span>
                                )}
                                <span className="blong-json__curr">
                                    {JSON.stringify(line.current ?? line.previous)}
                                </span>
                            </dd>
                        </div>
                    ))}
            </dl>
        );
    }

    return <pre className="blong-json">{JSON.stringify(value, null, 2)}</pre>;
}
