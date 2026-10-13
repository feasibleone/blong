import * as assert from 'assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * The memory cross-reference spike, checked headlessly.
 *
 * The extension resolves `@@` tokens against a derived index, so the fixture under
 * `plans/memory-prose/spike/` is opened and the *provider commands* are asked what
 * they answer — the same path a hover takes. The index is pinned with
 * `BLONG_MEMORY_INDEX` so the test does not depend on `blong-dev` being on PATH.
 */

const repoRoot = path.resolve(__dirname, '../../../..');
const fixture = path.join(repoRoot, 'plans/memory-prose/spike/sample.ts');

/** The position just inside the first occurrence of `needle` in a document. */
function positionOf(document: vscode.TextDocument, needle: string): vscode.Position {
    const offset = document.getText().indexOf(needle);
    assert.notStrictEqual(offset, -1, `the fixture contains ${needle}`);
    return document.positionAt(offset + 2);
}

suite('Memory references', () => {
    suiteSetup(() => {
        process.env.BLONG_MEMORY_ROOT = repoRoot;
        process.env.BLONG_MEMORY_INDEX = path.join(repoRoot, 'plans/memory-prose/spike/index.json');
    });

    test('a token becomes a link to the memory scheme', async () => {
        const uri = vscode.Uri.file(fixture);
        await vscode.workspace.openTextDocument(uri);
        const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
            'vscode.executeLinkProvider',
            uri,
        );
        const targets = (links ?? []).map(link => link.target?.toString() ?? '');
        assert.ok(
            targets.some(target => target.includes('memory://entry/D-538')),
            `an entry link is offered (${targets.join(', ')})`,
        );
        assert.ok(
            targets.some(target => target.includes('memory://doc/patterns/memory')),
            'a doc link is offered',
        );
        assert.ok(
            targets.some(target => target.includes('memory://skill/blong-realm')),
            'a skill link is offered',
        );
    });

    test('hovering an entry token names the entry', async () => {
        const uri = vscode.Uri.file(fixture);
        const document = await vscode.workspace.openTextDocument(uri);
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            uri,
            positionOf(document, '@@D-538'),
        );
        const text = (hovers ?? [])
            .flatMap(hover =>
                hover.contents.map(content =>
                    typeof content === 'string' ? content : content.value,
                ),
            )
            .join('\n');
        assert.ok(text.includes('D-538'), `the hover names the id (${text})`);
        assert.ok(text.includes('active'), 'and its status');
    });

    test('go to definition lands on the entry in its memory file', async () => {
        const uri = vscode.Uri.file(fixture);
        const document = await vscode.workspace.openTextDocument(uri);
        const definitions = await vscode.commands.executeCommand<
            Array<vscode.Location | vscode.LocationLink>
        >('vscode.executeDefinitionProvider', uri, positionOf(document, '@@D-538'));
        const first = definitions?.[0];
        const location =
            first && 'targetUri' in first
                ? first.targetUri
                : (first as vscode.Location | undefined)?.uri;
        assert.ok(location, 'a definition is offered');
        assert.ok(
            location.toString().endsWith('tools/blong-dev/.github/memory/decision.md'),
            `the definition is the decision file (${location.toString()})`,
        );
    });
});
