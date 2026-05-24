/**
 * Marine biology story factory helper.
 *
 * Mirrors the `page()` helper from `ut-portal/storybook` but for the
 * blong-browser / ui-demo Storybook setup.
 *
 * Usage:
 *
 *   import {page} from '../../storyHelper.js';
 *
 *   export const CoralBrowse = page('marine.coral.browse');
 *   export const CoralOpen   = page('marine.coral.open', 1);
 *   export const CoralNew    = page('marine.coral.new');
 *   export const CoralNewHard = page('marine.coral.new', {coralType: 'hard'});
 *   export const CoralOpenThumb = page('marine.coral.open', 1, {layout: 'editThumbIndex'});
 *
 * Rules:
 *  - `idOrParams` number  → becomes `{<object>Id: idOrParams}`.
 *  - `idOrParams` object  → merged with `extraParams` as component params.
 *  - `extraParams`        → always merged last (highest precedence).
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved via Vite's dev export condition; tsc sees no dist yet
import {Model, Portal, useAppStore} from '@feasibleone/blong-browser';
import type {StoryObj} from '@storybook/react-vite';

/**
 * Create a Storybook story that renders a Marine model page.
 *
 * @param componentName - The model component name, e.g. `'marine.coral.browse'`
 * @param idOrParams    - Record ID (for `.open`) or initial params object
 * @param extraParams   - Additional params merged on top (highest precedence)
 */
export function page(
    componentName: string,
    idOrParams?: number | Record<string, unknown>,
    extraParams?: Record<string, unknown>,
): StoryObj {
    const object = componentName.split('.')[1]; // 'coral', 'family', 'habitat', 'species'

    let params: Record<string, unknown> | undefined;
    if (typeof idOrParams === 'number') {
        params = {[`${object}Id`]: idOrParams, ...extraParams};
    } else if (idOrParams != null || extraParams != null) {
        params = {...idOrParams, ...extraParams};
    }

    return {
        render: () => (
            <Model
                componentName={componentName}
                params={params}
            />
        ),
    };
}

export function portal(): StoryObj {
    return {
        render: () => {
            useAppStore.getState().setToken('storybook');
            return <Portal />;
        },
    };
}
