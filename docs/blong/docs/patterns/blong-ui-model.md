# Schema based UI

How to define model specs and use `createModelHandlers` in a realm.

See [Model System](../concepts/blong-ui-model.md) for the concept overview
and the blong-ui-model skill for agent assistance with model development.

---

## Folder Structure

Each realm that uses the model system organises its model in a dedicated folder:

```
marine/
  component/
    index.ts          ← createModelHandlers(models)
  model/
    coral.ts          ← IModelSpec for coral entity
    family.ts
    habitat.ts
    species.ts
    index.ts          ← export default [coral, family, habitat, species]
    mock.ts           ← Storybook / test mock data
```

---

## Defining a ModelSpec

```typescript
// marine/model/coral.ts
import type {IModelSpec} from '@feasibleone/blong-ui';

const coral: IModelSpec = {
    subject: 'marine',
    object:  'coral',
    objectTitle: 'Coral',   // defaults to capitalised 'object'
    keyField: 'coralId',    // defaults to '${object}Id'

    // Browser-side schema overlay (merged on top of server OpenAPI schema)
    schema: {
        properties: {
            coral: {
                properties: {
                    coralId:     {},
                    coralName:   {title: 'Name', filter: true, sort: true},
                    familyId:    {title: 'Family',  widget: {type: 'dropdown', dropdown: 'marine.family'}},
                    habitatId:   {title: 'Habitat', widget: {type: 'dropdown', dropdown: 'marine.habitat'}},
                    maxDepth:    {title: 'Max Depth (m)'},
                    colorPattern:{title: 'Color Pattern'},
                    discovered:  {widget: {type: 'date'}},
                    description: {widget: {type: 'textArea'}},
                },
            },
        },
    },

    // Named groups of fields for the editor form
    cards: {
        browse: {
            widgets: ['coral.coralName', 'coral.familyId', 'coral.maxDepth'],
        },
        details: {
            label: 'Details',
            className: 'col-12 md:col-8',
            widgets: ['coral.coralName', 'coral.familyId', 'coral.habitatId', 'coral.maxDepth'],
        },
        notes: {
            label: 'Notes',
            className: 'col-12 md:col-4',
            widgets: ['coral.colorPattern', 'coral.discovered', 'coral.description'],
        },
    },

    // How cards are arranged on the edit page
    layouts: {
        edit: ['details', 'notes'],
    },

    // Browse page metadata
    browser: {
        title: 'Corals',
        icon: 'pi pi-star',
        permission: {
            browse: 'marine.coral.browse',
            add:    'marine.coral.new',
            edit:   'marine.coral.open',
            delete: 'marine.coral.remove',
        },
    },
};

export default coral;
```

---

## Model Index

```typescript
// marine/model/index.ts
import coral   from './coral.js';
import family  from './family.js';
import habitat from './habitat.js';
import species from './species.js';

export default [coral, family, habitat, species];
```

---

## Component Handler

```typescript
// marine/component/index.ts
import {createModelHandlers} from '@feasibleone/blong-ui';
import models from '../model/index.js';

export default createModelHandlers(models);
```

This single line registers all Browse / New / Open / Report page handlers
for all entities in the model array.

---

## Mock for Storybook and Tests

```typescript
// marine/model/mock.ts
import type {IModelMockOptions} from '@feasibleone/blong-ui';

export const marineMock: IModelMockOptions = {
    // Minimal OpenAPI shapes per subject
    subjects: {
        marine: {
            paths: {
                '/rpc/marine/coral/find': {
                    post: {
                        operationId: 'marine.coral.find',
                        requestBody: {content: {'application/json': {schema: {
                            type: 'object',
                            properties: {params: {type: 'object', properties: {
                                coralName:  {type: 'string'},
                            }}},
                        }}}},
                        responses: {'200': {content: {'application/json': {schema: {
                            type: 'object',
                            properties: {result: {type: 'object', properties: {
                                coral: {type: 'array', items: {type: 'object', properties: {
                                    coralId:     {type: 'integer'},
                                    coralName:   {type: 'string'},
                                    familyId:    {type: 'integer'},
                                    maxDepth:    {type: 'number'},
                                }}},
                            }}},
                        }}}},
                    },
                },
            },
        },
    },
    // Pre-populated dropdown data
    dropdowns: {
        'marine.family': [
            {value: 1, label: 'Acroporidae'},
            {value: 2, label: 'Faviidae'},
        ],
        'marine.habitat': [
            {value: 1, label: 'Shallow Reef'},
            {value: 2, label: 'Deep Reef'},
        ],
    },
};
```

### Using the mock in a Storybook story

```typescript
// marine/component/CoralBrowse.stories.tsx
import {setupModelMock, teardownModelMock} from '@feasibleone/blong-ui';
import {marineMock} from '../model/mock.js';
import {createModelHandlers} from '@feasibleone/blong-ui';
import models from '../model/index.js';

// Setup once per Storybook run (e.g. in .storybook/preview.ts)
setupModelMock(marineMock);

// Or in a beforeAll / afterAll for tests
beforeAll(() => setupModelMock(marineMock));
afterAll(() => teardownModelMock());
```

---

## Schema Overlay Reference

Key field properties available in the schema overlay:

| Property    | Type                         | Effect                                          |
| ----------- | ---------------------------- | ----------------------------------------------- |
| `title`     | string                       | Override field label in forms and column headers |
| `filter`    | boolean                      | Show field in the browse filter bar             |
| `sort`      | boolean                      | Make column sortable in Explorer                |
| `required`  | boolean                      | Mark field required (client-side validation)    |
| `default`   | any                          | Default value for new entity forms              |
| `widget`    | `IWidgetOverride`            | Widget type and widget-specific options         |

Key widget types:

| `widget.type`         | PrimeReact component    | Extra widget props               |
| --------------------- | ----------------------- | -------------------------------- |
| `dropdown`            | Dropdown                | `dropdown: 'subject.name'`       |
| `multiSelect`         | MultiSelect             | `dropdown: 'subject.name'`       |
| `selectTable`         | DataTable (select)      | `dropdown: 'subject.name'`       |
| `date`                | Calendar                |                                  |
| `dateTime`            | Calendar (showTime)     |                                  |
| `textArea`            | InputTextarea           |                                  |
| `boolean`             | Checkbox                |                                  |
| `integer`             | InputNumber (no decimals)|                                 |
| `number`              | InputNumber             |                                  |
| `currency`            | InputNumber (currency)  | `currency: 'USD'`                |
| `select`              | SelectButton            | `options: [{value, label}]`      |
| `table`               | DataTable (editable)    | `widgets: ['col1', 'col2']`      |

---

## Browse Page Configuration

```typescript
browser: {
    title:      'Corals',          // menu item and tab title
    icon:       'pi pi-star',      // PrimeIcon class
    permission: {
        browse: 'marine.coral.browse',
        add:    'marine.coral.new',
        edit:   'marine.coral.open',
        delete: 'marine.coral.remove',
    },
    filter: {isActive: true},      // default filter on page open (optional)
    create: [{                     // "Create" button override (optional)
        title: 'New Coral',
        type:  'default',
        permission: 'marine.coral.new',
    }],
}
```

---

## Method Name Overrides

By default, `createModelHandlers` infers method names from
`{subject}.{object}.{verb}`. To override:

```typescript
methods: {
    find:   'marine.coral.search',   // non-standard list method name
    report: 'marine.report.coral',   // cross-namespace report
}
```

---

## Adding a Report Page

```typescript
report: {
    title:      'Coral Report',
    permission: 'marine.coral.report',
}
```

The report page is only registered when this is present.
