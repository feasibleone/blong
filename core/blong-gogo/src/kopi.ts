import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {globSync} from 'glob';
import {basename, dirname, join} from 'path';

export async function createRealm(
    destUrl: string,
    logger?: {warn?: (message: string) => void}
): Promise<string[]> {
    const result = [];
    const url = import.meta.resolve('@feasibleone/blong-kopi/package.json');
    const cwd = url.startsWith('file://') ? dirname(url.slice(7)) : url;
    destUrl = destUrl.startsWith('file://') ? dirname(destUrl.slice(7)) : url;
    const subject = basename(destUrl);
    const replace = (str: string): string =>
        str.replace('$subject', subject).replace('$Subject', 'Subject');
    logger?.warn?.(`Creating realm ${destUrl} from ${cwd}`);
    for (const file of globSync(['**/*.ts'], {
        cwd,
        ignore: ['**/node_modules/**', '.*'],
    })) {
        const [source, dest] = [join(cwd, file), join(destUrl, replace(file))];
        if (!existsSync(dest) || readFileSync(dest, 'utf8').startsWith('import unchanged')) {
            mkdirSync(dirname(dest), {recursive: true});
            writeFileSync(
                dest,
                "import unchanged from '@feasibleone/blong';\r" +
                    replace(readFileSync(source, 'utf8'))
            );
            result.push(dest);
        }
    }
    writeFileSync(
        join(destUrl, 'package.json'),
        readFileSync(join(cwd, 'package.json'), 'utf8').replace('@feasibleone/blong-kopi', subject)
    );
    return result;
}
