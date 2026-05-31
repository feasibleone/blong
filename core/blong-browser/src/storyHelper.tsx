/**
 * Generic Storybook story factory helpers for blong model pages.
 *
 * These helpers are domain-agnostic — any realm that uses the blong model
 * system can import them to create stories with minimal boilerplate.
 *
 * Usage in a realm's story file:
 *
 *   import {page, portal} from '@feasibleone/blong-browser/storyHelper.js';
 *
 *   export const CoralBrowse = page('marine.coral.browse');
 *   export const CoralOpen   = page('marine.coral.open', 1);
 *   export const CoralNew    = page('marine.coral.new');
 *   export const CoralNewHard = page('marine.coral.new', {value: {coral: {coralType: 'hard'}}});
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
import React from 'react';

/**
 * Create a Storybook story that renders a model page.
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
    const object = componentName.split('.')[1]; // e.g. 'coral', 'family', 'species'

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

/**
 * Create a Storybook story that renders the full portal shell.
 *
 * Useful for full end-to-end portal stories that exercise navigation,
 * tabs, and multiple realm pages together.
 */
export function portal(): StoryObj {
    return {
        render: () => {
            useAppStore.getState().setToken('storybook');
            return <Portal />;
        },
    };
}
