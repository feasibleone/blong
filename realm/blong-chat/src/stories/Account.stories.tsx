/**
 * Chat / accounts — the model pages over `meta/model/chatAccountModel.ts` and
 * `meta/model/chatWorkspaceModel.ts`.
 *
 * The fixture rows are placeholders (`meta/fixture/chatFixture.ts`); no token here belongs to anybody.
 * The configuration-token pair is on the workspace, not on the account (`@@D-797`).
 * `page(method, params)` is the model helper: `.open` takes the record key, `.new` takes nothing.
 */
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Chat/Accounts', parameters: {layout: 'fullscreen'}};
export default meta;

export const WorkspaceBrowse = page('chat.workspace.browse');
export const WorkspaceNew = page('chat.workspace.new');
export const WorkspaceOpen = page('chat.workspace.open', {workspaceId: 'w1'});

export const AccountBrowse = page('chat.account.browse');
export const AccountNew = page('chat.account.new');
export const AccountOpen = page('chat.account.open', {accountId: 'a1'});
