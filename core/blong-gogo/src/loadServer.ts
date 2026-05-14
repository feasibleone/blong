import {watch} from 'chokidar';
import type {Dirent} from 'fs';
import {existsSync, readFileSync, statSync, writeFileSync} from 'fs';
import {readdir} from 'fs/promises';
import minimist from 'minimist';
import {createRequire} from 'node:module';
import {hrtime} from 'node:process';
import {basename, dirname, extname, join, relative, resolve} from 'path';
import ConfigRuntime from './ConfigRuntime.ts';
import load from './load.ts';
import timing from './timing.ts';

const scan = async (...path: string[]): Promise<Dirent[]> =>
    (await readdir(join(...path), {withFileTypes: true})).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
    );

const loadConfig = async (parentConfig: string | object) => {
    // ConfigRuntime is created only at the root call (when no api is provided)
    // and only when parentConfig is a string (suite name) so blong-config can
    // load external files that may change at runtime.
    let configRuntime: ConfigRuntime | undefined;
    let loadedConfig: object;
    if (typeof parentConfig === 'string') {
        configRuntime = new ConfigRuntime({config: {suite: parentConfig}});
        loadedConfig = await configRuntime.load();
    } else loadedConfig = parentConfig;
    return {loadedConfig, configRuntime};
};

// Parse CLI intents: first positional arg may be a file/folder target — exclude it from intents.
const allPositional = minimist(process.argv.slice(2))._ as string[];
const [maybeTarget, ...rest] = allPositional;
const targetIsFile = Boolean(maybeTarget && existsSync(resolve(maybeTarget)));
const cliIntents = targetIsFile ? rest : allPositional;

export default load.bind(null, {
    platform: 'server',
    readdir: async (path: string) => readdir(path, {withFileTypes: true}),
    existsSync,
    createRequire,
    scan,
    join,
    basename,
    extname,
    dirname,
    loadConfig,
    resolve,
    relative,
    readFileSync,
    writeFileSync,
    statSync,
    watch,
    timing: timing(hrtime),
    configs: ['server', ...cliIntents],
});
