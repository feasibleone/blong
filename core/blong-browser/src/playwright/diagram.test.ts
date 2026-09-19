import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {diagramArtifactContent, drawsACall, shouldRegenerateDiagrams} from './diagram.js';

/**
 * The artifact writer, tested without a browser.
 *
 * The page capture needs a browser; the file it leaves behind does not, and it is
 * the half a reviewer reads. Testing it here is what lets the markdown half be
 * proven even when no diagram is being drawn yet — a suite that only proved the
 * picture would leave the artifact format checked by nothing at all.
 */
const dirs: string[] = [];

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
    delete process.env['BLONG_REGENERATE_DIAGRAMS'];
});

describe('diagramArtifactContent', () => {
    it('fences one mermaid block per diagram, in order', () => {
        const content = diagramArtifactContent([
            'sequenceDiagram\n  a->>b: hi',
            'graph TD;\n  a-->b',
        ]);
        expect(content).toBe(
            '# Sequence Diagrams\n\n```mermaid\nsequenceDiagram\n  a->>b: hi\n```\n\n```mermaid\ngraph TD;\n  a-->b\n```\n',
        );
    });

    it('ends with a newline and does not double one when the diagram already has it', () => {
        expect(diagramArtifactContent(['graph TD;\n'])).toBe(
            '# Sequence Diagrams\n\n```mermaid\ngraph TD;\n```\n',
        );
    });

    it('renders an empty set as an empty body rather than a stray fence', () => {
        expect(diagramArtifactContent([])).toBe('# Sequence Diagrams\n\n\n');
    });
});

describe('shouldRegenerateDiagrams', () => {
    it('is off unless the flag says otherwise', () => {
        expect(shouldRegenerateDiagrams()).toBe(false);
        process.env['BLONG_REGENERATE_DIAGRAMS'] = '1';
        expect(shouldRegenerateDiagrams()).toBe(true);
    });

    it('is not fooled by any other value', () => {
        process.env['BLONG_REGENERATE_DIAGRAMS'] = 'true';
        expect(shouldRegenerateDiagrams()).toBe(false);
    });
});

describe('drawsACall', () => {
    it('accepts an answered call and an unanswered one alike', () => {
        expect(drawsACall('sequenceDiagram\n    gateway->>blong: gateway.blong.flow.find')).toBe(
            true,
        );
        expect(
            drawsACall(
                'sequenceDiagram\n    gateway--xblong: gateway.blong.flow.find (no receipt)',
            ),
        ).toBe(true);
    });

    it('rejects a diagram with no arrow, which is a participant list and not a flow', () => {
        expect(drawsACall('sequenceDiagram\n    autonumber\n    participant blong')).toBe(false);
        expect(drawsACall('')).toBe(false);
    });
});

describe('the artifact a capture leaves behind', () => {
    it('round-trips through a file a reviewer can read', () => {
        const dir = join(tmpdir(), `blong-diagram-${Date.now()}`);
        dirs.push(dir);
        mkdirSync(dir, {recursive: true});
        const path = join(dir, 'observedFlows.md');
        const content = diagramArtifactContent(['sequenceDiagram\n  alice->>bob: ping']);
        writeFileSync(path, content);
        expect(readFileSync(path, 'utf8')).toBe(content);
        expect(content.split('```mermaid').length - 1).toBe(1);
    });
});
