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
            $meta: IMeta,
        ) {
            const {method} = $meta;
            const [, , operation] = method!.split('.');
            const {octokit} = this.config.context;

            const mapGithubError = (error: unknown): ReturnType<(typeof _errors)[keyof typeof _errors]> => {
                const e = error as {status?: number; message?: string};
                if (e.status === 404) return _errors['github.notFound'](error);
                if (e.status === 401) return _errors['github.unauthorized'](error);
                if (e.status === 403) return _errors['github.forbidden'](error);
                if (e.status === 422) {
                    const vErr = _errors['github.validationFailed'](
                        {params: {message: e.message || 'Validation failed'}},
                    );
                    if (error instanceof Error) vErr.cause = error;
                    return vErr;
                }
                return _errors['github.generic'](error);
            };

            switch (operation) {
                case 'get':
                case 'fetch': {
                    // Get a release by ID or tag
                    const {owner, repo, releaseId, tag} = params;

                    if (!owner) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'owner'}), $meta);
                    }
                    if (!repo) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'repo'}), $meta);
                    }

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
                    } catch (error: unknown) {
                        throw this.error(mapGithubError(error), $meta);
                    }
                }
                case 'list': {
                    // List releases for a repository
                    const {owner, repo, page = 1, perPage = 30} = params;

                    if (!owner) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'owner'}), $meta);
                    }
                    if (!repo) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'repo'}), $meta);
                    }

                    try {
                        const response = await octokit!.repos.listReleases({
                            owner,
                            repo,
                            page,
                            per_page: perPage,
                        });
                        return response.data;
                    } catch (error: unknown) {
                        throw this.error(mapGithubError(error), $meta);
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

                    if (!owner) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'owner'}), $meta);
                    }
                    if (!repo) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'repo'}), $meta);
                    }
                    if (!tagName) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'tagName'}), $meta);
                    }

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
                    } catch (error: unknown) {
                        throw this.error(mapGithubError(error), $meta);
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

                    if (!owner) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'owner'}), $meta);
                    }
                    if (!repo) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'repo'}), $meta);
                    }
                    if (!releaseId) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'releaseId'}), $meta);
                    }

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
                    } catch (error: unknown) {
                        throw this.error(mapGithubError(error), $meta);
                    }
                }
                case 'delete':
                case 'remove': {
                    // Delete a release
                    const {owner, repo, releaseId} = params;

                    if (!owner) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'owner'}), $meta);
                    }
                    if (!repo) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'repo'}), $meta);
                    }
                    if (!releaseId) {
                        throw this.error(_errors['github.missingParameter']({parameter: 'releaseId'}), $meta);
                    }

                    try {
                        await octokit!.repos.deleteRelease({
                            owner,
                            repo,
                            release_id: releaseId,
                        });
                        return {success: true};
                    } catch (error: unknown) {
                        throw this.error(mapGithubError(error), $meta);
                    }
                }
                default: {
                    throw this.error(_errors['github.invalid']({operation}), $meta);
                }
            }
        },
    };
});
