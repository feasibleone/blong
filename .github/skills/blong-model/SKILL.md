---
name: blong-model
description: >
    Use the blong-browser model system to implement CRUD pages in a blong realm or suite. The model
    system generates Browse/New/Open/Report pages automatically from IModelSpec declarations. Use
    this skill whenever a realm needs to contribute UI pages for domain entities — even if the user
    just says "add list and edit pages for this entity" or "wire up the UI for this API". For
    developing or improving the model system internals, use blong-model-dev instead.
---

# blong-model Skill

## What this skill covers

The model system is the primary and most efficient way to add browser UI pages for a domain entity
in a blong suite. This skill covers **using** the model system: how to declare `IModelSpec` objects,
wire them into a realm's component handler, write mock data for Storybook, and configure dropdown
references.

For concept and architecture see:

- [blong-browser Model concept](../../docs/blong/docs/concepts/blong-model.md)
- [blong-browser Model Pattern](../../docs/blong/docs/patterns/blong-model.md)

For developing the model system internals, use the **blong-model-dev** skill.

---

## Quick Summary

Add a model folder with model definitions to a realm. Models are discovered automatically by the
portal orchestrator and mock adapter via the `.model` file suffix convention:

```
realm/
  meta/
    model/
      subjectObjectModel.ts  <-- IModelSpec for the "object" entity
    fixture/
      subjectFixture.ts      <-- fixture data handler for Storybook/tests
```

> **Note:** The `meta/` folder name is a convention used in `blong-marine`. You can use any folder
> name — what matters is that model files end with `Model.ts` and are exported from a handler named
> `{subject}{Object}Model`. The `.model` suffix on the blong `model()` handler kind is what the
> portal orchestrator and mock adapter match on.

---

## Step 1 — Define a ModelSpec

Model specs use the `model()` factory from `@feasibleone/blong`. The factory wraps an async handler
function named `{subject}{Object}Model` that returns the spec. The `.model` kind is used by the
portal orchestrator and mock adapter to auto-discover the spec.

```typescript
// marine/meta/model/marineCoralModel.ts
import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function marineCoralModel() {
            return {
                subject: 'marine',
                object: 'coral',

                schema: {
                    properties: {
                        coral: {
                            properties: {
                                coralId: {},
                                coralName: {title: 'Name', filter: true, sort: true},
                                familyId: {widget: {type: 'dropdown', dropdown: 'marine.family'}},
                                maxDepth: {title: 'Max Depth (m)'},
                                description: {widget: {type: 'textArea'}},
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Coral',
                        widgets: ['coral'],
                    },
                    main: {
                        label: 'Coral Details',
                        className: 'col-12 md:col-8',
                        widgets: [
                            'coral.coralName',
                            'coral.familyId',
                            'coral.maxDepth',
                            'coral.description',
                        ],
                    },
                },

                layouts: {
                    edit: ['main'],
                },

                browser: {
                    title: 'Coral List',
                    icon: 'pi pi-star',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/marine.coral.new',
                            permission: 'marine.coral.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/marine.coral.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete selected coral?',
                            method: 'marine.coral.remove',
                            params: {coralId: '${coralId}'},
                        },
                    ],
                },
            };
        },
);
```

Minimal valid spec — only `subject` and `object` are required; everything else falls back to
defaults based on the naming convention.

---

## Step 2 — Menu Wiring

Add a `.portal` file to register menu items:

```typescript
// marine/component/marine.portal.ts
import {handler} from '@feasibleone/blong';

export default handler(({handler: {portalMenuItem}}) => ({
    async 'marine.portal.params'() {
        return {
            menu: [
                {
                    title: 'Marine',
                    items: [
                        await portalMenuItem('marine.coral.browse'),
                        await portalMenuItem('marine.family.browse'),
                    ],
                },
            ],
        };
    },
}));
```

---

## Step 3 — Fixture Data for Storybook / Tests

The mock adapter (`adapter/mock.ts`) in blong-browser automatically generates all CRUD mock handlers
from `.model` and `.fixture` handlers. All you need is a fixture handler that returns sample data
keyed by `'{subject}.{object}'`:

```typescript
// marine/meta/fixture/marineFixture.ts
import {fixture} from '@feasibleone/blong';

export default fixture(
    () =>
        async function marineFixture() {
            // Return an object keyed by '{subject}.{object}' with arrays of items
            return {
                'marine.coral': [
                    {coralId: 1, coralName: 'Brain Coral', familyId: 1, maxDepth: 40},
                    {coralId: 2, coralName: 'Staghorn Coral', familyId: 2, maxDepth: 25},
                ],
                'marine.family': [
                    {familyId: 1, familyName: 'Acroporidae'},
                    {familyId: 2, familyName: 'Faviidae'},
                ],
            };
        },
);
```

For larger datasets, load from YAML:

```typescript
// marine/meta/fixture/marineFixture.ts
import {fixture} from '@feasibleone/blong';
import marineYaml from '../../data/marine.yaml?raw';

export default fixture(
    ({lib: {yaml}}) =>
        async function marineFixture() {
            return yaml.parse(marineYaml);
        },
);
```

The mock adapter reads fixture data by calling `blong.handler['{subject}Fixture']({}, {})`. The mock
generates `find`, `get`, `add`, `edit`, `remove`, `report`, `schema`, and `{subject}.dropdown.list`
handlers automatically from the model spec and fixture data.

**No `setupModelMock()` call is needed** — the mock adapter in blong-browser activates automatically
in `storybook` and `integration` environments when the `blongUi.mock` config key is present (set in
`.storybook/preview.tsx` via the `withBlong(browser)` decorator which passes `{blongUi: {mock: {}}}`
as config).

---

## Step 4 — Storybook Stories

Use the `Model` component from `@feasibleone/blong-browser` to render model pages in stories. The
canonical pattern is from `core/ui-demo/src/storyHelper.tsx`:

```typescript
// src/storyHelper.tsx
import React from 'react';
import {Model} from '@feasibleone/blong-browser';
import type {StoryObj} from '@storybook/react-vite';

export function page(
    componentName: string,
    idOrParams?: number | Record<string, unknown>,
    extraParams?: Record<string, unknown>,
): StoryObj {
    const object = componentName.split('.')[1];
    let params: Record<string, unknown> | undefined;
    if (typeof idOrParams === 'number') {
        params = {[`${object}Id`]: idOrParams, ...extraParams};
    } else if (idOrParams != null || extraParams != null) {
        params = {...idOrParams, ...extraParams};
    }
    return {render: () => <Model componentName={componentName} params={params} />};
}
```

Then in story files:

```typescript
// marine/src/pages/coral/Coral.stories.tsx
import type {Meta} from '@storybook/react-vite';
import {page} from '../../storyHelper.js';

const meta: Meta = {title: 'Marine/Coral', parameters: {layout: 'fullscreen'}};
export default meta;

export const CoralBrowse = page('marine.coral.browse');
export const CoralOpen = page('marine.coral.open', 1); // open record #1
export const CoralNew = page('marine.coral.new');
export const CoralReport = page('marine.coral.report');

// Extra params override the default layout:
export const CoralOpenSplit = page('marine.coral.open', 1, {layout: 'editSplit'});
```

The `.storybook/preview.tsx` must use `withBlong(browser)` from
`@feasibleone/blong-browser/storybook.tsx`:

```typescript
// .storybook/preview.tsx
import withBlong from '@feasibleone/blong-browser/storybook.tsx';
import browser from '../browser.ts';

export default {
    decorators: [withBlong(browser)],
    parameters: {layout: 'fullscreen'},
};
```

This loads the full blong platform (including the mock adapter) in the browser, so stories work
without a running server.

---

## Schema Overlay Reference

The `schema.properties.{object}.properties` map enriches server schema fields. Only specify the
fields you want to change — the rest come from the server.

### Field property overrides

| Property   | Type            | Effect                                    |
| ---------- | --------------- | ----------------------------------------- |
| `title`    | string          | Label in form and column header           |
| `filter`   | boolean         | Include in browse filter bar              |
| `sort`     | boolean         | Make column sortable                      |
| `required` | boolean         | Client-side required validation on save   |
| `default`  | any             | Initial value for new entity create forms |
| `widget`   | IWidgetOverride | Widget type and configuration (see below) |

### Common widget configurations

```typescript
// Plain text (default for string fields)
{}

// Multi-line text area
{widget: {type: 'textArea'}}

// Date picker
{widget: {type: 'date'}}

// Integer (no decimals)
{widget: {type: 'integer'}}

// Single-select dropdown from named list
{widget: {type: 'dropdown', dropdown: 'marine.family'}}

// Multi-select dropdown
{widget: {type: 'multiSelect', dropdown: 'marine.habitat'}}

// Fixed options from schema enum (no dropdown fetch needed)
{type: 'string', enum: ['active', 'inactive'],
 widget: {type: 'select'}}

// Editable sub-table (vector-array)
{widget: {type: 'table', widgets: ['itemCode', 'quantity', 'price']}}
```

---

## Dropdown Reference Convention

A dropdown is referenced by a `'subject.name'` key:

- `'marine.family'` — calls `marine.dropdown.list({name: 'marine.family'})` on the backend
- The backend handler returns `IDropdownOption[]` shaped as `[{value: id, label: '...'}]`
- Results are cached for the browser session

The realm providing the dropdown data must implement `{subject}.dropdown.list` in its orchestrator.

---

## Cards Reference

```typescript
cards: {
    main: {
        label:     'Main Details',     // card heading (omit for no heading)
        className: 'col-12 md:col-8',  // PrimeFlex column class
        widgets:   [                   // fields to render, in order
            'entity.fieldName',
            ['entity.from', 'entity.to'], // two fields on same row
        ],
        permission:  'some.permission', // hide if user lacks this permission
        hidden:      false,             // render as hidden inputs
        collapsible: true,              // add collapse/expand toggle
    },
}
```

---

## Layouts Reference

```typescript
// Flat — column array (default for most cases)
layouts: {edit: ['main', 'notes']}
// Two cards in the same column (stacked):
layouts: {edit: ['main', ['notes', 'extra']]}

// Tabbed
layouts: {
    edit: {
        items: [
            {id: 'details', label: 'Details', icon: 'pi pi-id-card', widgets: ['main']},
            {id: 'notes',   label: 'Notes',   icon: 'pi pi-file',    widgets: ['notes']},
        ],
    },
}

// ThumbIndex sidebar
layouts: {
    edit: {
        orientation: 'left',
        items: [
            {id: 'groupA', label: 'Group A', icon: 'pi pi-cog',  widgets: ['main', 'extra']},
            {id: 'groupB', label: 'Group B', icon: 'pi pi-user', widgets: ['contact']},
        ],
    },
}
```

---

## Browser Config Reference

```typescript
browser: {
    title: 'Corals',        // browse tab title and menu label
    icon:  'pi pi-star',    // PrimeIcon class
    permission: {
        browse: 'marine.coral.browse',  // required to open the browse page
        add:    'marine.coral.new',     // shows "Create" button when present
        edit:   'marine.coral.open',    // shows row edit control
        delete: 'marine.coral.remove',  // shows row delete (when implemented)
    },
    filter: {isActive: true}, // default params passed to listAction on open
}
```

---

## Method Overrides

```typescript
methods: {
    find:   'marine.coral.search',  // non-standard list method
    report: 'marine.report.coral',
}
```

All six method names default to `{subject}.{object}.{find|get|add|edit|remove|report}`.

---

## Report Page

```typescript
report: {
    title:      'Coral Report',
    permission: 'marine.coral.report',
}
```

Omit the `report` property entirely to skip generating the report page.

---

## Mixing Model and Custom Pages

The model handles standard CRUD. For pages with custom logic, add a separate component handler file
with the `.component` suffix in a component layer. The portal orchestrator discovers both model
handlers (`.model` suffix) and component handlers (`.component` suffix) automatically:

```typescript
// marine/component/marineCoralImport.component.ts
import {handler} from '@feasibleone/blong';

export default handler(() => ({
    'marine.coral.import': async () => ({
        title: 'Import Corals',
        permission: 'marine.coral.import',
        component: async () => {
            const {CoralImport} = await import('./CoralImport.js');
            return CoralImport;
        },
    }),
}));
```

Both model handlers (`.model` files in `meta/model/`) and component handlers (`.component` files)
are discovered and loaded by the portal orchestrator together.
