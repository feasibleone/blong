import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong/types';
import {Octokit} from '@octokit/rest';

export interface IConfig {
    github: {
        auth?: string;
        baseUrl?: string;
        userAgent?: string;
    };
    context?: {
        octokit?: Octokit;
    };
}

const errorMap: IErrorMap = {
    'github.generic': 'GitHub Error',
    'github.invalid': 'Invalid GitHub Operation',
    'github.notFound': 'GitHub Resource Not Found',
    'github.exists': 'GitHub Resource Already Exists',
    'github.unauthorized': 'GitHub Unauthorized',
    'github.forbidden': 'GitHub Forbidden',
    'github.missingParameter': 'Missing required parameter: {parameter}',
    'github.validationFailed': 'GitHub Validation Failed: {message}',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        activation: {
            default: {
                type: 'github',
                github: {},
            },
        },
        start() {
            this.config.context = {
                octokit: new Octokit({
                    auth: this.config.github.auth,
                    baseUrl: this.config.github.baseUrl,
                    userAgent: this.config.github.userAgent || 'blong-gogo-github-adapter',
                }),
            };
            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            this.config.context = {};
            return await super.stop(...params);
        },
        async exec(
            params: {
                owner?: string;
                repo?: string;
                releaseId?: number;
                tag?: string;
                tagName?: string;
                targetCommitish?: string;
                name?: string;
                body?: string;
                draft?: boolean;
                prerelease?: boolean;
                generateReleaseNotes?: boolean;
                page?: number;
                perPage?: number;
            } & Record<string, unknown>,
            {method}: IMeta,
        ) {
            const [, , operation] = method.split('.');
            const {octokit} = this.config.context;

            switch (operation) {
                case 'get':
                case 'fetch': {
                    // Get a release by ID or tag
                    const {owner, repo, releaseId, tag} = params;

                    if (!owner) throw _errors['github.missingParameter']({parameter: 'owner'});
                    if (!repo) throw _errors['github.missingParameter']({parameter: 'repo'});

                    try {
                        if (releaseId) {
                            // Get release by ID
                            const response = await octokit!.repos.getRelease({
                                owner,
                                repo,
                                release_id: releaseId,
                            });
                            return response.data;
                        } else if (tag) {
                            // Get release by tag
                            const response = await octokit!.repos.getReleaseByTag({
                                owner,
                                repo,
                                tag,
                            });
                            return response.data;
                        } else {
                            // Get latest release
                            const response = await octokit!.repos.getLatestRelease({
                                owner,
                                repo,
                            });
                            return response.data;
                        }
                    } catch (error: any) {
                        if (error.status === 404) {
                            throw _errors['github.notFound'](error);
                        } else if (error.status === 401) {
                            throw _errors['github.unauthorized'](error);
                        } else if (error.status === 403) {
                            throw _errors['github.forbidden'](error);
                        }
                        throw _errors['github.generic'](error);
                    }
                }
                case 'list': {
                    // List releases for a repository
                    const {owner, repo, page = 1, perPage = 30} = params;

                    if (!owner) throw _errors['github.missingParameter']({parameter: 'owner'});
                    if (!repo) throw _errors['github.missingParameter']({parameter: 'repo'});

                    try {
                        const response = await octokit!.repos.listReleases({
                            owner,
                            repo,
                            page,
                            per_page: perPage,
                        });
                        return response.data;
                    } catch (error: any) {
                        if (error.status === 404) {
                            throw _errors['github.notFound'](error);
                        } else if (error.status === 401) {
                            throw _errors['github.unauthorized'](error);
                        } else if (error.status === 403) {
                            throw _errors['github.forbidden'](error);
                        }
                        throw _errors['github.generic'](error);
                    }
                }
                case 'create':
                case 'add': {
                    // Create a new release
                    const {
                        owner,
                        repo,
                        tagName,
                        targetCommitish,
                        name,
                        body,
                        draft = false,
                        prerelease = false,
                        generateReleaseNotes = false,
                    } = params;

                    if (!owner) throw _errors['github.missingParameter']({parameter: 'owner'});
                    if (!repo) throw _errors['github.missingParameter']({parameter: 'repo'});
                    if (!tagName) throw _errors['github.missingParameter']({parameter: 'tagName'});

                    try {
                        const response = await octokit!.repos.createRelease({
                            owner,
                            repo,
                            tag_name: tagName,
                            target_commitish: targetCommitish,
                            name,
                            body,
                            draft,
                            prerelease,
                            generate_release_notes: generateReleaseNotes,
                        });
                        return response.data;
                    } catch (error: any) {
                        if (error.status === 404) {
                            throw _errors['github.notFound'](error);
                        } else if (error.status === 401) {
                            throw _errors['github.unauthorized'](error);
                        } else if (error.status === 403) {
                            throw _errors['github.forbidden'](error);
                        } else if (error.status === 422) {
                            throw _errors['github.validationFailed']({
                                message: error.message || 'Validation failed',
                            });
                        }
                        throw _errors['github.generic'](error);
                    }
                }
                case 'update':
                case 'edit': {
                    // Update an existing release
                    const {
                        owner,
                        repo,
                        releaseId,
                        tagName,
                        targetCommitish,
                        name,
                        body,
                        draft,
                        prerelease,
                    } = params;

                    if (!owner) throw _errors['github.missingParameter']({parameter: 'owner'});
                    if (!repo) throw _errors['github.missingParameter']({parameter: 'repo'});
                    if (!releaseId)
                        throw _errors['github.missingParameter']({parameter: 'releaseId'});

                    try {
                        const response = await octokit!.repos.updateRelease({
                            owner,
                            repo,
                            release_id: releaseId,
                            tag_name: tagName,
                            target_commitish: targetCommitish,
                            name,
                            body,
                            draft,
                            prerelease,
                        });
                        return response.data;
                    } catch (error: any) {
                        if (error.status === 404) {
                            throw _errors['github.notFound'](error);
                        } else if (error.status === 401) {
                            throw _errors['github.unauthorized'](error);
                        } else if (error.status === 403) {
                            throw _errors['github.forbidden'](error);
                        }
                        throw _errors['github.generic'](error);
                    }
                }
                case 'delete':
                case 'remove': {
                    // Delete a release
                    const {owner, repo, releaseId} = params;

                    if (!owner) throw _errors['github.missingParameter']({parameter: 'owner'});
                    if (!repo) throw _errors['github.missingParameter']({parameter: 'repo'});
                    if (!releaseId)
                        throw _errors['github.missingParameter']({parameter: 'releaseId'});

                    try {
                        await octokit!.repos.deleteRelease({
                            owner,
                            repo,
                            release_id: releaseId,
                        });
                        return {success: true};
                    } catch (error: any) {
                        if (error.status === 404) {
                            throw _errors['github.notFound'](error);
                        } else if (error.status === 401) {
                            throw _errors['github.unauthorized'](error);
                        } else if (error.status === 403) {
                            throw _errors['github.forbidden'](error);
                        }
                        throw _errors['github.generic'](error);
                    }
                }
                default:
                    throw _errors['github.invalid']({operation});
            }
        },
    };
});
