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

export function snakeToCamel(string: string): string {
    return string.replace(/([-_]\w)/g, g => g[1].toUpperCase());
}

export function identifier(string: string): string {
    string = this._snakeToCamel(string);
    return /[^\w$]/.test(string) ? `'${string}'` : string;
}
