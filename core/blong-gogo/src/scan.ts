import type {Dirent} from 'fs';
import {readdir} from 'fs/promises';
import {join} from 'path';

export default async function scan(...path: string[]): Promise<Dirent[]> {
    const dirName = join(...path);
    return (
        await readdir(dirName.startsWith('file://') ? dirName.slice(7) : dirName, {
            withFileTypes: true,
        })
    ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
