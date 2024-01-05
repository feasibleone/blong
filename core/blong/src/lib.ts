export function methodId<T>(what: T): T {
    return (
        what &&
        ((typeof what === 'string'
            ? what.replace(/\./g, '').toLowerCase()
            : typeof what === 'object'
            ? Object.fromEntries(
                  Object.entries(what).map(([name, value]) => [methodId(name), value])
              )
            : what) as T)
    );
}

export function methodParts(what: string): string {
    if (what.includes('.')) return what;
    const lowercase = (match: string, word1: string, word2: string, letter: string): string =>
        `${word1}.${word2.toLowerCase()}${letter ? '.' + letter.toLowerCase() : ''}`;
    const capitalWords = /^([^A-Z]+)([A-Z][^A-Z]+)([A-Z])?/;
    return what.replace(capitalWords, lowercase);
}
