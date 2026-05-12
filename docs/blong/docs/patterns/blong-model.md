# Schema based UI

How to define model specs in a realm.

See [Model System](../concepts/blong-model.md) for the concept overview
and the blong-model skill for agent assistance with model development.

---

## Folder Structure

Each realm that uses the model system organises its models and fixture data in a dedicated folder.
The conventional structure (as seen in `core/blong-marine/`) is:

```text
marine/
  meta/
    model/
      marineCoralModel.ts    ← IModelSpec handler for coral entity
      marineFamilyModel.ts
      marineHabitatModel.ts
    fixture/
      marineFixture.ts       ← Fixture data handler for Storybook/tests
  orchestrator/
    marine.ts                ← Forwarding orchestrator (dispatches to backend)
  browser.ts                 ← Realm entry point (auto-discovers meta/ folder)
```

The model files are discovered by the portal orchestrator and mock adapter via the `.model` handler
kind (set by the `model()` factory). The fixture file is discovered via the `.fixture` handler kind.

---

## Defining a ModelSpec

Model specs use the `model()` factory from `@feasibleone/blong`. The factory wraps an async handler
function whose name follows the pattern `{subject}{Object}Model`.

```typescript
// marine/meta/model/marineCoralModel.ts
import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function marineCoralModel() {
            return {
                subject: 'marine',
                object:  'coral',
                objectTitle: 'Coral',   // defaults to capitalized 'object'
                keyField: 'coralId',    // defaults to '${object}Id'

                // Browser-side schema overlay (merged with runtime schema from {subject}.{object}.schema handler)
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
                            // Override table widget options for the browse panel
                            widget: {
                                columns: ['coralName', 'familyId', 'maxDepth'],
                            },
                        },
                    },
                },

                // Named groups of fields for the editor form
                cards: {
                    browse: {
                        label: 'Coral',
                        widgets: ['coral'],
                    },
                    edit: {
                        label: 'Coral Details',
                        className: 'col-12 md:col-8',
                        widgets: ['coral.coralName', 'coral.familyId', 'coral.habitatId',
                                  'coral.maxDepth', 'coral.colorPattern', 'coral.discovered',
                                  'coral.description'],
                    },
                },

                // How cards are arranged on the edit page
                layouts: {
                    edit: ['edit'],
                },

                // Browse page toolbar buttons
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
                            enabled: 'current' as const,
                            method: 'component/marine.coral.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected' as const,
                            confirm: 'Delete selected record?',
                            method: 'marine.coral.remove',
                            params: {coralId: '${coralId}'},
                        },
                    ],
                },
            };
        },
);
```

---

## Fixture Data for Storybook and Tests

The mock adapter auto-generates all CRUD mock handlers from model and fixture handlers. Create a
fixture handler using the `fixture()` factory from `@feasibleone/blong`:

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

The fixture handler must be named `{subject}Fixture` and return an object keyed by
`'{subject}.{object}'` with arrays of item objects. The mock adapter calls
`blong.handler['{subject}Fixture']({}, {})` to load the data.

For inline fixture data (small datasets or when YAML is overkill):

```typescript
import {fixture} from '@feasibleone/blong';

export default fixture(() =>
    async function marineFixture() {
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

The mock generates the following handlers automatically from each model + fixture:

- `{subject}.{object}.find`, `.get`, `.add`, `.edit`, `.remove`, `.report`
- `{subject}.{object}.schema` — returns `{}`
- `{subject}.dropdown.list` — synthesises from fixture data

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

By default, the model system infers method names from
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
