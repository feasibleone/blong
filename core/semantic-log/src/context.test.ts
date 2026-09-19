import t from 'tap';
import type { AmbientContext } from '../index.ts';
import {
    bindInboundLeg,
    bindLeg,
    bindTrace,
    currentContext,
    currentLeg,
    currentTrace,
    enterFlow,
    enterInboundLeg,
    enterTrace,
    isLegId,
    isLegSeq,
    isServiceName,
    lastRecordId,
    recordDecision,
    rememberRecord,
    step,
    takeDecision,
    withFlow,
    withIntent,
} from './context.ts';

/**
 * A valid flow identity: 26 Crockford base32 characters. The identity is a ULID
 * the *caller* mints for one execution (PRD R9, ruled 2026-09-13), so a test
 * fixture may not use a readable name like `flow-1` any more — that is now
 * caller misuse and `withFlow` throws for it.
 */
const FLOW_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OTHER_FLOW_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

/**
 * The stable process name that accompanies the execution ULID (PRD R9/R6c). It
 * outlives one run, which is what makes it the drift key rather than the ULID.
 */
const FLOW_KIND = 'transfer.single';

/** A leg id in the enforced shape (PRD R22): lowercase, dot-separated. */
const LEG = 'payer.discovery.parties';

t.test('enterFlow names the execution for the rest of it, past an await', async t => {
    // The hook form. There is no callback to scope — a server hook returns and the
    // framework continues the request — so the store is entered instead, and the work
    // that follows (including work started after an await, which is what a request's
    // later hooks and its route handler are) still names the flow.
    await (async () => {
        enterFlow({id: FLOW_ID, kind: FLOW_KIND});
        enterTrace('tr-hook');
        t.equal(currentContext().flow?.id, FLOW_ID, 'the entered flow is the ambient one');
        t.equal(currentContext().flow?.kind, FLOW_KIND, 'with the kind it was entered with');
        await new Promise(resolve => setTimeout(resolve, 5));
        t.equal(currentContext().flow?.id, FLOW_ID, 'and it survives the await');
        t.equal(currentTrace(), 'tr-hook', 'as does the trace entered beside it');
    })();
});

t.test('enterInboundLeg answers under the leg a call was received with', async t => {
    await (async () => {
        enterFlow({id: FLOW_ID, kind: FLOW_KIND});
        enterInboundLeg({id: LEG, seq: '1.2'});
        t.equal(currentLeg()?.id, LEG, 'the received call is the ambient leg');
        t.equal(currentLeg()?.seq, '1.2', 'with the position it was given');
    })();
});

t.test('entering what is not lawful is caller misuse', async t => {
    t.throws(
        () => enterFlow({id: 'flow-1', kind: FLOW_KIND}),
        /flow id/,
        'a flow id is a ULID',
    );
    t.throws(() => enterFlow({id: FLOW_ID, kind: ''}), /flow kind/, 'a flow kind is non-empty');
    t.throws(
        () => enterInboundLeg({id: 'not a leg'}),
        /leg id/,
        'a leg id is letters, digits and separators',
    );
    t.throws(
        () => enterInboundLeg({id: LEG, seq: 'x'}),
        /malformed position/,
        'and its position is a path of counters',
    );
    t.throws(
        () => enterInboundLeg({id: LEG}),
        /outside a flow/,
        'and a leg needs a flow to belong to',
    );
});

t.test('intent is visible for the whole enclosed scope', async t => {
    t.equal(currentContext().intent, undefined, 'no ambient intent by default');
    await withIntent({name: 'User_Checkout', actor: 'testAdmin', tenant: 'acme'}, async () => {
        t.equal(currentContext().intent?.name, 'User_Checkout');
        await Promise.resolve();
        t.equal(currentContext().intent?.actor, 'testAdmin', 'survives an await');
    });
    t.equal(currentContext().intent, undefined, 'restored afterwards');
});

t.test('nested intent overrides and then restores', async t => {
    await withIntent({name: 'Outer'}, async () => {
        await withIntent({name: 'Inner'}, async () => {
            t.equal(currentContext().intent?.name, 'Inner');
        });
        t.equal(currentContext().intent?.name, 'Outer');
    });
});

t.test('flow steps advance the recorded position', async t => {
    await withFlow({id: FLOW_ID, kind: FLOW_KIND, step: null}, async () => {
        t.equal(currentContext().flow?.id, FLOW_ID);
        t.equal(currentContext().flow?.kind, FLOW_KIND, 'the stable process name is carried too');
        await step('discovery', async () => {
            t.equal(currentContext().flow?.step, 'discovery');
            t.equal(currentContext().flow?.index, 0);
            t.equal(currentContext().flow?.status, 'running');
        });
        await step('quote', async () => {
            t.equal(currentContext().flow?.step, 'quote');
            t.equal(currentContext().flow?.index, 1, 'index counts the steps taken');
        });
        t.equal(currentContext().flow?.step, 'quote', 'position persists after the step');
    });
});

t.test('a failing step records failed status and rethrows', async t => {
    await withFlow({id: OTHER_FLOW_ID, kind: FLOW_KIND}, async () => {
        await t.rejects(
            step('transfer', async () => {
                throw new Error('boom');
            }),
            /boom/,
        );
        t.equal(currentContext().flow?.status, 'failed');
        t.equal(currentContext().flow?.step, 'transfer');
    });
});

t.test('flow is not visible outside its scope', async t => {
    await withFlow({id: OTHER_FLOW_ID, kind: FLOW_KIND}, async () => {});
    t.equal(currentContext().flow, undefined);
});

t.test('a bound trace is visible for the whole enclosed scope', async t => {
    t.equal(currentTrace(), undefined, 'no ambient trace by default');
    await bindTrace('trace-1', async () => {
        t.equal(currentTrace(), 'trace-1', 'the record inherits the trace reference');
        await Promise.resolve();
        t.equal(currentTrace(), 'trace-1', 'survives an await');
    });
    t.equal(currentTrace(), undefined, 'restored afterwards');
});

t.test('withFlow rejects an identity that is not a ULID (caller misuse throws)', t => {
    // A flow identity is the caller's 26-character Crockford ULID. Anything else
    // is caller misuse and must fail fast, because the identity is carried onto
    // every descendant record: an invented one is a lie in the data, which is
    // the class of defect the flow-identity ruling removed.
    const rejected: Array<[string, unknown]> = [
        ['absent', undefined],
        ['empty', ''],
        ['a readable name rather than an id', 'flow-1'],
        ['too short', '01ARZ3NDEKTSV4RRFFQ69G5FA'],
        ['an excluded Crockford letter', '01ARZ3NDEKTSV4RRFFQ69G5FAI'],
        ['lowercase', '01arz3ndektsv4rrffq69g5fav'],
        ['a number', 42],
    ];
    for (const [label, id] of rejected) {
        try {
            withFlow({id: id as string, kind: FLOW_KIND}, () => undefined);
            t.fail(`${label} was not rejected`);
        } catch (error) {
            t.type(error, TypeError, `${label} throws a TypeError`);
            t.match(
                (error as TypeError).message,
                /flow id must be a ULID/,
                `${label} says what was wrong`,
            );
        }
    }
    // The failure names the offending value, so the caller is not left guessing.
    t.throws(
        () => withFlow({id: 'flow-1', kind: FLOW_KIND}, () => undefined),
        /flow id must be a ULID, got "flow-1"/,
        'the message quotes the value it rejected',
    );
    // A well-formed ULID still runs the body and reports its identity.
    const ran = withFlow({id: FLOW_ID, kind: FLOW_KIND}, () => currentContext().flow?.id);
    t.equal(ran, FLOW_ID, 'a valid ULID enters the scope and is still the identity');
    t.end();
});

t.test('withFlow rejects an absent or empty kind (caller misuse throws)', t => {
    // The kind is the stable process name drift is keyed by (R6c). A flow with
    // no stable name has no drift key, so it is caller misuse in exactly the way
    // a bad ULID is — and it fails the same way, synchronously, before the scope
    // is entered, rather than being carried onto every descendant record.
    const rejected: Array<[string, unknown]> = [
        ['absent', undefined],
        ['empty', ''],
        ['a number', 42],
        ['a null', null],
    ];
    for (const [label, kind] of rejected) {
        try {
            withFlow({id: FLOW_ID, kind: kind as string}, () => undefined);
            t.fail(`${label} kind was not rejected`);
        } catch (error) {
            t.type(error, TypeError, `${label} kind throws a TypeError`);
            t.match(
                (error as TypeError).message,
                /flow kind must be a non-empty string/,
                `${label} says what was wrong`,
            );
        }
    }
    // The failure names the offending value, so the caller is not left guessing.
    t.throws(
        () => withFlow({id: FLOW_ID, kind: ''}, () => undefined),
        /flow kind must be a non-empty string, got ""/,
        'the message quotes the value it rejected',
    );
    // The bad kind never entered the scope, so nothing was left behind.
    t.equal(currentContext().flow, undefined, 'a rejected flow leaves no ambient flow');
    t.end();
});

t.test('a step outside any flow throws instead of inventing an identity', async t => {
    t.equal(currentContext().flow, undefined, 'no ambient flow before the step');
    let failure: unknown;
    try {
        await step('transfer', async () => 1);
    } catch (error) {
        failure = error;
    }
    t.type(failure, TypeError, 'a step has no identity to report outside a flow');
    t.match(
        (failure as TypeError).message,
        /step "transfer" was called outside a flow/,
        'and the failure names the step that could not be attributed',
    );
    // The guard runs before the body, so a bare step never executes its work.
    let bodyRan = false;
    await t.rejects(
        step('transfer', async () => {
            bodyRan = true;
            throw new Error('boom');
        }),
        /outside a flow/,
    );
    t.notOk(bodyRan, 'the body never ran');
    t.equal(currentContext().flow, undefined, 'and nothing is left behind');
});

t.test('a taken rationale is cleared for every scope that shares its box', async t => {
    // The box is what the scope-creating spreads carry by reference, so a take
    // inside a nested scope must be visible to the scope that recorded it —
    // that is what makes consumption one-shot globally rather than per scope.
    recordDecision({discriminator: 'branch', candidates: ['a'], chosen: 'a', values: {}});
    await withFlow({id: FLOW_ID, kind: FLOW_KIND}, async () => {
        t.equal(
            takeDecision()?.discriminator,
            'branch',
            'the nested scope takes the inherited rationale',
        );
        t.equal(takeDecision(), undefined, 'and it is gone within that scope');
    });
    t.equal(
        currentContext().pendingDecision?.decision,
        undefined,
        'the enclosing scope sees it gone too',
    );
    t.equal(takeDecision(), undefined, 'so the enclosing scope has nothing left to attach');
});

t.test('a rationale recorded in a nested scope does not leak outward', async t => {
    await withIntent({name: 'Nested'}, async () => {
        recordDecision({discriminator: 'inner', candidates: ['b'], chosen: 'b', values: {}});
        t.equal(
            currentContext().pendingDecision?.decision?.discriminator,
            'inner',
            'it is pending inside the scope',
        );
    });
    t.equal(
        currentContext().pendingDecision,
        undefined,
        'the nested box is dropped with its scope',
    );
    t.equal(takeDecision(), undefined, 'nothing survives to explain an unrelated outer record');
});

t.test('the ambient context type is importable from the public surface', t => {
    // `AmbientContext` is the declared return type of the public
    // `currentContext()`, so a consumer must be able to name it from the
    // package entry point. The annotation below only compiles while the barrel
    // re-exports it; the import is taken from `../index.ts`, not from this
    // module's own source, so it exercises the published surface.
    const context: AmbientContext = currentContext();
    t.equal(context.intent, undefined, 'no ambient intent outside a scope');
    t.equal(context.flow, undefined, 'and no ambient flow');
    t.equal(context.trace, undefined, 'and no ambient trace');
    t.end();
});

t.test('the last emitted record id is ambient and scoped', async t => {
    t.equal(lastRecordId(), undefined, 'nothing remembered outside a scope');
    rememberRecord('01A');
    t.equal(lastRecordId(), '01A');
    // A scope-creating helper spreads the store. The memory has to travel by
    // *reference* through that spread, or a record emitted inside the scope
    // would be invisible to the enclosing scope and the record emitted after it
    // would name the wrong parent (PRD R7). A plain store field is copied by the
    // spread, so this is the assertion that pins the box.
    await withIntent({name: 'Inner'}, async () => {
        rememberRecord('01B');
        t.equal(lastRecordId(), '01B', 'the nested scope sees and updates the memory');
    });
    t.equal(lastRecordId(), '01B', 'the enclosing scope sees the nested update');
});

t.test('a declared leg is visible for the whole call, and only there', async t => {
    await withFlow({id: FLOW_ID, kind: FLOW_KIND}, async () => {
        t.equal(currentLeg(), undefined, 'a record emitted outside any call has no leg');
        await bindLeg({id: LEG, to: 'hub'}, async () => {
            t.same(
                currentLeg(),
                {id: LEG, to: 'hub', seq: '1'},
                'the declaration is the ambient leg',
            );
            t.equal(currentContext().flow?.id, FLOW_ID, 'the flow stays bound inside the call');
            await Promise.resolve();
            t.equal(currentLeg()?.id, LEG, 'survives an await');
        });
        t.equal(
            currentLeg(),
            undefined,
            'the call is over: a record emitted now is not part of it',
        );
    });
    t.equal(currentLeg(), undefined, 'and nothing survives the flow either');
});

t.test('calls are numbered by a counter in the enclosing scope (PRD R22)', async t => {
    // A *path*, not a number: the receiver numbers its own calls as children of the
    // position it was handed, so two services that each made a first call cannot
    // claim the same slot and the order needs no coordinator and no clock.
    await withFlow({id: FLOW_ID, kind: FLOW_KIND}, async () => {
        await bindLeg({id: 'payer.discovery.parties', to: 'hub'}, async () => {
            t.equal(currentLeg()?.seq, '1', 'the first call in the execution');
            await bindLeg({id: 'hub.discovery.payee', to: 'payee'}, async () => {
                t.equal(
                    currentLeg()?.seq,
                    '1.1',
                    'a call made while answering one belongs under it',
                );
                await bindLeg({id: 'payee.quote.sign', to: 'hub'}, async () => {
                    t.equal(currentLeg()?.seq, '1.1.1', 'and nesting keeps going deeper');
                });
                t.equal(currentLeg()?.seq, '1.1', 'without disturbing the enclosing position');
            });
            await bindLeg({id: 'hub.quote.fx', to: 'fxp'}, async () => {
                t.equal(
                    currentLeg()?.seq,
                    '1.2',
                    'a sibling takes the next number, not the same one',
                );
            });
        });
        await bindLeg({id: 'payer.quote.rates', to: 'hub'}, async () => {
            t.equal(currentLeg()?.seq, '2', 'and the enclosing counter starts a new branch');
        });
    });
});

t.test('adopting an inbound leg names the same call, without claiming the declaration', async t => {
    // The receiving end adopts the id and the position so its records pair with the
    // caller's and are ordered with them — but not `to`, which is the caller's
    // statement about where the call was aimed. It declares its *own* calls instead.
    await withFlow({id: FLOW_ID, kind: FLOW_KIND}, async () => {
        await bindInboundLeg({id: 'payer.quote.rates', seq: '2'}, async () => {
            t.same(currentLeg(), {id: 'payer.quote.rates', to: undefined, seq: '2'});
            await bindLeg({id: 'hub.quote.fx', to: 'fxp'}, async () => {
                t.equal(
                    currentLeg()?.seq,
                    '2.1',
                    'its own calls are numbered under the adopted position',
                );
            });
        });
        await bindInboundLeg({id: 'payer.discovery.parties'}, async () => {
            t.equal(
                currentLeg()?.seq,
                undefined,
                'an emitter that sent no position still names its call',
            );
        });
    });
});

t.test('a leg is scoped, not positional: it does not disturb the flow position', async t => {
    // `step` mutates the flow object every scope shares by reference, which is
    // deliberate — a stalled flow reports its last known step. A leg must not do
    // the same: it replaces the *store*, not the flow object, so binding one
    // neither moves the position nor hides a step taken inside it.
    await withFlow({id: FLOW_ID, kind: FLOW_KIND}, async () => {
        await bindLeg({id: LEG, to: 'hub'}, async () => {
            await step('quote', async () => undefined);
            t.equal(currentLeg()?.id, LEG, 'still inside the call after a step');
        });
        t.equal(
            currentContext().flow?.step,
            'quote',
            'the step taken inside the call is visible outside it',
        );
        t.equal(
            currentContext().flow?.leg,
            undefined,
            'the leg never joins the shared flow object',
        );
    });
});

t.test('a declaration is refused unless it names a call and a receiver', t => {
    // A leg belongs to a flow's call, so one bound outside a flow has nothing to be
    // attributed to — inventing a flow to hold it would put a lie in the data, the
    // same reason `step` throws. The id and the receiver are validated for the same
    // class of reason: a malformed one would otherwise reach an HTTP header, a source
    // grep and a generated diagram before anyone noticed, and a call whose receiver
    // was guessed would misreport every leg it labelled.
    t.throws(
        () => bindLeg({id: LEG, to: 'hub'}, () => undefined),
        /was bound outside a flow/,
        'a leg outside a flow throws',
    );
    const rejected: Array<[string, unknown]> = [
        ['absent', undefined],
        ['empty', ''],
        ['a slash', 'payer/hop'],
        ['a space', 'payer discovery'],
        ['a leading separator', '.payer'],
        ['a semicolon, which would break a generated diagram', 'payer;hop'],
        ['a number', 42],
    ];
    for (const [label, id] of rejected) {
        try {
            bindLeg({id: id as string, to: 'hub'}, () => undefined);
            t.fail(`${label} was not rejected`);
        } catch (error) {
            t.type(error, TypeError, `${label} throws a TypeError`);
            t.match((error as TypeError).message, /leg id must be/, `${label} says what was wrong`);
        }
    }
    // The failure names the offending value, so the caller is not left guessing.
    t.throws(
        () => bindLeg({id: 'payer/hop', to: 'hub'}, () => undefined),
        /"payer\/hop"/,
        'the id is quoted back',
    );
    t.throws(
        () => bindLeg({id: LEG, to: 'hub bus'}, () => undefined),
        /must name the participant it calls/,
        'a receiver that is not a name is caller misuse too',
    );
    // Case is not folded: a leg is usually named after the participant that makes
    // the call, and participant names are written in code (`hubA`, not `huba`).
    t.equal(isLegId('hubA.quote.proxy'), true, 'an uppercase participant name is a lawful leg id');
    t.equal(isServiceName('hubA'), true, 'and a lawful receiver');
    t.equal(isServiceName(42), false, 'a receiver that is not a string is not a name');
    t.equal(isLegSeq('1.2.10'), true, 'a path of counters is a position');
    t.equal(isLegSeq('1.'), false, 'and nothing else is');
    t.throws(
        () =>
            withFlow({id: FLOW_ID, kind: FLOW_KIND}, () =>
                bindInboundLeg({id: LEG, seq: 'x'}, () => undefined),
            ),
        /malformed position/,
        'an adopted position is validated where it is bound',
    );
    t.throws(
        () =>
            withFlow({id: FLOW_ID, kind: FLOW_KIND}, () =>
                bindInboundLeg({id: 'payer/hop'}, () => undefined),
            ),
        /leg id must be/,
        'and so is an adopted id',
    );
    t.end();
});
