import {handler} from '@feasibleone/blong';

/**
 * `viewer.log` — the reader's page (`@@D-946`).
 *
 * The `component` group of the browser orchestrator is what prefixes the name,
 * so the menu entry naming `viewer.log` resolves to it. `permission` is the same
 * capability the two methods are granted by (`viewerRead` through
 * `viewer.entry.find`): a person who may not read the records sees no entry and
 * no tab, instead of a page that opens and then fails.
 *
 * The component is the standalone viewer's own (`@@D-946`), rendered against a
 * source supplied here rather than its WebSocket — so a record looks the same in
 * this page as in the tool, and one of them cannot learn to show something the
 * other silently drops.
 */
export default handler(() => ({
    async 'viewer.log'() {
        return {
            title: 'Logs',
            permission: 'viewer.entry.find',
            icon: 'pi pi-list',
            component: async () => {
                const {LogViewerPage} = await import('../../../src/pages/logViewerPage.js');
                return LogViewerPage;
            },
        };
    },
}));
