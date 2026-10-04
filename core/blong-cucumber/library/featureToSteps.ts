import type {ChainStep, ILib} from '@feasibleone/blong';

import {coerceMatchParam, compileCucumberExpression} from './matchStep.ts';
import type {IGherkinFeature, IGherkinScenario, IGherkinStep} from './parseGherkin.ts';
import {expandOutline, parseGherkin} from './parseGherkin.ts';

type StepDefinitionFn = (...params: unknown[]) => ChainStep;
type GroupFn = ILib['group'];

/**
 * The parsed Gherkin half of a step, handed to a step definition as its **last**
 * argument — after any captured parameters.  A definition that declares only its
 * captures keeps working (the extra argument is ignored); one that needs the
 * `dataTable` or `docString` declares a trailing parameter for it.
 *
 * @example
 * ```ts
 * 'the access matrix is': (step: IStepContext) =>
 *     async function matrix(assert, {$meta}) {
 *         assert.ok(step.dataTable?.length, 'the table has rows');
 *     },
 * ```
 */
export interface IStepContext {
    /** The step keyword as written, trimmed (`Given` / `When` / `Then` / `And` / `But`). */
    keyword: string;
    /** The step text after the keyword, with Scenario Outline placeholders substituted. */
    text: string;
    /** Data Table rows, when the step carries one — each row is a list of cells. */
    dataTable?: string[][];
    /** Doc String content, when the step carries one (without the fences). */
    docString?: string;
}

/** Step definitions keyed by cucumber expression strings. */
export type IStepDefinitions =
    | Record<string, StepDefinitionFn>
    | Array<[string | RegExp, StepDefinitionFn]>;

export interface IFeatureToStepsOptions {
    name?: string;
    group: GroupFn;
}

type CompiledPattern = [RegExp, string | RegExp, StepDefinitionFn];

function buildCompiledPatterns(stepDefs: IStepDefinitions): CompiledPattern[] {
    const entries: Array<[string | RegExp, StepDefinitionFn]> = Array.isArray(stepDefs)
        ? stepDefs
        : (Object.entries(stepDefs) as Array<[string, StepDefinitionFn]>);
    return entries.map(([pattern, fn]) => [
        pattern instanceof RegExp ? pattern : compileCucumberExpression(pattern),
        pattern,
        fn,
    ]);
}

function resolveStep(step: IGherkinStep, compiled: CompiledPattern[]): ChainStep {
    const context: IStepContext = {
        keyword: step.keyword,
        text: step.text,
        dataTable: step.dataTable,
        docString: step.docString,
    };
    for (const [regex, , fn] of compiled) {
        const match = regex.exec(step.text);
        if (match) {
            const params = match.slice(1).map(coerceMatchParam);
            return fn(...params, context);
        }
    }
    throw new Error(
        `No step definition found for: "${step.keyword} ${step.text}"\n` +
            `Available patterns: ${compiled.map(([, p]) => String(p)).join(', ')}`,
    );
}

/**
 * Renames a step function to include a scenario-unique suffix, ensuring
 * no duplicate step names across scenarios within the same test executor.
 */
function renameStep(fn: ChainStep, scenarioIdx: number): ChainStep {
    if (typeof fn !== 'function') return fn;
    const baseName = (fn as {name?: string}).name || 'step';
    const uniqueName = `${baseName}_s${scenarioIdx}`;
    const renamed = {
        [uniqueName]: async function (this: unknown, ...args: unknown[]) {
            return (fn as (...a: unknown[]) => unknown).apply(this, args);
        },
    }[uniqueName];
    return renamed as ChainStep;
}

function scenarioToSteps(
    scenario: IGherkinScenario,
    compiled: CompiledPattern[],
    background: IGherkinStep[],
    group: GroupFn,
    scenarioIdx: number,
): ReturnType<ReturnType<GroupFn>> {
    const allSteps = [...background, ...scenario.steps];
    const steps: ChainStep[] = allSteps.map(step =>
        renameStep(resolveStep(step, compiled), scenarioIdx),
    );
    return group(scenario.name)(steps);
}

export function featureToSteps(
    source: string | IGherkinFeature,
    stepDefs: IStepDefinitions,
    options: IFeatureToStepsOptions,
): ReturnType<ReturnType<GroupFn>> {
    const feature: IGherkinFeature = typeof source === 'string' ? parseGherkin(source) : source;
    const {group, name} = options;
    const compiled = buildCompiledPatterns(stepDefs);
    const backgroundSteps = feature.background?.steps ?? [];

    // Expand Scenario Outlines
    const scenarios: IGherkinScenario[] = [];
    for (const scenario of feature.scenarios) {
        scenarios.push(...expandOutline(scenario));
    }

    const scenarioGroups: ChainStep[] = scenarios.map((scenario, scenarioIdx) =>
        scenarioToSteps(scenario, compiled, backgroundSteps, group, scenarioIdx),
    );

    return group(name ?? feature.name)(scenarioGroups);
}
