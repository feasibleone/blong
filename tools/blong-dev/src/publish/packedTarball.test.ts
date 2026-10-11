/**
 * Unit tests for the publish-surface reader (`publish/packedTarball.ts`).
 *
 * The shapes here are the ones this repository actually has: the Rush template's comments in `rush.json`,
 * an `exports` map with conditions and a subpath for `package.json`, and the allow-list that published
 * three files of metadata for a realm package.
 */

import {test} from 'tap';

import {
    declaredTargets,
    parseRushProjects,
    patternCovers,
    stripJsonComments,
    targetStates,
    unbuiltTargets,
    unpublishedTargets,
    whitelistPatterns,
} from './packedTarball.ts';

test('rush.json is read with its comments and without its strings', t => {
    const text = [
        '/**',
        ' * A template comment, with // inside it.',
        ' */',
        '{',
        '   // a line comment',
        '   "projects": [',
        '      { "packageName": "@feasibleone/a", "projectFolder": "core/a", "shouldPublish": true },',
        '      { "packageName": "@feasibleone/b", "projectFolder": "core/b" }',
        '   ],',
        '   "repository": { "url": "https://example.com//not-a-comment" }',
        '}',
    ].join('\n');
    t.notMatch(stripJsonComments(text), /template comment/, 'the block comment is gone');
    t.match(stripJsonComments(text), /https:\/\/example\.com\/\/not-a-comment/, 'and a url survives');
    const projects = parseRushProjects(text);
    t.equal(projects.length, 2, 'both projects are read');
    t.equal(projects[0]?.shouldPublish, true, 'a project that publishes says so');
    t.equal(projects[1]?.shouldPublish, false, 'and one that does not is false rather than missing');
    t.end();
});

test('a manifest declares its entry points wherever they are written', t => {
    const declared = declaredTargets({
        exports: {
            './server.js': './dist/server.js',
            './server.ts': './server.ts',
            '.': {types: './types.ts', default: './dist/types.js'},
        },
        bin: {'semantic-log-flow': './flow/run.ts'},
        main: './main.ts',
        types: './types.ts',
    });
    t.same(
        declared,
        [
            'dist/server.js',
            'dist/types.js',
            'flow/run.ts',
            'main.ts',
            'server.ts',
            'types.ts',
        ].sort(),
        'every value is a target, with the leading ./ removed and duplicates collapsed',
    );
    t.notOk(
        declared.includes('server.js'),
        'while an export key names a subpath rather than a file the tarball has to hold',
    );
    t.end();
});

test('an allow-list is its un-ignore lines', t => {
    t.same(
        whitelistPatterns(
            ['# a comment', '*', '!/bin/**', '# !/not-a-pattern', '!/index.ts', '!/bin/**', ''].join('\n'),
        ),
        ['/bin/**', '/index.ts'],
        'only the lines that start with !, without it, and once each',
    );
    t.same(whitelistPatterns('*\n/dist/**\n'), [], 'a file with no un-ignore lines covers nothing');
    t.end();
});

test('a pattern covers the paths npm would keep, and only those', t => {
    t.ok(patternCovers('/dist/**', 'dist/server.js'), 'a rooted directory pattern covers its files');
    t.ok(patternCovers('/dist/**', 'dist/a/b.js'), 'at any depth inside it');
    t.notOk(patternCovers('/dist/**', 'src/dist.js'), 'and no other directory');
    t.ok(patternCovers('/server.ts', 'server.ts'), 'a rooted file pattern covers that file');
    t.notOk(patternCovers('/server.ts', 'nested/server.ts'), 'and not a file of the same name deeper in');
    t.ok(patternCovers('server.ts', 'server.ts'), 'a pattern without a slash covers a root file');
    t.ok(
        patternCovers('server.ts', 'nested/server.ts'),
        'and the same name at any depth, the way an ignore file reads such a pattern',
    );
    t.ok(patternCovers('*.test.js', 'lib/a.test.js'), 'a bare glob covers a name anywhere');
    t.ok(patternCovers('**', 'dist/server.js'), 'and ** covers everything');
    t.notOk(patternCovers('/index.ts', 'index.ts.map'), 'a pattern is a whole path, not a prefix');
    t.end();
});

test('the check fails on a target that is here and unpublished, not on one nobody built', t => {
    // The semantic-log shape: five entry points declared, the allow-list bringing back three.
    const states = targetStates(
        ['attachable.ts', 'capability.ts', 'index.ts', 'dist/server.js'],
        ['capability.ts', 'index.ts', 'package.json'],
        ['/index.ts', '/capability.ts', '/dist/**'],
        target => target !== 'dist/server.js',
    );
    t.same(
        unpublishedTargets(states),
        ['attachable.ts'],
        'a target on disk that the tarball lacks is the failure, and the built-and-allowed dist is not',
    );
    t.same(unbuiltTargets(states), ['dist/server.js'], 'a target this checkout does not have is reported');
    t.same(
        targetStates(['index.ts'], ['index.ts'], ['/index.ts']).map(state => state.allowed),
        [true],
        'and a covered target says so',
    );
    t.end();
});
