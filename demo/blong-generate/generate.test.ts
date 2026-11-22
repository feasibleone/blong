/**
 * What the demo is for: published API documents, and the handler stubs the framework writes from
 * them.
 *
 * The test runs the demo's own suite the way `blong ./server.ts dev` does — `load()` with the `dev`
 * intent, which is the only intent that generates — and then reads what the run wrote. It never
 * imports the generator: what it asserts is the behaviour of a real run, which is what a reader of
 * this demo will see.
 *
 * It regenerates rather than only inspecting: a stub is removed and the platform loaded again, and the
 * file that comes back is compared with the one that was removed, so "the documents describe these
 * stubs" is a claim this test keeps true.
 */

import load from '@feasibleone/blong-gogo';
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import tap from 'tap';

import {drift, update} from './generate.tool.ts';
import server from './server.ts';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The handlers the published documents ask for: the orders realm serves two documents (contract and
 * invoice), the stock realm one.
 *
 * Each name is the semantic triple — the namespace, which is the realm, plus the object and predicate
 * the wiring file maps the publisher's operation onto.
 */
const stubs = [
    {file: 'orders/orchestrator/contract/ordersContractAdd.ts', method: 'ordersContractAdd'},
    {file: 'orders/orchestrator/contract/ordersContractGet.ts', method: 'ordersContractGet'},
    {file: 'orders/orchestrator/invoice/ordersInvoiceIssue.ts', method: 'ordersInvoiceIssue'},
    {file: 'orders/orchestrator/invoice/ordersInvoiceGet.ts', method: 'ordersInvoiceGet'},
    {file: 'stock/orchestrator/item/stockItemGet.ts', method: 'stockItemGet'},
    {file: 'stock/orchestrator/item/stockItemAdjust.ts', method: 'stockItemAdjust'},
    {file: 'stock/orchestrator/item/stockItemReserve.ts', method: 'stockItemReserve'},
];

/** One dev load of the demo suite, started and stopped. */
async function loadDemo(): Promise<void> {
    const platform = await load(server, 'blong-generate', 'blong-generate', [
        'microservice',
        'integration',
        'dev',
    ]);
    await platform.start!({});
    await platform.stop!();
}

tap.test('a dev run leaves a stub for every published operation', async t => {
    await loadDemo();

    for (const {file, method} of stubs) {
        const source = readFileSync(join(here, file), 'utf-8');
        t.match(source, new RegExp(`async function ${method}\\(`), `${method} is where it belongs`);
        t.match(source, /generated stub: .* has no body yet/, 'and says it is a stub');
    }

    t.match(
        readFileSync(join(here, 'orders/orchestrator/invoice/ordersInvoiceIssue.ts'), 'utf-8'),
        /contractId: string; \/\/ The signed contract/,
        'the published document supplies the members of the body',
    );
    t.match(
        readFileSync(join(here, 'orders/orchestrator/contract/ordersContractGet.ts'), 'utf-8'),
        /expand\?: string;/,
        'and its query parameters, optional ones included',
    );
    t.match(
        readFileSync(join(here, 'stock/orchestrator/item/stockItemAdjust.ts'), 'utf-8'),
        /delta: number; \/\/ Positive receives stock/,
        'the second realm reads its own document the same way',
    );
    t.end();
});

tap.test('the wiring file decides the namespace, the object and what is required', async t => {
    // Three things only `*.operations.yaml` can say, and each of them is visible in the stub.
    const invoice = readFileSync(
        join(here, 'orders/orchestrator/invoice/ordersInvoiceIssue.ts'),
        'utf-8',
    );
    t.match(invoice, /async function ordersInvoiceIssue/, 'x-blong.namespace made it `orders`');
    t.match(
        invoice,
        /amountMinor: number;/,
        'x-blong-method named the object, and the required list',
    );
    t.notMatch(invoice, /amountMinor\?:/, 'the published body left it optional');

    const contract = readFileSync(
        join(here, 'orders/orchestrator/contract/ordersContractAdd.ts'),
        'utf-8',
    );
    t.match(contract, /customerName: string;/, 'a member the published document requires');
    t.notMatch(contract, /createContract/, 'and never the upstream operation id');
    t.end();
});

tap.test('a stub taken over by hand is neither drift nor overwritten', async t => {
    // What a save in an editor does: the unused import goes, and with it the file's status as generated.
    // The check has to agree, or it would report every written handler as stale for ever (`@@D-965`).
    const file = join(here, 'orders/orchestrator/invoice/ordersInvoiceIssue.ts');
    const committed = readFileSync(file, 'utf-8');
    const mine = committed.replace('import unchanged', '// my own handler');

    writeFileSync(file, mine, 'utf-8');
    try {
        t.same(
            (await drift()).map(({file: moved}) => moved),
            [],
            'not reported as drift',
        );
        const {kept} = await update();
        t.ok(
            kept.includes('orders/orchestrator/invoice/ordersInvoiceIssue.ts'),
            'and update keeps it rather than writing over it',
        );
        t.equal(readFileSync(file, 'utf-8'), mine, 'the file is untouched');
    } finally {
        writeFileSync(file, committed, 'utf-8');
    }
    t.end();
});

tap.test('every committed stub is exactly what a fresh generation writes', async t => {
    // The whole set, not one sample: a document that grew a field leaves its stub behind, and this is
    // what notices. It generates in a throwaway copy (see `generate.tool.ts`), because the generator
    // never rewrites a file that exists — which is the property that makes the check necessary.
    const moved = await drift();

    t.same(
        moved.map(({file}) => file),
        [],
        'run `npm run generate:update` after changing a document',
    );
    if (moved.length) {
        for (const {file, generated, committed} of moved) {
            t.comment(
                `${file}: ${committed === undefined ? 'missing from the repository' : 'differs from the documents'}`,
            );
            t.comment(generated.split(String.fromCharCode(10)).slice(0, 6).join(' | '));
        }
    }
    t.end();
});

tap.test(
    'a stub is rewritten while its marker is there, and left alone once it is gone',
    async t => {
        // The rule that makes the loop safe to leave running, in both directions: the marker is the file's
        // state, and deleting it is what hands the file to the developer (`@@D-965`).
        const file = join(here, 'orders/orchestrator/invoice/ordersInvoiceGet.ts');
        const committed = readFileSync(file, 'utf-8');
        const marker = committed.split('\n').find(line => line.includes('import unchanged')) ?? '';
        t.match(marker, /^import unchanged from/, 'the committed stub carries the marker');

        try {
            // Tampered with, but still a stub: a run brings it back to what the document says.
            writeFileSync(
                file,
                committed.replace('paidAt: string,', 'paidAtLabel: string,'),
                'utf-8',
            );
            await loadDemo();
            t.equal(readFileSync(file, 'utf-8'), committed, 'a stub follows the document');

            // Written in: the marker is gone, so the file is the developer's from then on.
            const mine = committed.replace(marker, '// mine: the body I am writing');
            writeFileSync(file, mine, 'utf-8');
            await loadDemo();
            t.equal(
                readFileSync(file, 'utf-8'),
                mine,
                'and a file without the marker is not touched',
            );
        } finally {
            writeFileSync(file, committed, 'utf-8');
        }
        t.end();
    },
);

tap.test('each realm holds exactly its own handlers', async t => {
    // The other half of the rule: a document is placed *and* nowhere else. `readdirSync` rather than
    // the file list above, because "nothing extra appeared" is the claim.
    const folders = [
        {dir: 'orders/orchestrator/contract', expected: ['ordersContractAdd', 'ordersContractGet']},
        {dir: 'orders/orchestrator/invoice', expected: ['ordersInvoiceGet', 'ordersInvoiceIssue']},
        {
            dir: 'stock/orchestrator/item',
            expected: ['stockItemAdjust', 'stockItemGet', 'stockItemReserve'],
        },
    ];
    for (const {dir, expected} of folders) {
        t.same(
            readdirSync(join(here, dir))
                .filter(name => name.endsWith('.ts'))
                .sort(),
            expected.map(method => `${method}.ts`),
            `${dir} holds the handlers of its own document, and no others`,
        );
    }
    t.end();
});
