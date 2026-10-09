import {handler, type IAssert} from '@feasibleone/blong';
import {
    artifactSourceError,
    pageAnswer,
    privateKeyFields,
    serviceOffArguments,
    servicesNamespaceFromNames,
    tokenAnswer,
    upgradeArguments,
    validationRefusal,
} from '../../../lib/rules.ts';

/**
 * server/test/test/testScriptRules.ts — the decisions the k3d runbook makes, tested without a cluster.
 *
 * The runbook's assertions used to be `grep`, `awk` and `[[ ]]` inside a shell script, which made the
 * rules that matter most — the ones that decide whether a deployment is broken — the only ones nothing
 * could check without a cluster. They are functions now, and this is the half of their proof that runs
 * in a second: a Job's arguments, a login answer, an artifact source, a switch.
 *
 * Registered as the `test.script.rules` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}}) => ({
    testScriptRules: ({name = 'script rules'}: {name?: string} = {}) =>
        group(name)([
            async function theMigrationStepRunsWhatItMust(assert: IAssert) {
                // The shape that shipped once lost the deployment's config because a positional followed
                // a flag, and the Job dialled `127.0.0.1:3306` while every pod beside it connected to
                // `db` (F-414, T-267). The positionals are the contract: the entry, `upgrade`, the
                // deployment's intents, and `release` last, because that is the name the rc files it
                // mounts are read by (T-268).
                assert.equal(
                    upgradeArguments(['./index.ts', 'upgrade', 'release']),
                    undefined,
                    'the entry, upgrade and release is what a migration Job runs',
                );
                assert.equal(
                    upgradeArguments(['./index.ts', 'upgrade', 'server', 'release']),
                    undefined,
                    'and the deployment intents sit between upgrade and release, in that order',
                );
                assert.match(
                    upgradeArguments(['./index.ts', 'upgrade', 'release', '--db.port=3306', 'db'])
                        ?? '',
                    /after a flag/,
                    'while a positional after one is refused: the parser reads it as that flag value',
                );
                assert.match(
                    upgradeArguments(['./index.ts', 'release', 'upgrade']) ?? '',
                    /not the entry, upgrade and release/,
                    'and the order is part of the shape rather than a preference',
                );
            },

            async function aLoginAnswerIsJudgedByWhatItCarries(assert: IAssert) {
                // The one assertion that fails a run outright: the private signing key behind a
                // deployment mints tokens its gateway verifies, so a `d` in an answer hands the
                // deployment to every caller who can log in (T-274).
                assert.deepEqual(
                    privateKeyFields(JSON.stringify({result: {d: 'private', x: 'public'}})),
                    ['d'],
                    'a private member is named',
                );
                assert.deepEqual(
                    privateKeyFields(JSON.stringify({result: {keys: [{kty: 'EC', x: 'public'}]}})),
                    [],
                    'while the public half of a pair is not one',
                );
                assert.deepEqual(
                    privateKeyFields(JSON.stringify({result: {d: 5, p: 'prime'}})),
                    ['p'],
                    'and only a member a string holds counts as material',
                );
                // A body nobody can parse is decided by pattern rather than by parse: an answer that
                // cannot be read is not an answer that is clean.
                assert.deepEqual(
                    privateKeyFields('{"result":{"d":'),
                    ['<unparsed>'],
                    'an unreadable body that looks like a key is reported',
                );
                assert.deepEqual(privateKeyFields('not json at all'), [], 'and one that does not, is not');
            },

            async function theRoundTripsReadAsTheyDid(assert: IAssert) {
                assert.equal(pageAnswer('<!doctype html><html>'), true, 'a page is a page');
                assert.equal(pageAnswer('<!DOCTYPE HTML>'), true, 'whatever case it arrives in');
                assert.equal(pageAnswer('{"error":"not found"}'), false, 'and an answer is not');
                assert.equal(tokenAnswer('{"result":{"access_token":"x"}}'), true, 'a token is a token');
                assert.equal(
                    validationRefusal('{"error":{"message":"isActive must be boolean"}}'),
                    true,
                    'and a refusal names the type the model wanted (F-437)',
                );
                assert.equal(validationRefusal('{"result":{}}'), false, 'while everything else is not');
            },

            async function theRunRefusesWhatItCannotDo(assert: IAssert) {
                assert.match(
                    artifactSourceError({}) ?? '',
                    /ARTIFACT_URL .* or ARTIFACT_PATH/,
                    'a run with no artifact to deploy is refused before anything is created',
                );
                assert.equal(
                    artifactSourceError({artifactUrl: 'https://…/suite.zip'}),
                    undefined,
                    'and one that names either is not',
                );
                assert.equal(
                    artifactSourceError({artifactPath: '/tmp/shop-suite'}),
                    undefined,
                    'including the local path a run without egress uses',
                );
                assert.deepEqual(
                    serviceOffArguments('mysql'),
                    ['--kustomize.deploy.services.mysql=false'],
                    'the switch a deployment runs its own database with is one spelling',
                );
                assert.deepEqual(serviceOffArguments(undefined), [], 'and none when nothing is switched');
            },

            async function theServicesNamespaceIsReadOffTheTree(assert: IAssert) {
                assert.equal(
                    servicesNamespaceFromNames(
                        ['blong-services.yaml', 'blong-suite.yaml', 'kustomization.yaml'],
                        'blong-suite',
                    ),
                    'blong-services',
                    'where the generated workloads went, rather than where the suite runs',
                );
                assert.equal(
                    servicesNamespaceFromNames(['kustomization.yaml'], 'blong-suite'),
                    undefined,
                    'and nothing at all when the tree brings no service',
                );
            },
        ]),
}));
