import t from 'tap';
import {withIdentity} from '../fingerprint.ts';
import {REF_LENGTH} from '../refs.ts';
import {refFromFingerprint, TemplateRegistry} from './registry.ts';
import type {IngestEvent} from './registry.ts';

const event = {
    id: '01A',
    time: 1000,
    fingerprint: 'abcdef0123456789abcdef0123456789',
    template: '[LEVEL: ERROR] [SERVICE: hub] [MSG: timeout]',
    service: 'hub',
    level: 50,
    levelName: 'error',
    msg: 'timeout',
};

t.test('a reference is a stable short form of the fingerprint', t => {
    const registry = new TemplateRegistry();
    const {entry, novel} = registry.upsert(event);
    t.equal(novel, true);
    t.equal(entry.ref, 'abcdef012345');
    t.equal(registry.get('abcdef012345')?.fingerprint, event.fingerprint);
    t.end();
});

t.test('repeat occurrences count instead of creating entries', t => {
    const registry = new TemplateRegistry();
    registry.upsert(event);
    const {entry, novel} = registry.upsert({...event, id: '01B', time: 2000});
    t.equal(novel, false);
    t.equal(entry.count, 2);
    t.equal(entry.firstSeen, 1000);
    t.equal(entry.lastSeen, 2000);
    t.equal(registry.size(), 1);
    t.end();
});

t.test('the registry is the durable artifact: it answers without records (PRD R4)', t => {
    const registry = new TemplateRegistry();
    registry.upsert(event);
    registry.upsert({...event, id: '01B', time: 2500});
    const [entry] = registry.list();
    t.equal(entry.count, 2);
    t.equal(entry.signature, event.template);
    t.same(entry.exemplars, []);
    t.end();
});

t.test('retirement is recorded rather than deleted', t => {
    const registry = new TemplateRegistry();
    registry.upsert(event);
    registry.retire('abcdef012345', 9000);
    const entry = registry.get('abcdef012345');
    t.equal(entry?.retiredAt, 9000);
    t.equal(registry.size(), 1, 'still listed, so a deploy diff can see it went away');
    t.end();
});

t.test('a template observed again after retirement is no longer retired (FIX 3)', t => {
    const registry = new TemplateRegistry();
    registry.upsert(event);
    registry.retire('abcdef012345', 2000);
    t.equal(registry.get('abcdef012345')?.retiredAt, 2000);

    const {entry} = registry.upsert({...event, id: '01C', time: 3000});
    t.equal(entry.retiredAt, undefined, 'a later observation clears the retirement');
    t.equal(entry.count, 2, 'and the occurrence counts normally again');
    t.end();
});

t.test('a straggler older than the retirement does not resurrect the template (FIX 3)', t => {
    const registry = new TemplateRegistry();
    registry.upsert(event);
    registry.retire('abcdef012345', 2000);

    registry.upsert({...event, id: '01B', time: 1500});
    t.equal(
        registry.get('abcdef012345')?.retiredAt,
        2000,
        'an observation from before the retirement is not a reappearance',
    );
    t.end();
});

// --- Paths the acceptance tests above do not reach ---------------------------------

/** Build an ingest event, defaulting everything but the identity and the time. */
function ingest(overrides: Partial<IngestEvent> & {id: string; time: number}): IngestEvent {
    return {
        fingerprint: event.fingerprint,
        template: event.template,
        service: event.service,
        ...overrides,
    };
}

t.test('the registry keys on the reference the emitter itself emitted (PRD R12)', t => {
    const record = withIdentity({
        id: '01A',
        time: 1000,
        level: 50,
        levelName: 'error',
        msg: 'timeout',
        service: 'hub',
        refs: {record: '01A'},
    });
    const fingerprint = record.fingerprint ?? '';
    t.equal(fingerprint.length, 32, 'the fingerprint is the 32-hex digest');
    t.equal(refFromFingerprint(fingerprint).length, REF_LENGTH);

    const registry = new TemplateRegistry();
    const {entry} = registry.upsert({
        id: record.id,
        time: record.time,
        fingerprint,
        template: record.template,
        service: record.service,
    });
    t.equal(entry.ref, record.refs.template, 'one cut, shared by both halves');
    t.end();
});

t.test('a centroid is kept per template and replaced only when one is supplied', t => {
    const registry = new TemplateRegistry();
    t.equal(registry.upsert(ingest({id: '01A', time: 1000})).entry.centroid, undefined);

    const first = registry.upsert(ingest({id: '01B', time: 2000}), [1, 0]);
    t.same(first.entry.centroid, [1, 0]);

    const second = registry.upsert(ingest({id: '01C', time: 3000}), [0, 1]);
    t.same(second.entry.centroid, [0, 1]);

    const third = registry.upsert(ingest({id: '01D', time: 4000}));
    t.same(third.entry.centroid, [0, 1], 'an event with no embedding leaves the centroid alone');
    t.end();
});

t.test('the stored centroid is a copy, so a later mutation of the caller array cannot reach the registry', t => {
    const registry = new TemplateRegistry();

    // New-entry path: the caller keeps the array and mutates it after handing it over.
    const fresh = [1, 0];
    const created = registry.upsert(ingest({id: '01A', time: 1000}), fresh);
    fresh[0] = 99;
    t.same(created.entry.centroid, [1, 0], 'the new-entry path stores a copy, not the array it was handed');
    t.same(registry.get('abcdef012345')?.centroid, [1, 0], 'a later read still sees the original values');

    // Existing-entry path: same handover on an entry that already exists.
    const replacement = [0, 1];
    const updated = registry.upsert(ingest({id: '01B', time: 2000}), replacement);
    replacement[1] = 99;
    t.same(updated.entry.centroid, [0, 1], 'the existing-entry path stores a copy, not the array it was handed');
    t.same(registry.get('abcdef012345')?.centroid, [0, 1], 'a later read still sees the original values');
    t.end();
});

t.test('intent names accumulate for a template, without duplicates', t => {
    const registry = new TemplateRegistry();
    const plain = registry.upsert(ingest({id: '01A', time: 1000, fingerprint: 'aaaa0000000000000000000000000000'})).entry;
    t.same(plain.intents, [], 'no intent is an empty list');

    const withIntent = registry.upsert(
        ingest({id: '01B', time: 2000, fingerprint: 'bbbb0000000000000000000000000000', intent: {name: 'User_Transfer'}}),
    ).entry;
    t.same(withIntent.intents, ['User_Transfer'], 'an intent on a brand-new template is recorded');

    registry.upsert(
        ingest({id: '01C', time: 3000, fingerprint: 'bbbb0000000000000000000000000000', intent: {name: 'User_Transfer'}}),
    );
    t.same(withIntent.intents, ['User_Transfer'], 'the same intent seen again is not listed twice');
    t.equal(withIntent.count, 2, 'the intent did not create a second entry');

    registry.upsert(
        ingest({
            id: '01D',
            time: 4000,
            fingerprint: 'bbbb0000000000000000000000000000',
            intent: {name: 'Merchant_Settlement'},
        }),
    );
    t.same(withIntent.intents, ['User_Transfer', 'Merchant_Settlement']);
    t.equal(registry.size(), 2);
    t.end();
});

t.test('an event with no template still becomes an entry, with an empty signature', t => {
    const registry = new TemplateRegistry();
    const {entry, novel} = registry.upsert({
        id: '01A',
        time: 1000,
        fingerprint: 'abcdef0123456789abcdef0123456789',
        service: 'hub',
    });
    t.equal(novel, true);
    t.equal(entry.signature, '', 'an absent template is not the string "undefined"');
    t.end();
});

t.test('bump counts an occurrence against a known reference only', t => {
    const registry = new TemplateRegistry();
    registry.upsert(ingest({id: '01A', time: 1000}));

    const bumped = registry.bump('abcdef012345', 4000);
    t.equal(bumped?.count, 2);
    t.equal(bumped?.lastSeen, 4000);

    registry.bump('abcdef012345', 2000);
    t.equal(bumped?.lastSeen, 4000, 'an older observation cannot move last-seen backwards');

    t.equal(registry.bump('deadbeefdead', 5000), undefined, 'an unknown reference is a no-op');
    t.equal(registry.size(), 1);
    t.end();
});

t.test('retiring an unknown reference changes nothing', t => {
    const registry = new TemplateRegistry();
    registry.upsert(ingest({id: '01A', time: 1000}));

    t.equal(registry.retire('deadbeefdead', 9000), undefined);
    t.equal(registry.get('abcdef012345')?.retiredAt, undefined);
    t.equal(registry.size(), 1);
    t.end();
});

t.test('replaceAll swaps the registry contents wholesale (persistence loader)', t => {
    const registry = new TemplateRegistry();
    registry.upsert(ingest({id: '01A', time: 1000}));
    const loaded = registry.upsert(
        ingest({id: '02B', time: 2000, fingerprint: 'ffffffffffffffffffffffffffffffff'}),
    ).entry;
    t.equal(registry.size(), 2);

    registry.replaceAll([loaded]);
    t.equal(registry.size(), 1);
    t.equal(registry.get('ffffffffffff'), loaded, 'the loaded entry is kept as-is');
    t.equal(registry.get('abcdef012345'), undefined, 'entries absent from the snapshot are dropped');

    registry.replaceAll([]);
    t.equal(registry.size(), 0);
    t.end();
});
