import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    config: {
        default: {
            // The realm registers applications and bundles, which are `core` resources and `access`
            // roles, capabilities and credentials — reached through `super.` helpers, which exist only
            // in a process that carries the realm itself (@@D-871).
            k8s: {k8sNeeds: ['core', 'access']},
        },
    },
}));
