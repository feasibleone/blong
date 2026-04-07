---
name: blong-ui-model
description: >
    Use the blong-ui model system to implement CRUD pages in a blong realm or suite. The model
    system generates Browse/New/Open/Report pages automatically from IModelSpec declarations. Use
    this skill whenever a realm needs to contribute UI pages for domain entities using
    createModelHandlers — even if the user just says "add list and edit pages for this entity" or
    "wire up the UI for this API". For developing or improving the model system internals, use
    blong-ui-model-dev instead.
---

# blong-ui-model Skill

## What this skill covers

The model system is the primary and most efficient way to add browser UI pages for a domain entity
in a blong suite. This skill covers **using** the model system: how to declare `IModelSpec` objects,
wire them into a realm's component handler, write mock data for Storybook, and configure dropdown
references.

For concept and architecture see:

- [blong-ui Model concept](../../docs/blong/docs/concepts/blong-ui-model.md)
- [blong-ui Model Pattern](../../docs/blong/docs/patterns/blong-ui-model.md)

For developing the model system internals, use the **blong-ui-model-dev** skill.

---

## Quick Summary

Add `model/` + `component/index.ts` to your realm. One `createModelHandlers(models)` call registers
all Browse / New / Open / Report pages for all entities.

```
realm/
  model/
    entity.ts          ← IModelSpec
    index.ts           ← export default [entity, ...]
    mock.ts            ← Storybook/test mock data
  component/
    index.ts           ← createModelHandlers(models)  ← single line
```

---

## Step 1 — Define a ModelSpec

```typescript
// marine/model/coral.ts
import type {IModelSpec} from '@feasibleone/blong-ui';

const coral: IModelSpec = {
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
        browse: {widgets: ['coral.coralName', 'coral.familyId', 'coral.maxDepth']},
        main: {
            label: 'Coral',
            className: 'col-12 md:col-8',
            widgets: ['coral.coralName', 'coral.familyId', 'coral.maxDepth', 'coral.description'],
        },
    },

    layouts: {
        edit: ['main'],
    },

    browser: {
        title: 'Corals',
        icon: 'pi pi-star',
        permission: {
            browse: 'marine.coral.browse',
            add: 'marine.coral.new',
            edit: 'marine.coral.open',
            delete: 'marine.coral.remove',
        },
    },
};

export default coral;
```

Minimal valid spec — only `subject` and `object` are required; everything else falls back to
defaults based on the naming convention.

---

## Step 2 — Index File

```typescript
// marine/model/index.ts
import coral from './coral.js';
import family from './family.js';

export default [coral, family];
```

---

## Step 3 — Component Handler

```typescript
// marine/component/index.ts
import {createModelHandlers} from '@feasibleone/blong-ui';
import models from '../model/index.js';

export default createModelHandlers(models);
```

This file is the complete component handler for the realm. The portal orchestrator discovers it
automatically (file is in the `component/` layer).

---

## Step 4 — Menu Wiring

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

## Step 5 — Mock for Storybook / Tests

```typescript
// marine/model/mock.ts
import type {IModelMockOptions} from '@feasibleone/blong-ui';

export const marineMock: IModelMockOptions = {
    subjects: {
        marine: {
            paths: {
                '/rpc/marine/coral/find': {
                    post: {
                        operationId: 'marine.coral.find',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        properties: {
                                            params: {properties: {coralName: {type: 'string'}}},
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                content: {
                                    'application/json': {
                                        schema: {
                                            properties: {
                                                result: {
                                                    properties: {
                                                        coral: {
                                                            type: 'array',
                                                            items: {
                                                                properties: {
                                                                    coralId: {type: 'integer'},
                                                                    coralName: {type: 'string'},
                                                                    familyId: {type: 'integer'},
                                                                },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    dropdowns: {
        'marine.family': [
            {value: 1, label: 'Acroporidae'},
            {value: 2, label: 'Faviidae'},
        ],
    },
};
```

Activate in Storybook (`.storybook/preview.ts`):

```typescript
import {setupModelMock} from '@feasibleone/blong-ui';
import {marineMock} from '../marine/model/mock.js';

setupModelMock(marineMock);
```

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
alongside `component/index.ts`:

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

Both `index.ts` (model factory) and `marineCoralImport.component.ts` (custom page) are loaded by the
portal orchestrator together.
