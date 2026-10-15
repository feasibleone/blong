/**
 * Unit tests for the published-Storybook register and the embed check.
 *
 * Three failures are worth a test here because none of them is loud at the point it happens: a
 * site staged from the wrong directory ships a Storybook nobody can open, an embed naming a story
 * id that no longer exists renders an empty frame on a published page, and a quoted example of the
 * embed tag counted as an embed would make the page that documents the tag fail its own check.
 *
 * The builds are faked — a fixture package whose "build" writes the `index.json` a real build
 * writes — so the staging path is exercised without a Storybook, which takes minutes.
 */

import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';

import {
    checkEmbeds,
    findEmbeds,
    loadStorybookSites,
    stageStorybooks,
    stagedStoryIds,
    type IStorybookSite,
} from './storybookSites.ts';
import {repoRoot} from '../report/reportPaths.ts';

/** A fake build: writes the `index.json` a real Storybook build leaves behind. */
const FAKE_BUILD = [
    "import {mkdirSync, writeFileSync} from 'node:fs';",
    "mkdirSync('storybook-static', {recursive: true});",
    "writeFileSync('storybook-static/index.json', JSON.stringify({entries: {'demo--one': {}}}));",
    '',
].join('\n');

/**
 * A repository root with one registered site, one package and one page.
 *
 * `command` is what the site's build runs, so a test can make it succeed, fail or write nothing.
 */
function fixture(options: {command?: string; page?: string} = {}): {
    root: string;
    sites: IStorybookSite[];
} {
    const root = mkdtempSync(join(tmpdir(), 'blong-storybook-'));
    mkdirSync(join(root, 'docs/blong/docs'), {recursive: true});
    mkdirSync(join(root, 'demo/realm'), {recursive: true});
    writeFileSync(join(root, 'demo/realm/fake-build.mjs'), FAKE_BUILD);
    writeFileSync(
        join(root, 'docs/blong/storybook-sites.json'),
        JSON.stringify({
            version: 1,
            sites: [
                {
                    name: 'demo',
                    title: 'the demo realm',
                    package: 'demo/realm',
                    command: options.command ?? 'node fake-build.mjs',
                    output: 'storybook-static',
                },
            ],
        }),
    );
    writeFileSync(
        join(root, 'docs/blong/docs/page.md'),
        options.page ?? '<StorybookStory site="demo" id="demo--one" />\n',
    );
    return {root, sites: loadStorybookSites(root)};
}

/** Where a staged site lands in a fixture. */
function staged(root: string): string {
    return join(root, 'docs/blong/static/storybook/demo');
}

t.test('the register in the repository matches what the command reads', t => {
    const sites = loadStorybookSites(repoRoot(import.meta.dirname));
    t.same(
        sites.map(site => site.name),
        ['browser', 'suite', 'log'],
        'the checkout publishes three Storybooks',
    );
    for (const site of sites) {
        t.ok(existsSync(join(repoRoot(import.meta.dirname), site.package)), `${site.name} exists`);
    }
    t.end();
});

t.test('findEmbeds reads the tags a page uses, not the ones it quotes', t => {
    const page = [
        'The tag is written like this:',
        '',
        '```mdx',
        '<StorybookStory site="demo" id="quoted--example" />',
        '```',
        '',
        'and it is used like this:',
        '',
        '<StorybookStory site="demo" id="demo--one" height="640px" />',
        '',
    ].join('\n');
    const {root} = fixture({page});
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    t.same(
        findEmbeds(root),
        [
            {
                file: 'docs/blong/docs/page.md',
                site: 'demo',
                id: 'demo--one',
            },
        ],
        'the example in the fence is read as an illustration and the real tag as an embed',
    );
    t.end();
});

t.test('stageStorybooks stages a site and resolves its embeds', t => {
    const {root, sites} = fixture();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    t.ok(stageStorybooks(root, sites, {build: true, dryRun: false}), 'a build and an embed check');
    t.ok(existsSync(join(staged(root), 'index.json')), 'the build output is published');
    t.same(
        [...(stagedStoryIds(root, sites[0]!) ?? [])],
        ['demo--one'],
        'the staged index is what the embed was resolved against',
    );
    t.end();
});

t.test('stageStorybooks refuses an embed the staged site does not serve', t => {
    const {root, sites} = fixture({
        page: '<StorybookStory site="demo" id="demo--gone" />\n',
    });
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    t.notOk(stageStorybooks(root, sites, {build: true, dryRun: false}), 'a stale embed fails');
    t.ok(existsSync(join(staged(root), 'index.json')), 'the site is staged all the same');
    t.end();
});

t.test('stageStorybooks refuses a build that failed or wrote nothing', async t => {
    await t.test('a build that exits non-zero', t => {
        const {root, sites} = fixture({command: 'exit 3'});
        t.teardown(() => rmSync(root, {recursive: true, force: true}));
        t.notOk(stageStorybooks(root, sites, {build: true, dryRun: false}), 'no output, no stage');
        t.notOk(existsSync(staged(root)), 'and nothing was published');
        t.end();
    });
    await t.test('a build that leaves no index.json', t => {
        const {root, sites} = fixture({command: 'true'});
        t.teardown(() => rmSync(root, {recursive: true, force: true}));
        t.notOk(stageStorybooks(root, sites, {build: true, dryRun: false}), 'the site is not a site');
        t.end();
    });
});

t.test('stageStorybooks replaces what it staged last time', t => {
    const {root, sites} = fixture();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    mkdirSync(join(staged(root), 'assets'), {recursive: true});
    writeFileSync(join(staged(root), 'assets/old-story.js'), 'a story nobody serves any more');

    t.ok(stageStorybooks(root, sites, {build: true, dryRun: false}), 'staged');
    t.notOk(
        existsSync(join(staged(root), 'assets/old-story.js')),
        'the previous tree is gone, so an embed cannot resolve against a story that was deleted',
    );
    t.end();
});

t.test('a dry run builds nothing', t => {
    const {root, sites} = fixture();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    t.ok(stageStorybooks(root, sites, {build: true, dryRun: true}), 'the plan is what is checked');
    t.notOk(existsSync(staged(root)), 'and nothing is written');
    t.end();
});

t.test('checkEmbeds says what is wrong with an embed', t => {
    const {root, sites} = fixture({
        page: [
            '<StorybookStory />',
            '<StorybookStory site="nope" id="demo--one" />',
            '<StorybookStory site="demo" />',
            '',
        ].join('\n'),
    });
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    const problems = checkEmbeds(root, sites, {requireStaged: true});
    t.equal(problems.length, 3, 'one problem per tag');
    t.match(problems[0]!, /no site; the register holds demo/, 'a tag with no site names the register');
    t.match(problems[1]!, /unknown site; the register holds demo/, 'an unknown site is named');
    t.match(problems[2]!, /no story id/, 'a tag with no id says so');
    t.end();
});

t.test('checkEmbeds leaves an unstaged site alone when it is not required', t => {
    const {root, sites} = fixture();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    t.same(
        checkEmbeds(root, sites, {requireStaged: false}),
        [],
        'a machine with no Storybook staged cannot judge the id, so it does not guess',
    );
    t.same(
        checkEmbeds(root, sites, {requireStaged: true}).length,
        1,
        'a publish has just built it, so it must be there',
    );
    t.end();
});
