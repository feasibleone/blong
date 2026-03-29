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

function scenarioToSteps(
    scenario: IGherkinScenario,
    compiled: Array<[RegExp, string, StepDefinitionFn]>,
    background: IGherkinStep[],
    group: GroupFn,
): unknown {
    const allSteps = [...background, ...scenario.steps];
    const steps = allSteps.map(step => resolveStep(step, compiled));
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

    const scenarioGroups = scenarios.map(scenario =>
        scenarioToSteps(scenario, compiled, backgroundSteps, group),
    );

    return group(name ?? feature.name)(scenarioGroups);
}
