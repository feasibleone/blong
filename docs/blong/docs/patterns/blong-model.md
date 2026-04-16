# Schema based UI

How to define model specs in a realm.

See [Model System](../concepts/blong-model.md) for the concept overview
and the blong-model skill for agent assistance with model development.

---

## Folder Structure

Each realm that uses the model system organises its model in a dedicated folder:

```text
marine/
  model/
    coral.ts          ← IModelSpec for coral entity
    family.ts
    habitat.ts
    species.ts
    mock.ts           ← Storybook / test mock data
```

---

## Defining a ModelSpec

```typescript
// marine/model/coral.ts
import {model} from '@feasibleone/blong';

export default model(() => ({
    subject: 'marine',
    object:  'coral',
    objectTitle: 'Coral',   // defaults to capitalized 'object'
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
}));
```

---

## Mock for Storybook and Tests

```typescript
// marine/model/mock.ts
import type {IModelMockOptions} from '@feasibleone/blong-browser';

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

By default, `modelFactory` infers method names from
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
