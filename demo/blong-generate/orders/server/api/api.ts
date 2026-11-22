import {api} from '@feasibleone/blong';

/**
 * The orders API, declared rather than repeated — here the realm's **one** namespace, served by two
 * published documents.
 *
 * `url` names one file; the **folder beside it** is what gets read, and each `<name>.<what>.yaml` in
 * it is a document whose `<name>` part keys it: `contract.api.yaml` and `contract.operations.yaml`
 * are one document, and the second is merged over the first.
 *
 * What the folder cannot say is which namespace either document belongs to — the file names are the
 * publishers' (`contract`, `invoice`), and the realm's namespace is `orders`. That comes from
 * `x-blong.namespace` in the wiring file, which is why both documents land in `orders` and why the
 * handlers are named `ordersContractAdd` and `ordersInvoiceIssue` rather than after the files.
 *
 * Running `blong ./server.ts dev` from the demo root then writes a typed stub into the group folder
 * each operation names — `orchestrator/contract/`, `orchestrator/invoice/`. See `../../README.md`.
 */
export default api(() => ({
    url: new URL('../../apis/contract.api.yaml', import.meta.url).href,
}));
