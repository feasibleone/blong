import {handlerGroup} from '@feasibleone/blong';

import type {AccountLib} from './account.ts';
import type {AccessModelLib} from './accessModel.ts';
import type {GoogleLib} from './google.ts';
import type {OidcLib} from './oidc.ts';
import type {PasswordLib} from './password.ts';

/**
 * The libraries the `adapter/db` group injects, as one type.
 *
 * Every bundle the group holds is listed here once — adding a library means one
 * line, not an annotation in fifty handlers.
 */
export type AccessDbLib = AccessModelLib & AccountLib & OidcLib & PasswordLib & GoogleLib;

/**
 * `handler` for the `adapter/db` group — the framework factory with
 * {@link AccessDbLib} typed on `lib`, so each handler destructures the members it
 * uses and gets them typed:
 *
 * ```typescript
 * export default handler(({lib: {binHex}, errors}) => async function …)
 * ```
 *
 * This file sits in the handler-group folder on purpose, and the loader skips it
 * by name: `handlerGroup.ts` is a plain module (it exports the factory its
 * siblings import), so it is neither loaded as a handler nor reported as a plain
 * module in a group.
 */
export const handler = handlerGroup<AccessDbLib>();
