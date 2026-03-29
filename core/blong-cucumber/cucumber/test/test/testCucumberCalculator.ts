import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {featureToSteps} from '../../../library/featureToSteps.ts';
import calculatorFeature from '../feature/calculator.ts';

export default handler(
    ({lib: {group}, handler: {cucumberCalculatorAdd, cucumberCalculatorSubtract}}) => ({
        testCucumberCalculator: ({name = 'cucumber calculator'}: {name?: string}, $meta: IMeta) =>
            featureToSteps(
                calculatorFeature,
                {
                    'I add {int} and {int}': (a: unknown, b: unknown) =>
                        group(`add ${a} + ${b}`)([
                            async function cucumberAdd(
                                assert: typeof Assert,
                                {$meta}: {$meta: IMeta},
                            ) {
                                const result = await cucumberCalculatorAdd(
                                    {a: a as number, b: b as number},
                                    $meta,
                                );
                                return result;
                            },
                        ]),
                    'I subtract {int} from {int}': (b: unknown, a: unknown) =>
                        group(`subtract ${a} - ${b}`)([
                            async function cucumberSubtract(
                                assert: typeof Assert,
                                {$meta}: {$meta: IMeta},
                            ) {
                                const result = await cucumberCalculatorSubtract(
                                    {a: a as number, b: b as number},
                                    $meta,
                                );
                                return result;
                            },
                        ]),
                    'the result should be {int}': (expected: unknown) =>
                        async function resultCheck(
                            assert: typeof Assert,
                            context: {cucumberAdd?: Promise<number>; cucumberSubtract?: Promise<number>},
                        ) {
                            const result = await (context.cucumberAdd ?? context.cucumberSubtract);
                            assert.equal(result, expected as number, `result should be ${expected}`);
                        },
                },
                {name, group},
            ),
    }),
);
