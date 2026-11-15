import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

import {BLOB_DEFAULTS} from '../../../blob/blobConfig.ts';

/** What `blob.blob.add` answers; the proxy types a handler call as `unknown`. */
type Added = {key: string; size: number};

/** `blob.head` refuses a missing key rather than answering nothing, so the test asks by outcome. */
async function present(head: unknown, namespace: string, key: string): Promise<boolean> {
    return (head as (p: object, m: object) => Promise<unknown>)({namespace, key}, {})
        .then(() => true)
        .catch(() => false);
}

/**
 * `test.temp` — the sweep removes what expired and nothing else.
 *
 * A temporary blob carries an `expiresAt` its lifetime decides, so the test moves the *cutoff* rather
 * than the record: a sweep whose `now` is behind a record's expiry keeps it, and one whose `now` is
 * ahead removes it. That is the only way to prove both halves without waiting a day — the lifetime is
 * the realm's configuration and not something a caller chooses (@@D-840).
 *
 * A permanent record has no expiry at all, which is the other half of the rule: the sweep asks the
 * record, not the `temporary` flag of some other copy of it.
 *
 * Registered as the `test.temp` group (`integration.watch.test` in index.ts).
 */
export default handler(({lib: {group}, handler: {blobBlobAdd, blobHead, blobTempCleanup}}) => ({
    testTemp: () =>
        group('temp')([
            async function expired(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const add = async (temporary: boolean): Promise<Added> =>
                    (await blobBlobAdd(
                        {
                            namespace: 'test',
                            contentBase64: Buffer.from(
                                `sweep ${temporary} ${Math.random()}`,
                            ).toString('base64'),
                            contentType: 'image/png',
                            scopes: ['anonymous'],
                            temporary,
                        },
                        {...$meta, method: 'blob.blob.add'} as IMeta,
                    )) as Added;
                const gone = [await add(true), await add(true), await add(true)];
                const stays = await add(false);
                assert.equal(gone.length, 3, 'three temporary records and one permanent');
                return {gone, stays};
            },

            async function sweep(
                assert: IAssert,
                {
                    $meta,
                    expired,
                }: {
                    $meta: IMeta;
                    expired: Promise<{gone: Added[]; stays: Added}>;
                },
            ) {
                const {gone, stays} = await expired;
                // Every temporary record was written with the realm's own lifetime, so a cutoff one
                // second past it is what an expired record looks like from the sweep's side.
                const now = new Date(Date.now() + (BLOB_DEFAULTS.tempTtl + 1) * 1000).toISOString();
                const answer = (await blobTempCleanup({namespaces: ['test'], now}, {
                    ...$meta,
                    method: 'blob.temp.cleanup',
                } as IMeta)) as {removed: number; bytes: number};
                assert.ok(answer.removed >= 3, 'the expired records are gone');
                assert.ok(answer.bytes > 0, 'and the bytes they held are counted');

                for (const record of gone) {
                    assert.equal(
                        await present(blobHead, 'test', record.key),
                        false,
                        'an expired record is gone',
                    );
                }
                assert.ok(
                    await present(blobHead, 'test', stays.key),
                    'a permanent record has no expiry and survives',
                );
                return {done: true};
            },

            async function nothingExpired(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const live = (await blobBlobAdd(
                    {
                        namespace: 'test',
                        contentBase64: Buffer.from(`ahead ${Math.random()}`).toString('base64'),
                        contentType: 'image/png',
                        scopes: ['anonymous'],
                        temporary: true,
                    },
                    {...$meta, method: 'blob.blob.add'} as IMeta,
                )) as Added;
                // A cutoff at `now` is behind the record's expiry, so the sweep must leave it.
                const answer = (await blobTempCleanup(
                    {namespaces: ['test'], now: new Date().toISOString()},
                    {...$meta, method: 'blob.temp.cleanup'} as IMeta,
                )) as {removed: number; bytes: number};
                assert.ok(
                    await present(blobHead, 'test', live.key),
                    'a record whose lifetime is ahead survives the sweep',
                );
                assert.equal(answer.bytes >= 0, true, 'and the answer is a count, not a failure');
                return {done: true};
            },
        ]),
}));
