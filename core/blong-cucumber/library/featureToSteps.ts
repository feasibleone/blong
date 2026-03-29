import type {IGherkinFeature, IGherkinScenario, IGherkinStep} from './parseGherkin.ts';
import {expandOutline, parseGherkin} from './parseGherkin.ts';
import {compileCucumberExpression, coerceMatchParam} from './matchStep.ts';

type StepDefinitionFn = (...params: unknown[]) => unknown;
type GroupFn = (name: string) => (steps: unknown[]) => unknown;

export interface IStepDefinitions {
    [pattern: string]: StepDefinitionFn;
}

export interface IFeatureToStepsOptions {
    name?: string;
    group: GroupFn;
}

function buildCompiledPatterns(stepDefs: IStepDefinitions): Array<[RegExp, string, StepDefinitionFn]> {
    return Object.entries(stepDefs).map(([pattern, fn]) => [
        compileCucumberExpression(pattern),
        pattern,
        fn,
    ]);
}

function resolveStep(
    step: IGherkinStep,
    compiled: Array<[RegExp, string, StepDefinitionFn]>,
): unknown {
    for (const [regex, pattern, fn] of compiled) {
        const match = regex.exec(step.text);
        if (match) {
            const params = match.slice(1).map(coerceMatchParam);
            return fn(...params);
        }
    }
    throw new Error(
        `No step definition found for: "${step.keyword} ${step.text}"\n` +
        `Available patterns: ${compiled.map(([, p]) => p).join(', ')}`,
    );
}

/**
 * Renames a step function to include a scenario-unique suffix, ensuring
 * no duplicate step names across scenarios within the same test executor.
 */
function renameStep(fn: unknown, scenarioIdx: number): unknown {
    if (typeof fn !== 'function') return fn;
    const baseName = (fn as {name?: string}).name || 'step';
    const uniqueName = `${baseName}_s${scenarioIdx}`;
    const renamed = {
        [uniqueName]: async function (this: unknown, ...args: unknown[]) {
            return (fn as (...a: unknown[]) => unknown).apply(this, args);
        },
    }[uniqueName];
    return renamed;
}

function scenarioToSteps(
    scenario: IGherkinScenario,
    compiled: Array<[RegExp, string, StepDefinitionFn]>,
    background: IGherkinStep[],
    group: GroupFn,
    scenarioIdx: number,
): unknown {
    const allSteps = [...background, ...scenario.steps];
    const steps = allSteps.map(step => {
        const result = resolveStep(step, compiled);
        return renameStep(result, scenarioIdx);
    });
    return group(scenario.name)(steps);
}

export function featureToSteps(
    source: string | IGherkinFeature,
    stepDefs: IStepDefinitions,
    options: IFeatureToStepsOptions,
): unknown {
    const feature: IGherkinFeature =
        typeof source === 'string' ? parseGherkin(source) : source;
    const {group, name} = options;
    const compiled = buildCompiledPatterns(stepDefs);
    const backgroundSteps = feature.background?.steps ?? [];

    // Expand Scenario Outlines
    const scenarios: IGherkinScenario[] = [];
    for (const scenario of feature.scenarios) {
        scenarios.push(...expandOutline(scenario));
    }

    const scenarioGroups = scenarios.map((scenario, scenarioIdx) =>
        scenarioToSteps(scenario, compiled, backgroundSteps, group, scenarioIdx),
    );

    return group(name ?? feature.name)(scenarioGroups);
}
