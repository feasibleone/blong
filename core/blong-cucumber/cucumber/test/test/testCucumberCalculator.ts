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
                    '{int} plus {int} equals {int}': (
                        a: unknown,
                        b: unknown,
                        expected: unknown,
                    ) =>
                        async function addEquals(
                            assert: typeof Assert,
                            {$meta}: {$meta: IMeta},
                        ) {
                            const result = await cucumberCalculatorAdd(
                                {a: a as number, b: b as number},
                                $meta,
                            );
                            assert.equal(
                                result,
                                expected as number,
                                `${a} + ${b} should equal ${expected}`,
                            );
                        },
                    '{int} minus {int} equals {int}': (
                        a: unknown,
                        b: unknown,
                        expected: unknown,
                    ) =>
                        async function subtractEquals(
                            assert: typeof Assert,
                            {$meta}: {$meta: IMeta},
                        ) {
                            const result = await cucumberCalculatorSubtract(
                                {a: a as number, b: b as number},
                                $meta,
                            );
                            assert.equal(
                                result,
                                expected as number,
                                `${a} - ${b} should equal ${expected}`,
                            );
                        },
                },
                {name, group},
            ),
    }),
);
