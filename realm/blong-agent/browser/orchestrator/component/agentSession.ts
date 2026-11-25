import {handler} from '@feasibleone/blong';

/**
 * `agent.session` — the session page (`@@T-796`).
 *
 * The `component` group of the browser orchestrator prefixes the name, so the menu entry naming
 * `agent.session` resolves to this handler. `permission` is the capability the page's own call is
 * granted by (`agent.session.find`): a person who may not read sessions sees no entry and no tab,
 * instead of a page that opens and then fails.
 *
 * `component` is a dynamic import so the page — and everything it pulls in, markdown, mermaid and
 * the highlighter — is a chunk of its own (`@@D-991`). The portal bundle is what every page pays
 * for; this one's weight is paid for by the person who opens it.
 */
export default handler(() => ({
    async 'agent.session'() {
        return {
            title: 'Agent sessions',
            permission: 'agent.session.find',
            icon: 'pi pi-comments',
            component: async () => {
                const {AgentSessionPage} = await import('../../../src/pages/agentSessionPage.js');
                return AgentSessionPage;
            },
        };
    },
}));
