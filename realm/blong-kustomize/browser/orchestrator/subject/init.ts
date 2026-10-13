import {handler} from '@feasibleone/blong';

/**
 * Browser-side subject namespace for `kustomize` — the folder name `subject` stays literal, and
 * `login` is listed because the portal answers that method itself (@@F-371).
 */
export default handler(() => ({
    namespace: ['kustomize', 'login'],
}));
