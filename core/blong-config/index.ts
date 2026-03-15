import minimist from 'minimist';
import rc from 'rc';
import stripJsonComments from 'strip-json-comments';
import merge from 'ut-function.merge';
import template from 'ut-function.template';
import yaml from 'yaml';

function parse(content: string): object {
    if (/^\s*{/.test(content)) return JSON.parse(stripJsonComments(content));
    let result: {};
    let yamlError: Error & {source?: string};
    try {
        result = yaml.parse(content);
    } catch (error) {
        yamlError = error;
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
    const argv = merge([{}, minimist(process.argv.slice(2))], {convert: true});
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

    let {
        configName,
        mergeOptions = {},
        suite = 'blong',
    } = merge(
        {},
        ...configs.map((config = {}) => {
            return {
                configName: config?.configName,
                mergeOptions: config?.merge,
                suite: config?.suite,
            };
        }),
    );

    const suffix = baseConfig.env[baseConfig.env.length - 1] || 'dev';
    if (!configName) {
        baseConfig.configName = configName = `blong_${suite.replace(/[-/\\]/g, '_')}_${suffix}`;
    }
    configs.push(rc(`blong_${suffix}`, {}, argv, parse));
    configs.push(rc(configName, {}, argv, parse));

    configs.unshift(baseConfig);

    return !context && !process.env.BLONG_MASTER_KEY
        ? merge(configs, mergeOptions)
        : template(merge(configs, mergeOptions), {
              ...context,
              ...(process.env.BLONG_MASTER_KEY &&
                  require('ut-function.cbc')(process.env.BLONG_MASTER_KEY)),
          });
}

export default load;
