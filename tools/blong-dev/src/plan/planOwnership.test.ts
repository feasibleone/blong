/**
 * The claim a plan travels with: what the front matter holds, and what the published header says.
 *
 * The two halves are tested apart from the command because they are the contract both hosts read —
 * the marker is parsed on a machine that has never seen the other's checkout, so its round trip is
 * the thing that matters, not the command that writes it.
 */

import {test} from 'tap';

import {issueBody} from './planGithub.ts';
import {
    CLAIM_FIELDS,
    claimMarker,
    claimOf,
    claimPatch,
    hostLabel,
    isHostLabel,
    isMine,
    parseClaimMarker,
} from './planOwnership.ts';

test('a host label names the machine, and nothing a label cannot hold', async t => {
    t.equal(hostLabel('ms-02'), 'plan-host:ms-02', 'the ordinary case is the host itself');
    t.equal(
        hostLabel('Builder, 01'),
        'plan-host:Builder-01',
        'a comma would split the argument gh is given, so it becomes a hyphen',
    );
    t.equal(hostLabel('  '), 'plan-host:unknown', 'an empty host still gets a label');
    t.equal(hostLabel('a'.repeat(80)).length, 50, 'and a long one stays inside the fifty allowed');
    t.ok(isHostLabel('plan-host:ms-02'));
    t.notOk(isHostLabel('plan-claimed'), 'the bare claim label is not a host');
    t.end();
});

test('a marker round-trips host, day and login', async t => {
    const marker = claimMarker({host: 'ms-02', at: '2026-11-23', by: 'kalin'});
    t.equal(marker, '<!-- plan-claim host="ms-02" at="2026-11-23" by="kalin" -->');
    t.same(parseClaimMarker(`> a header\n\n${marker}\n\n# plan`), {
        host: 'ms-02',
        at: '2026-11-23',
        by: 'kalin',
    });
    t.end();
});

test('a body without a marker has no claim, and a quote cannot break one', async t => {
    t.equal(parseClaimMarker('# plan\n\nNo claim here.'), undefined, 'no marker, no claim');
    t.equal(
        parseClaimMarker('<!-- plan-claim at="2026-11-23" -->'),
        undefined,
        'a host is required',
    );
    t.equal(
        parseClaimMarker(claimMarker({host: 'a"b', at: '2026-11-23'}))?.host,
        'ab',
        'a quote is dropped rather than ending the attribute',
    );
    t.end();
});

test('the front matter holds the claim, and a release drops all three fields', async t => {
    t.same(claimOf({claimed: 'ms-02', claimedAt: '2026-11-23', claimedBy: 'kalin'}), {
        host: 'ms-02',
        at: '2026-11-23',
        by: 'kalin',
    });
    t.equal(claimOf({}), undefined, 'no claim is no claim');
    t.same(claimPatch({host: 'ms-02', at: '2026-11-23'}), {
        claimed: 'ms-02',
        claimedAt: '2026-11-23',
    });
    t.same(CLAIM_FIELDS, ['claimed', 'claimedAt', 'claimedBy'], 'the release clears exactly these');
    t.ok(isMine({host: 'ms-02', at: '2026-11-23'}, 'ms-02'));
    t.notOk(isMine({host: 'ms-02', at: '2026-11-23'}, 'ms-01'));
    t.end();
});

test('the issue header says who holds the plan, or that nobody does, or that the file is gone', async t => {
    const claimed = issueBody('# plan\n', 'demo', {
        claim: {host: 'ms-02', at: '2026-11-23', by: 'kalin'},
    });
    t.match(
        claimed,
        /> Mirrored from `plans\/demo\/plan\.md`, claimed by `ms-02` \(kalin\) on 2026-11-23\./,
    );
    t.match(
        claimed,
        /<!-- plan-claim host="ms-02" at="2026-11-23" by="kalin" -->/,
        'with its marker',
    );
    t.equal(parseClaimMarker(claimed)?.host, 'ms-02', 'which reads back as the same claim');

    const unclaimed = issueBody('# plan\n', 'demo');
    t.match(unclaimed, /> Planned here, with its working copy in `plans\/demo\/plan\.md`\./);
    t.match(unclaimed, /No host has claimed/);
    t.notMatch(unclaimed, /plan-claim host=/, 'an unclaimed plan carries no marker');

    const removed = issueBody('# plan\n', 'demo', {removedAt: '2026-11-24'});
    t.match(removed, /> The local `plans\/demo\/plan\.md` was removed on 2026-11-24/);
    t.match(removed, /This issue is the source of record/);
    t.end();
});
