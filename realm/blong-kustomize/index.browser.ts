import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for `kustomize`.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        kustomize: blong.type.Object({}),
    }),
    children: [
        async function blong() {
            return import('@feasibleone/blong-realm/browser.ts');
        },
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function kustomize() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Kustomize',
                    },
                },
                // The portal's form is a credential form, and this realm's credential is a
                // Kubernetes service-account token: the cluster verifies it with a TokenReview and
                // its RBAC decides what the identity may reconcile (D-376). The name is pre-filled
                // because the form requires one, not because it is used — the review answers it —
                // and the hint beside the field is where someone finds out what to paste.
                login: {
                    username: 'blong-suite',
                    tokenHint: {
                        text: 'The password is a Kubernetes service-account token. The cluster verifies it and its RBAC decides what that identity may reconcile. A cluster administrator can mint a short-lived one with the command below, or read the token of a service-account-token Secret for one that does not expire.',
                        command: 'kubectl create token <service-account> -n <namespace>',
                    },
                },
            },
            blong: {},
            kustomize: {},
        },
    },
}));
