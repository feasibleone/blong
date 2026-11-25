import t from 'tap';

import {highlightLines, languageLabel, normaliseLanguage, type ICodeToken} from './markdownCode.ts';

/**
 * The code colouring (`@@T-799`).
 *
 * Tokens, not markup: what is asserted is that a comment, a string, a keyword and a number are told
 * apart, that the languages a session actually writes are all coloured, and that a language the
 * page does not carry is still one plain run per line — a fence of some other language renders in
 * its monospace body rather than disappearing.
 *
 * Plain text and punctuation are filtered out of every expectation: they are what everything else is
 * made of, so asserting them would make the test a transcript of the tokenizer rather than a
 * statement about what a reader sees coloured.
 */

const coloured = (language: string, source: string): string[][] =>
    highlightLines(language, source).map(line =>
        line
            .filter((token: ICodeToken) => token.kind !== 'plain' && token.kind !== 'punctuation')
            .map(token => `${token.kind}:${token.text}`),
    );

t.test('bash tells its parts apart', async t => {
    t.same(coloured('bash', 'git commit -m "add a thing" # done'), [
        ['builtin:git', 'keyword: -m', 'string:"add a thing"', 'comment:# done'],
    ]);
});

t.test('typescript knows its keywords, strings, numbers and comments', async t => {
    t.same(coloured('ts', ['const name = "x";', '// say it', 'return 42;'].join('\n')), [
        ['keyword:const', 'string:"x"'],
        ['comment:// say it'],
        ['keyword:return', 'number:42'],
    ]);
});

t.test('javascript is its own grammar, not typescript with a different name', async t => {
    // The scanner this replaced read `js` as `ts`, which coloured a keyword the language does not
    // have: the two are separate grammars now, and the fence name decides which one runs.
    t.equal(normaliseLanguage('js'), 'js', 'js is js');
    t.equal(normaliseLanguage('mjs'), 'js', 'and so is an ES module');
    t.equal(normaliseLanguage('tsx'), 'ts', 'while tsx is ts');
});

t.test('a block comment spans lines as one comment', async t => {
    const lines = coloured('css', ['/* one', '   two */ a { color: #fff; }'].join('\n'));
    t.same(lines[0], ['comment:/* one'], 'the comment opens');
    t.same(lines[1]?.[0], 'comment:   two */', 'and closes on the next line, indent and all');
    t.ok(lines[1]?.includes('variable:color'), 'the declaration after it is still read');
    t.ok(lines[1]?.includes('number:#fff'), 'and so is a colour literal');
});

t.test('json tells a key from a value', async t => {
    t.same(coloured('json', '{"count": 2, "ok": true}'), [
        ['attribute:"count"', 'number:2', 'attribute:"ok"', 'keyword:true'],
    ]);
});

t.test('html tells a tag from its attributes', async t => {
    t.same(coloured('html', '<a href="/x" rel="nofollow">x</a>'), [
        ['tag:a', 'type:href', 'string:"/x"', 'type:rel', 'string:"nofollow"', 'tag:a'],
    ]);
});

t.test('the languages a session writes are all coloured', async t => {
    // Each of these was a flat grey fence before: the page carried five languages and a session
    // writes a dozen.
    t.same(coloured('yaml', 'name: value # note'), [['variable:name', 'comment:# note']]);
    t.same(coloured('py', 'def f(x):'), [['keyword:def', 'builtin:f']]);
    t.same(coloured('diff', ['+ added', '- removed'].join('\n')), [
        ['insert:+ added'],
        ['deleted:- removed'],
    ]);
    t.same(
        coloured('sql', 'select * from users'),
        [['keyword:select', 'keyword:from']],
        'and a query reads like a query',
    );
});

t.test('a fence is text, never markup', async t => {
    // The renderer builds spans from these tokens rather than setting innerHTML, so a fence that
    // contains a tag carries the tag as its text — which is the whole reason the tokens stay data.
    const [line] = highlightLines('ts', 'const html = "<script>alert(1)</script>";');
    t.equal(
        line?.find(token => token.kind === 'string')?.text,
        '"<script>alert(1)</script>"',
        'the tag is the string it was written as',
    );
    t.notOk(
        line?.some(token => token.kind === 'tag'),
        'and nothing in the line was read as markup',
    );
});

t.test('an unknown language is one plain run per line', async t => {
    t.same(
        coloured('bislama', ['toktok', '', 'tumas'].join('\n')),
        [[], [], []],
        'nothing is coloured',
    );
    t.equal(
        highlightLines('bislama', 'toktok')[0]?.[0]?.text,
        'toktok',
        'and the text is still there',
    );
});

t.test('an unnamed fence and an empty one still render', async t => {
    // The label is what the block shows in its corner, and the text is what it draws: a fence with
    // no language is text, not nothing.
    t.same(highlightLines('', 'toktok'), [[{kind: 'plain', text: 'toktok'}]], 'text, in one run');
    t.same(highlightLines('ts', ''), [[]], 'and an empty fence is one empty line');
});

t.test('a language names itself the way a reader writes it', async t => {
    t.equal(normaliseLanguage('sh'), 'bash', 'sh is bash');
    t.equal(normaliseLanguage('yml'), 'yaml', 'yml is yaml');
    t.equal(normaliseLanguage('Dockerfile'), 'docker', 'and a file name is a language');
    t.equal(languageLabel(''), 'text', 'an unnamed fence says text');
    t.equal(languageLabel('Shell'), 'bash', 'and a named one says what it is read as');
    t.equal(languageLabel('markdown'), 'md', 'the label is the grammar, not the spelling');
});
