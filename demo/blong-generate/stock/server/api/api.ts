import {api} from '@feasibleone/blong';

/**
 * The stock API: one document, one namespace, one group folder.
 *
 * `url` names one file of the folder; the folder is what gets read, so `stock.api.yaml` and
 * `stock.operations.yaml` are merged in name order — the published document first, the wiring over
 * it.
 */
export default api(() => ({
    url: new URL('../../apis/stock.api.yaml', import.meta.url).href,
}));
