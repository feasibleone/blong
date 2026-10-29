# Feedback mode

A portal can let people annotate the running application and hand the result to a reviewer, who
renders it as Markdown for a coding agent. The mode itself lives in `blong-browser`; the reports are
stored by a realm, and `realm/blong-feedback` is the one this repository ships.

The concept — what the mode is and what it guarantees — is in [feedback](../concepts/feedback.md).

## Turn it on in a suite

The mode appears only where a suite asks for it, because the switch adds a node to the menubar and
would otherwise invalidate every visual baseline of a suite that never turned the feature on. The
block goes in the suite's browser entry, beside the other `ui.portal.portal` settings:

```typescript
// index.browser.ts — the browser half of a suite
config: {
    default: {
        ui: {
            portal: {
                portal: {
                    feedback: {
                        enabled: true,
                        submit: 'feedback.session.add',
                        permission: 'feedback.session.add',
                        find: 'feedback.session.find',
                        get: 'feedback.session.get',
                        shot: 'feedback.shot.get',
                        prose: 'feedback.prose.render',
                        update: 'feedback.session.update',
                    },
                },
            },
        },
        // …the realms, including the one that stores the reports
        feedback: {},
    },
},
```

Every method name is configuration rather than an import, so `blong-browser` stays free of a
dependency on the realm that stores the reports, and a suite may point the mode at its own methods.

| Field          | Default                   | What it names                                                           |
| -------------- | ------------------------- | ----------------------------------------------------------------------- |
| `enabled`      | `false`                   | Whether the switch renders at all                                       |
| `shortcut`     | `F2`                      | Keyboard toggle; `ctrl+shift+F` and friends are accepted                |
| `submit`       | `feedback.session.add`    | Method that stores one submission                                       |
| `permission`   | `feedback.session.add`    | Permission the switch and the submit bar check                          |
| `find`         | —                         | Method that lists the reviewer's queue                                  |
| `get`          | —                         | Method that reads one session with its items                            |
| `shot`         | `feedback.shot.get`       | Method that returns one session's screenshot                            |
| `prose`        | `feedback.prose.render`   | Method that renders the Markdown for a batch                            |
| `update`       | `feedback.session.update` | Method that marks a batch processed                                     |
| `maxShotBytes` | `700 000`                 | Byte ceiling for the captured data URL — the gateway body limit is 1 MB |

The block reaches the mode through the **static** portal configuration (`config.portal.feedback`),
with the composed portal document as a fallback, so a deployment that ships it from a realm's own
`portalConfigGet` works too.

## Make a component addressable

An element is a target when it carries `data-feedback-id`. Three shapes cover everything:

```tsx
// A container: address it, and extend the path for its children.
const card = useFeedbackNode('card', cardName, title);
const content = <>{/* fields, labels, buttons */}</>;
return (
    <div {...card?.attributes}>
        {card ? <FeedbackPath path={card.path}>{content}</FeedbackPath> : content}
    </div>
);

// A leaf: a label, a column header, a button.
const label = useFeedbackTarget('label', undefined, text);
return <span {...label}>{text}</span>;

// An element a child library renders — a PrimeReact table owns its columns, so it
// has to carry the step itself.
<FeedbackRegion kind="table" name={fieldName}>
    <DataTable … />
</FeedbackRegion>
```

A loop cannot call a hook, so it takes the factory instead — and the factory is `undefined` while
the mode is off, which is what makes the optional call free:

```tsx
const columnTarget = useFeedbackTargetFactory(tablePath);
const attributes = columnTarget?.('column', field, header);
```

Rules that keep an identifier useful:

- **A name is the model's own name**, never an index: a `cardName`, a dotted field path, a column
  field, a toolbar action, a menu method.
- **A label is an unnamed step**; its text travels as the target's label, so `clubShortName.label`
  reads well and a reworded sentence does not move an identifier.
- **Slug anything derived from visible text** with `nameOfLabel` — it is the ASCII form of the
  English label, so a language switch does not move the identifier.
- **Compose a step by hand where the parent renders the element itself**:
  `appendSegment(page.path, 'toolbar')` plus `<FeedbackPath>` costs no component, while
  `FeedbackRegion` costs one — it exists for the case the parent cannot hook into.

The kinds of step:

| Kind                      | Emitted by                                | Example                                                   |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `page`                    | `Editor`, `Explorer`, `Report` roots      | `sport.club.browse`                                       |
| `toolbar`                 | the editor's `Toolbar`                    | `sport.club.open/toolbar`                                 |
| `button`                  | `Button`, `ActionButton`, toolbar buttons | `sport.club.open/toolbar/button:save`                     |
| `card`                    | `Card`, by its `cardName`                 | `sport.club.open/card:clubDetails`                        |
| `field`                   | a field row in a card                     | `sport.club.open/card:clubDetails/field:clubShortName`    |
| `table`                   | `TableWidget`, `Explorer`                 | `sport.club.browse/card:browse/table:club`                |
| `column`                  | a table's header cell                     | `…/table:club/column:legalName`                           |
| `label`                   | `Text`                                    | `…/field:clubShortName/label`                             |
| `tab`, `menu`, `menuItem` | the portal's tabs and menubar             | `blong.portal.page/menu:sport/menuItem:sport.club.browse` |

### What the mode does to the page

Four pieces, each of which can be a surprise:

- **The guard** (`guard.ts`) installs one capture-phase listener set on the document while the mode
  is on. It stops the events PrimeReact uses to close an overlay or run a menu command, cancels
  `keydown` everywhere outside the mode's chrome, and copies an element's `title` into the item
  because a hover-only tooltip cannot survive the pointer leaving. Events starting inside
  `[data-feedback-ui]` pass through untouched.
- **The freeze for timers** (`useFeedbackFreeze`) holds `ActionHint`'s two-second lifetime while the
  mode is on, so a message raised just before switching is not lost.
- **The identifiers** exist only while the mode is on: the activity flag is a context published once
  by `App`, and every hook answers `undefined` when it is off — no attribute, no provider, no
  allocation, no subscription.
- **The capture** uses the Screen Capture API, not a DOM-to-image library, so the picture is what
  the person saw. It needs a secure context and shows a picker, so `captured`, `denied` and
  `unavailable` are normal answers and the record carries the page URL and the anchors for the case
  where the picture is missing or wrong.

## The realm that stores the reports

`realm/blong-feedback` is a thin realm: three tables, one item per commented element, and no prose
column anywhere.

| Table              | Key                | Holds                                                                              |
| ------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| `feedback.session` | `sessionId` (uuid) | The page, who sent it, viewport, shot status, `new`/`processed`                    |
| `feedback.item`    | `feedbackItemId`   | `targetId`, kind, label, DOM hint, `anchorJSON`, `calloutJSON`, words, `removedAt` |
| `feedback.shot`    | `sessionId`        | The data-URL screenshot, in its own table so a queue never drags it                |

Both boxes are **fractions of the region the picture kept**, so the review page draws them at any
size without a scale factor.

The methods, by layer:

- `feedback.session.add` — the one write a person makes: the session, its items, its `core_resource`
  and its picture in one transaction.
- `feedback.session.list` / `.items` / `feedback.shot.get` — the reviewer's reads.
- `feedback.item.edit` — the reviewer's edit of one comment: its wording (`refinedText`), the box
  it sits in (`callout`) or closing it (`removed`). The gateway's params schema names all three: a
  field the schema does not declare is stripped before the adapter sees it, so the call answers
  `{updated: 0}` and the reviewer's move is lost without an error (`@@F-632`).
- `feedback.session.update` — the bulk act that marks a batch processed.
- `feedback.prose.render` — the document, rendered from the rows and never stored.

`feedback.prose.render` is three segments on purpose: an external route is
`/rpc/{subject}/{object}/{predicate}`, and a four-segment name reaches
`/rpc/feedback/session/prose/render`, which matches no route.

### Grants

Submitting is every signed-in person's right, so `feedback.session.add` rides on `loginCapability`
in `realm/blong-access`. Reviewing is a capability the feedback realm seeds itself:

```yaml
# realm/blong-feedback/meta/db/accessAuthorizationMerge.yaml
replace: true
role:
    Admin: feedbackManage
    Manager: feedbackMaintain
    Customer: feedbackView
    Guest: feedbackView
capability:
    feedbackManage: >-
        feedback.session.find,feedback.session.list,feedback.session.get,
        feedback.session.items,feedback.session.update,feedback.item.edit,
        feedback.shot.get,feedback.prose.render
```

`feedbackMaintain` may read and correct but not take a session out of the queue; `feedbackView`
reads only. The file name is what the seed dispatches — `access.authorization.merge` on
`blong-access` — and `replace: true` is what makes a list shortened in a later release take effect
on a database seeded once. `meta/dbTest` only seeds two sessions, so a story or a screenshot has
something to show.

### The review page

The realm contributes a `Feedback` group to the menubar through `portalConfigGet`, and the page
itself is a `component` handler:

```text
browser/orchestrator/portal/portalConfigGet.ts   → the menu group (id `feedback`)
browser/orchestrator/component/feedbackReview.ts → `component/feedback.review`
src/pages/feedbackReviewPage.tsx                 → the page, imported lazily
```

A page handler must live in `browser/orchestrator/component/`: the group name is the `component/`
prefix the portal resolves a menu entry through. A provider of the portal configuration belongs in
`browser/orchestrator/portal/`, where the portal namespace exposes it as a bare name.

The page is two panes: the queue (newest first, one checkbox per row, narrow so the picture gets the
room) and the session — its picture with every recorded anchor outlined and every callout drawn where
the person left it. The callouts **are** the editor: a reviewer rewrites the words in the box, drags
its bevel, pulls its corner, or closes it with the ×, and each of those acts is a `feedback.item.edit`
call — the geometry goes back as fractions, so the shape survives the next reader's window. A closed
comment is kept (`removedAt`), leaves the picture and the document, and is listed under the pane so
it can be restored. Below the panes, the two acts that make the workflow: render the document for the
selection and copy it out, then mark that same selection processed.

Both panes scroll, and the row that holds them refuses to shrink, so a short window scrolls the page
rather than letting the picture paint over the prose panel.

## Test it

- **The realm's flow** — `server/test/test/testFeedbackFlow.ts` walks add → render → refine →
  render-again → move a callout and read it back → close (the document drops it) → restore →
  processed with real handlers and an in-memory picture, and asserts the prose format is the one a
  coding agent reads.
- **The story's fake** — `index.test.ts` drives `src/stories/feedbackReviewStub.ts`, the in-memory
  realm the review story runs on: an edit made in the story has to reach the document, or the story
  is demonstrating something the page does not do.
- **The mode itself** — `core/blong-browser/src/feedback/feedback.test.tsx` covers the draft, the
  grammar, the placement solver, the guard, the capture's failures and the hooks' inertness.
- **The end-to-end walk** — `realm/blong-sport/test/feedback.play.ts` switches the mode on a real
  page, comments on a field and a column, drags and resizes a box, crops the picture, submits, opens
  the review page from its menu, rewrites a comment and drags its callout, reads both back through
  the handler and again by re-opening the session, renders the document (which quotes the new
  wording), closes a comment and sees it leave the picture and the document, restores it, and marks
  the session processed. It is the only test that sees the gateway's schema, so it is the one that
  catches a field the schema forgets (`@@F-632`). The picture capture is
  a stub (`getDisplayMedia` needs a picker and a secure context), so the code under test still
  draws, crops and encodes a frame.
- **The stories** — `core/blong-browser/src/feedback/Feedback.stories.tsx` shows the chrome on its
  own, and `realm/blong-sport/src/stories/Feedback.stories.tsx` shows the mode over real model
  pages, commenting through a real click so the guard is exercised.

A visual baseline of the review page should clip to the detail pane: the queue beside it carries the
timestamps of whatever the dev database happens to hold, which no run can reproduce. `sport`'s spec
empties the queue first (by marking every open session processed) and waits out the confirmation
toast.
