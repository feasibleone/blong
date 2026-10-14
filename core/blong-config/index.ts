import {renderAll} from '@feasibleone/blong-template';
import minimist from 'minimist';
import rc from 'rc';
import stripJsonComments from 'strip-json-comments';
import cbc from 'ut-function.cbc';
import merge from 'ut-function.merge';
import yaml from 'yaml';

function parse(content: string): object {
    if (/^\s*{/.test(content)) return JSON.parse(stripJsonComments(content));
    let result: object | undefined;
    let yamlError: (Error & {source?: string}) | undefined;
    try {
        result = yaml.parse(content);
    } catch (error) {
        yamlError = error as Error & {source?: string};
        delete yamlError.source;
    }
    if (result && typeof result !== 'string') return result;
    if (yamlError) throw yamlError;
    return {};
}

type Config = {
    configName?: string;
    suite?: string;
    merge?: object;
};

/**
 * What a load read, reported to the caller so a process can say where its
 * configuration came from. Names only — never values, so a secret in an rc file
 * or an environment variable is not copied into a log line.
 *
 * `files` are the rc files `rc` actually found and read, in the order it merged
 * them; `env` are the environment variable names it matched (by the
 * `BLONG_<suffix>_` / `BLONG_<suite>_<suffix>_` prefixes, plus the four the
 * loader reads itself); `argv` are the command-line keys (without the leading
 * dashes) that carried a value.
 */
export interface ConfigSources {
    files: string[];
    env: string[];
    argv: string[];
}

/**
 * The environment variable names a load consumed, in a stable order.
 *
 * The prefixes are the ones `rc` matches against when it is asked for a name
 * (`name + '_'`, compared case-insensitively), plus the four the loader reads
 * directly. Collected here rather than read off `process.env` by the caller, so
 * one definition of "what this load read" exists.
 */
function collectEnv(names: string[]): string[] {
    const env = (globalThis as {process?: {env?: Record<string, string | undefined>}}).process?.env;
    if (!env) return [];
    const prefixes = names.map(name => `${name}_`.toLowerCase());
    const direct = ['BLONG_PLATFORM', 'BLONG_METHOD', 'BLONG_ENV', 'BLONG_MASTER_KEY'];
    return Object.keys(env)
        .filter(
            key =>
                env[key] !== undefined &&
                (direct.includes(key) ||
                    prefixes.some(prefix => key.toLowerCase().startsWith(prefix))),
        )
        .sort();
}

function load({
    params,
    app,
    method,
    env,
    version,
    config,
    context,
    defaultConfig,
    onSources,
}: {
    params?: object;
    app?: string;
    method?: string;
    env?: string;
    version?: string;
    config?: Config | Config[];
    context?: object;
    defaultConfig?: Config;
    /** Called once with what the load read (files, env names, argv keys). */
    onSources?: (sources: ConfigSources) => void;
} = {}) {
    const argv = merge([{}, minimist(process.argv.slice(2))], {convert: true}) as unknown as {
        _: string[];
        env?: string;
        [key: string]: unknown;
    };
    const platform = process.env.BLONG_PLATFORM || app || argv._[0] || 'server';
    const baseConfig = {
        version,
        platform,
        method: process.env.BLONG_METHOD || method || argv._[1] || 'debug',
        env: (process.env.BLONG_ENV || env || argv.env || 'microservice,integration,dev').split(
            ',',
        ),
        configName: '',
    };
    const configs = [defaultConfig].filter(Boolean);
    if (config) {
        if (Array.isArray(config)) configs.push(...config);
        else configs.push(config);
    }

    if (params) configs.push(params);

    const _merged = merge<{configName?: string; mergeOptions?: object; suite?: string}>(
        {} as {configName?: string; mergeOptions?: object; suite?: string},
        ...configs.map((config = {}) => {
            return {
                configName: config?.configName,
                mergeOptions: config?.merge,
                suite: config?.suite,
            };
        }),
    );
    const mergeOptions = _merged.mergeOptions ?? {};
    const suite = _merged.suite ?? 'blong';
    let configName = _merged.configName;

    const suffix = baseConfig.env[baseConfig.env.length - 1] || 'dev';
    if (!configName) {
        baseConfig.configName = configName = `blong_${suite.replace(/[-/\\]/g, '_')}_${suffix}`;
    }
    const rcShared = rc(`blong_${suffix}`, {}, argv, parse) as Config & {configs?: string[]};
    const rcSuite = rc(configName, {}, argv, parse) as Config & {configs?: string[]};
    configs.push(rcShared);
    configs.push(rcSuite);

    // Report what the load read, before the merge throws away the bookkeeping
    // keys `rc` adds (`configs`, `config`). Files are deduplicated because an
    // argv `--config=` is appended by both calls.
    onSources?.({
        files: [...new Set([...(rcShared.configs ?? []), ...(rcSuite.configs ?? [])])],
        env: collectEnv([`blong_${suffix}`, configName]),
        argv: Object.keys(argv)
            .filter(key => key !== '_')
            .sort(),
    });

    configs.unshift(baseConfig);

    return !context && !process.env.BLONG_MASTER_KEY
        ? merge(configs, mergeOptions)
        : renderAll(merge(configs, mergeOptions), {
              ...context,
              ...(process.env.BLONG_MASTER_KEY && cbc(process.env.BLONG_MASTER_KEY)),
          });
}

export default load;
