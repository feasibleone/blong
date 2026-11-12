/**
 * The plan channel: its name, its topic and where a person opens it.
 *
 * These are the parts of the Slack half that are decided here rather than by the platform,
 * so they are the parts a test can pin: the name Slack will accept, the topic that puts
 * the issue where a reader can click it, and the link a plan stores.
 */

import {test} from 'tap';

import {planChannelName, planChannelTopic, planChannelUrl} from './planSlack.ts';

test('a channel name is the plan, lowercased and prefixed once', async t => {
    t.equal(planChannelName('agent'), 'plan-agent');
    t.equal(planChannelName('plan-workflow'), 'plan-workflow', 'a plan name is not prefixed twice');
    t.equal(
        planChannelName('Plan Workflow!'),
        'plan-workflow',
        'a slug that already reads as a plan keeps its name',
    );
    t.equal(planChannelName(''), 'plan-untitled');
    t.end();
});

test('the topic leads with the issue, because Slack cuts the topic off', async t => {
    t.equal(
        planChannelTopic({
            title: 'Plan workflow',
            issueUrl: 'https://github.com/feasibleone/blong/issues/250',
        }),
        'https://github.com/feasibleone/blong/issues/250 · Plan: Plan workflow',
        'the link a reader clicks comes first',
    );
    t.equal(
        planChannelTopic({title: 'Plan workflow'}),
        'Plan: Plan workflow',
        'a plan with no issue yet still names itself',
    );
    t.equal(
        planChannelTopic({title: 'x'.repeat(300)}).length,
        250,
        'and the platform’s limit is respected rather than refused',
    );
    t.end();
});

test('a channel link opens the channel from its id alone', async t => {
    t.equal(
        planChannelUrl({platform: 'slack', conversationId: 'C0CGV5Y70LS'}),
        'https://slack.com/app_redirect?channel=C0CGV5Y70LS',
    );
    t.equal(planChannelUrl({platform: 'viber', conversationId: 'C1'}), undefined);
    t.equal(planChannelUrl({platform: 'slack'}), undefined, 'no id, no link');
    t.end();
});
