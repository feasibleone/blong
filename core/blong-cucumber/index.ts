import server from './server.ts';

export {
    parseGherkin,
    expandOutline,
    type IGherkinFeature,
    type IGherkinScenario,
    type IGherkinStep,
    type IGherkinExamples,
    type IGherkinBackground,
} from './library/parseGherkin.ts';
export {compileCucumberExpression, coerceMatchParam, matchStep} from './library/matchStep.ts';
export {featureToSteps, type IStepDefinitions, type IFeatureToStepsOptions} from './library/featureToSteps.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'cucumber', 'cucumber', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[0].test();
};
