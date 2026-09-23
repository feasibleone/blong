/**
 * Unit tests for the page discovery behind `blong-dev docs verify`.
 *
 * Both helpers get their answer wrong in a way that would make the verification run quietly useless
 * rather than loudly broken: a block count that misses a diagram lets a page pass with a broken one,
 * a route that does not match what Docusaurus serves turns every page into a 404 — reported as a
 * failure of the documentation rather than of this arithmetic — and an image count that misses a
 * picture drops the page from the run entirely.
 */

import t from 'tap';

import {countImages, countMermaidBlocks, routeForDocsFile} from './visualPages.ts';

t.test('countMermaidBlocks counts only mermaid fences', t => {
    t.equal(countMermaidBlocks(''), 0, 'nothing in, nothing counted');
    t.equal(countMermaidBlocks('plain prose\n'), 0, 'prose has no diagrams');
    t.equal(
        countMermaidBlocks('```mermaid\nflowchart LR\n    a --> b\n```\n'),
        1,
        'one fence is one diagram',
    );
    t.equal(
        countMermaidBlocks(
            '```mermaid\nflowchart LR\n    a --> b\n```\n\ntext\n\n```mermaid\nflowchart TD\n    c --> d\n```\n',
        ),
        2,
        'two fences are two diagrams',
    );
    t.equal(
        countMermaidBlocks('```text\nnot a diagram\n```\n'),
        0,
        'another language is not a mermaid diagram',
    );
    t.equal(
        countMermaidBlocks('```typescript\nconst s = "```mermaid";\n```\n'),
        0,
        'a mermaid fence quoted inside another block is not a block',
    );
    t.end();
});

t.test('countMermaidBlocks requires the fence to open the line', t => {
    t.equal(
        countMermaidBlocks('    ```mermaid\n    flowchart LR\n    ```\n'),
        0,
        'an indented fence is inside a list item, not a diagram at the top level',
    );
    t.end();
});

t.test('countImages counts image references', t => {
    t.equal(countImages('no pictures here\n'), 0, 'prose has no images');
    t.equal(countImages('![alt](./img/a.png)\n'), 1, 'one reference is one image');
    t.equal(
        countImages('![a](./img/a.png)\n\ntext\n\n![b](./img/b.png)\n'),
        2,
        'two references are two images',
    );
    t.equal(
        countImages('[a link](./page.md) is not an image\n'),
        0,
        'a plain link is not an image',
    );
    t.end();
});

t.test('routeForDocsFile mirrors how Docusaurus maps files to routes', t => {
    t.equal(routeForDocsFile('concepts/rbac.md'), 'concepts/rbac', 'a page is its path');
    t.equal(routeForDocsFile('intro.md'), 'intro', 'a top-level page is its name');
    t.equal(
        routeForDocsFile('patterns/index.md'),
        'patterns',
        'index.md is the directory itself, not a child called index',
    );
    t.equal(routeForDocsFile('index.md'), '', 'the docs root is the empty route');
    t.end();
});
