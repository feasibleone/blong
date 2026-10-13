import {layer} from '@feasibleone/blong';

/**
 * orchestrator/layer.server.ts — the `kustomize` orchestrator layer, loaded wherever the realm is;
 * declared `default: true` because the well-known default covers only `microservice`/`k8s`/`upgrade`.
 */
export default layer({
    default: true,
});
