import {type ChainStep, type IAssert, type IMeta, library} from '@feasibleone/blong';
import type {IStepContext} from '@feasibleone/blong-cucumber';

import type {IAclFixtureParams, IAclFixtureResult} from './aclFixture.ts';
import type {
    IAclMatrixParams,
    IAclMatrixPrincipal,
    IAclMatrixResult,
    IAclMatrixTarget,
} from './aclMatrix.ts';

/**
 * `aclSteps` — the step definitions the four ACL matrix features share.
 *
 * A library rather than a plain module beside the handlers: the loader gives
 * every file in a handler group the shape of a handler, and a module that is not
 * one is reported as an error at load time ("probably a generic source code was
 * put in a handler group folder").  As a library it is loaded for what it is, and
 * the factories are reached through `lib` like any other shared function.
 *
 * They are one library because they are one thing: the *only* difference between
 * the matrices is which table a step carries and which probe its cells stand for.
 * The fixture tables all assert declared triples (`aclFixture`), and the matrices
 * all probe one target through the gateway (`aclMatrix`), so a handler maps its
 * own step texts to these two factories and adds no logic of its own.
 */

type AclFixtureFn = (params: IAclFixtureParams, $meta: IMeta) => Promise<IAclFixtureResult>;
type AclMatrixFn = (params: IAclMatrixParams, $meta: IMeta) => Promise<IAclMatrixResult>;
/** The shape `featureToSteps` accepts — the step context arrives as its only parameter. */
type StepDefinition = (...params: unknown[]) => ChainStep;

/** The Data Table a step carries, if any. */
function tableOf(step: unknown): string[][] {
    return (step as IStepContext).dataTable ?? [];
}

/**
 * A chain step named after the table it asserts.  The runner appends a per-step
 * suffix (`_s0`, `_s1`, …) to that name, so two steps of one scenario must not
 * share it: a Background of four fixture tables needs four distinct names.
 */
function namedStep<F extends ChainStep>(name: string, step: F): F {
    Object.defineProperty(step, 'name', {value: name});
    return step;
}

export default library(() => ({
    /** Assert the fixture a matrix is built from — `Given the ACL … is <table>`. */
    aclFixtureStep(aclFixture: AclFixtureFn, title: string): StepDefinition {
        return (step: unknown) =>
            namedStep(
                `assert ${title}`,
                async function assertAclFixture(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const fixture = await aclFixture({table: tableOf(step), title}, $meta);
                    assert.ok(fixture.ok, `\n${fixture.render()}`);
                },
            );
    },

    /**
     * Assert one matrix — `Then the <probe> … matrix is <table>`.  `principals`
     * makes the viewers service accounts or applications: a viewer whose label is
     * a key signs in with the OAuth `client_credentials` grant.
     */
    aclMatrixStep(
        aclMatrix: AclMatrixFn,
        target: IAclMatrixTarget,
        probe: string,
        principals?: Record<string, IAclMatrixPrincipal>,
    ): StepDefinition {
        return (step: unknown) =>
            namedStep(
                `assert the ${probe} matrix`,
                async function assertAclMatrix(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await aclMatrix(
                        {table: tableOf(step), principals, target, probe},
                        $meta,
                    );
                    assert.ok(result.ok, `\n${result.render()}`);
                },
            );
    },
}));
