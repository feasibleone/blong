/**
 * The real local embedding model (R25, D23-D25).
 *
 * Everything else in this suite runs on the deterministic offline provider, on purpose: a
 * ranking assertion written against a model that downloads its weights is an assertion about
 * a machine and a model revision, not about the code. This file is the other half of that
 * decision — the model is *reachable*, and its behaviour is asserted where it is real.
 *
 * Gated on `SEMANTIC_LOG_LOCAL_MODEL=1`, because the first embed downloads the ONNX weights
 * (tens of megabytes) and CI must not depend on that. Run it in dev with:
 *
 *     SEMANTIC_LOG_LOCAL_MODEL=1 ./node_modules/.bin/tap test/local-model.test.ts
 *
 * What it proves, in the order it matters:
 *
 * 1. the documented task, model and width are what the provider actually uses;
 * 2. a **paraphrase** ranks the record it means first — which is the whole point of a real
 *    model, and the thing the offline provider structurally cannot do. Its blindness is
 *    pinned by a non-gated test in `src/service/provider.test.ts` ("the offline provider
 *    hashes text"): on this exact corpus the hash provider ranks the payment **last**
 *    (-0.006) and the real model ranks it first (0.448), so the contrast is measured, not
 *    claimed.
 */

import t from 'tap';

import {createApp} from '../src/service/app.ts';
import {createProvider, LOCAL_DIMENSION, LOCAL_MODEL} from '../src/service/provider.ts';

/** Why the suite skips when the developer has not asked for the model. */
const SKIP = 'SEMANTIC_LOG_LOCAL_MODEL is not set: this test downloads the model';

/** The model's first use downloads weights and compiles them. */
const TIMEOUT = 180_000;

const ENABLED = process.env.SEMANTIC_LOG_LOCAL_MODEL === '1';

t.test(
    'the real model is the one the documentation names (R25)',
    {timeout: TIMEOUT, skip: ENABLED ? false : SKIP},
    async t => {
        const provider = createProvider({kind: 'local'});
        t.equal(provider.dimension, LOCAL_DIMENSION, `the documented width for ${LOCAL_MODEL}`);

        const vector = await provider.embed('settlement committed for the transfer');
        t.equal(vector.length, LOCAL_DIMENSION, 'a vector of that width comes back');
        t.ok(
            vector.every(value => Number.isFinite(value)),
            'with finite components — a model that returned nonsense would rank nonsense first',
        );
        // The same text twice is the same direction: the provider is a function, so a ranking
        // over it is reproducible rather than merely plausible.
        const again = await provider.embed('settlement committed for the transfer');
        t.same(again, vector, 'and it is deterministic: the same text embeds to the same vector');
        t.end();
    },
);

t.test(
    'a paraphrase ranks the record it means first, which the hash provider cannot do (R24/R25)',
    {timeout: TIMEOUT, skip: ENABLED ? false : SKIP},
    async t => {
        const app = createApp({embedding: {kind: 'local'}});
        t.teardown(() => app.close());

        // Three records that mean different things, with no word in common with the query: the
        // ranking has to come from meaning rather than from matching text.
        const records = [
            {id: '01FXRATE', fingerprint: 'fp-fx', msg: 'fx rate published for the corridor'},
            {
                id: '01SETTLED',
                fingerprint: 'fp-settle',
                msg: 'funds delivered to the payee account',
            },
            {id: '01LOOKUP', fingerprint: 'fp-look', msg: 'party lookup timed out in discovery'},
        ];
        for (const record of records) {
            const posted = await app.inject({
                method: 'POST',
                url: '/events',
                payload: {
                    events: [
                        {...record, time: 1, service: 'hub', template: `[MSG: ${record.msg}]`},
                    ],
                },
            });
            t.equal(posted.statusCode, 202, `${record.id} was ingested`);
        }

        const query = encodeURIComponent('money was moved to the recipient');
        const results = (
            await app.inject({method: 'GET', url: `/search?q=${query}`})
        ).json() as Array<{
            kind: string;
            record?: string;
            msg?: string;
            score: number;
        }>;
        const ranked = results.filter(result => result.kind === 'record').map(result => result.msg);
        t.equal(
            ranked[0],
            'funds delivered to the payee account',
            `the paraphrase finds the payment, not the fx rate or the timeout — ranked ${JSON.stringify(ranked)}`,
        );
        t.ok(
            (results[0]?.score ?? 0) > (results[results.length - 1]?.score ?? 0),
            'and the ranking separates them rather than tying',
        );
        t.end();
    },
);
