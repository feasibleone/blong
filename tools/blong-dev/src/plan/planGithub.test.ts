/**
 * The issue body the tool publishes, and the preamble a rebuild has to take back off.
 *
 * These are one contract: `issueBody` writes the header, the claim marker and the front-matter
 * comment, and `stripIssueHeader` removes them, so a host with no checkout can rebuild the plan —
 * front matter and all — from what the first host published. The round trip is the test, not the
 * halves apart.
 */

import {test} from 'tap';

import {claimLabelsChange, issueBody, issueFrontMatter, stripIssueHeader} from './planGithub.ts';

const PLAN_BODY = '# Demo plan\n\n## 3. Work breakdown\n\n- [ ] One · area: docs\n';

const FRONT_MATTER = `slug: demo
title: Demo plan
status: closed
created: 2026-11-01
approved: 2026-11-02
closed: 2026-11-20
conversationId: C0CGRSZ633M
summary: >-
    A plan whose front matter a rebuild has to bring back: the dates, the channel, the summary.`;

test('whatever header the issue carries, the plan comes back as it was', async t => {
    const claimed = issueBody(PLAN_BODY, 'demo', {
        claim: {host: 'ms-02', at: '2026-11-23', by: 'kalin'},
    });
    t.equal(stripIssueHeader(claimed), PLAN_BODY, 'the sentence and the marker both go');

    const unclaimed = issueBody(PLAN_BODY, 'demo');
    t.equal(stripIssueHeader(unclaimed), PLAN_BODY, 'so does the unowned sentence');

    const removed = issueBody(PLAN_BODY, 'demo', {removedAt: '2026-11-24'});
    t.equal(stripIssueHeader(removed), PLAN_BODY, 'and the one that says the file is gone');
    t.end();
});

test('a claim knows which labels its issue should carry', t => {
    const claim = {host: 'ms-02', at: '2026-11-23', by: 'kalin'};

    const fresh = claimLabelsChange(claim, ['plan']);
    t.notOk(fresh.holds, 'a freshly created issue does not carry the claim yet');
    t.same(fresh.add, ['plan-claimed', 'plan-host:ms-02'], 'both labels are what it adds');
    t.same(fresh.remove, [], 'and nothing is taken off');
    t.equal(fresh.assignee, 'kalin', 'the login that took it is the assignee');

    const marked = claimLabelsChange(claim, ['plan', 'plan-claimed', 'plan-host:ms-02']);
    t.ok(marked.holds, 'an issue that already carries them needs no edit');

    const takenOver = claimLabelsChange(claim, ['plan', 'plan-claimed', 'plan-host:builder-01']);
    t.notOk(takenOver.holds, "another host's label is not this claim");
    t.same(takenOver.remove, ['plan-host:builder-01'], 'so it is taken off in the same edit');

    const anonymous = claimLabelsChange({host: 'ms-02', at: '2026-11-23'}, []);
    t.notOk('assignee' in anonymous, 'a claim with no known login assigns nobody');
    t.end();
});

test('a body with no header is left alone, and a quote inside the plan is not a header', async t => {
    t.equal(stripIssueHeader(PLAN_BODY), PLAN_BODY, 'nothing to strip');
    const withQuote = `${PLAN_BODY}\n> a note the plan makes\n`;
    t.equal(stripIssueHeader(withQuote), withQuote, 'only the leading block is preamble');
    t.end();
});

test('the front matter an issue carries comes back as it was written', async t => {
    const body = issueBody(PLAN_BODY, 'demo', {frontMatter: FRONT_MATTER});
    t.equal(issueFrontMatter(body), FRONT_MATTER, 'every key, and the folded summary as it was');
    t.equal(stripIssueHeader(body), PLAN_BODY, 'and the comment is not part of the plan');

    const claimed = issueBody(PLAN_BODY, 'demo', {
        claim: {host: 'ms-02', at: '2026-11-23'},
        frontMatter: FRONT_MATTER,
    });
    t.equal(issueFrontMatter(claimed), FRONT_MATTER, 'the claim marker does not hide it');

    const removed = issueBody(PLAN_BODY, 'demo', {
        removedAt: '2026-11-24',
        frontMatter: FRONT_MATTER,
    });
    t.equal(issueFrontMatter(removed), FRONT_MATTER, 'nor does the removed-file sentence');
    t.end();
});

test('a YAML value holding the comment token does not end the block', async t => {
    const awkward = 'slug: demo\nnote: a --> b';
    const body = issueBody(PLAN_BODY, 'demo', {frontMatter: awkward});
    t.equal(issueFrontMatter(body), awkward, 'the reader puts the token back');
    t.equal(stripIssueHeader(body), PLAN_BODY, 'and the block is still one block');
    t.end();
});

test('an issue published without the comment says so by answering nothing', async t => {
    const legacy = issueBody(PLAN_BODY, 'demo');
    t.equal(issueFrontMatter(legacy), undefined, 'a rebuild falls back to defaults');
    t.equal(issueFrontMatter('no comment here'), undefined);
    t.equal(issueFrontMatter('<!-- plan-front-matter\nslug: demo\n'), undefined, 'unclosed');
    t.end();
});
