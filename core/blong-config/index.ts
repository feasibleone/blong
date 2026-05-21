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

function load({
    params,
    app,
    method,
    env,
    version,
    config,
    context,
    defaultConfig,
}: {
    params?: object;
    app?: string;
    method?: string;
    env?: string;
    version?: string;
    config?: Config | Config[];
    context?: object;
    defaultConfig?: Config;
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
    configs.push(rc(`blong_${suffix}`, {}, argv, parse));
    configs.push(rc(configName, {}, argv, parse));

    configs.unshift(baseConfig);

    return !context && !process.env.BLONG_MASTER_KEY
        ? merge(configs, mergeOptions)
        : renderAll(merge(configs, mergeOptions), {
              ...context,
              ...(process.env.BLONG_MASTER_KEY && cbc(process.env.BLONG_MASTER_KEY)),
          });
}

export default load;
