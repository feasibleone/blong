import {model} from '@feasibleone/blong';

/**
 * meta/model/kustomizeDeploymentModel.ts — the Deployments page.
 *
 * The rows are the cluster's Deployments, read back through
 * `kustomize.deployment.find`, which proxies to the Kubernetes adapter. That is why this
 * spec is smaller than a CRUD model: there is no table, so there is no `add` and no
 * `remove` handler, and there is no detail entity — the realm's state *is* the Kubernetes
 * objects its plan generates and its operator converges, and a second copy of that state
 * in a database is the duplication this realm exists to avoid.
 *
 * The one action that changes anything is Reconcile, and it changes it in the cluster
 * rather than here. It calls `kustomize.reconcile.run` with `apply`, and it confirms
 * first: a page anyone with cluster access can open should not write on a stray click. It
 * never sends `prune`, so nothing is deleted from the UI — removal stays the one thing
 * that takes an explicit, separate word.
 */
export default model(
    () =>
        async function kustomizeDeploymentModel() {
            return {
                subject: 'kustomize',
                object: 'deployment',
                objectTitle: 'Deployment',
                public: true,
                nameField: 'deployment.deploymentName',

                schema: {
                    properties: {
                        deployment: {
                            properties: {
                                // deploymentId and createdAt come from the cluster row
                                // (the object UID and its creation timestamp); the server
                                // schema describes them, so they stay undeclared here.
                                deploymentName: {title: 'Name', filter: true, sort: true},
                                deploymentStatus: {
                                    title: 'Status',
                                    widget: {
                                        options: [
                                            {value: 'ready', label: 'Ready'},
                                            {value: 'pending', label: 'Pending'},
                                        ],
                                    },
                                },
                                createdAt: {title: 'Created'},
                            },
                            widget: {
                                columns: ['deploymentName', 'deploymentStatus', 'createdAt'],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Deployments',
                        widgets: ['deployment'],
                    },
                    edit: {
                        label: 'Deployment Details',
                        className: 'col-12 md:col-8',
                        widgets: [
                            'deployment.deploymentName',
                            'deployment.deploymentStatus',
                            'deployment.createdAt',
                        ],
                    },
                },

                browser: {
                    title: 'Deployments',
                    icon: 'pi pi-cloud',
                    toolbar: [
                        {
                            label: 'Reconcile',
                            icon: 'pi pi-refresh',
                            confirm:
                                'Run a reconcile pass now? Objects the plan wants and the cluster lacks are created, and changed ones are updated. Nothing is deleted.',
                            method: 'kustomize.reconcile.run',
                            // From the CR, which is the declaration a deployment page is about: the
                            // objects this page lists were generated for the suite a CR declares, and
                            // a pass from the registry origin reconciles the install this process *is*
                            // instead — a plan built before its artifact is materialized, which names
                            // no volume identity and waits on a fill Job that never exists (F-502).
                            // The tenant is left to the handler: a suite's own portal is configured
                            // with its namespace, and the operator's portal is answered about whatever
                            // CRs it can see, with the answer naming which one it read (T-328).
                            params: {apply: true, from: 'cr'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
