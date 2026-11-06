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
| `speech`       | —                         | Dictation in a callout; see below                                       |

The block reaches the mode through the **static** portal configuration (`config.portal.feedback`),
with the composed portal document as a fallback, so a deployment that ships it from a realm's own
`portalConfigGet` works too.

## Dictate a comment

A person can speak their comment instead of typing it. Dictation is a second opt-in, because a
microphone that appears unbidden is a surprise: without a `speech` block the callout shows no mic
button and nothing listens.

```typescript
feedback: {
    enabled: true,
    speech: {engine: 'webSpeech'},
},
```

| Field        | Default               | What it does                                             |
| ------------ | --------------------- | -------------------------------------------------------- |
| `engine`     | `webSpeech`           | `webSpeech` or `sherpa`                                  |
| `language`   | the portal's language | BCP-47 tag; only a fallback, see below                   |
| `autoListen` | `true`                | Listen when a callout is created, or its text is focused |
| `sherpa`     | —                     | The four model URLs; required by the `sherpa` engine     |

**Dictation is in the portal's language.** The engine is handed the language the application is
being read in, so a person working on a Bulgarian screen dictates in Bulgarian without configuring
anything, and a switch of language mid-session is followed by the next phrase. `speech.language` is
the fallback for a page that has no language of its own, and the English switch on the callout is
the one thing that overrides both.

**Two engines, one contract.** `webSpeech` wraps the browser's own recogniser: nothing to download,
and in Chrome the audio is transcribed by a cloud service. `sherpa` runs a streaming Zipformer model
in the page through WebAssembly, so no audio leaves it — at the cost of a model download and a
runtime module:

```typescript
speech: {
    engine: 'sherpa',
    sherpa: {
        // A module name, or a URL when the runtime is fetched by the page.
        module: '/speech/sherpawAdapter.js',
        encoder: '/speech/encoder.int8.onnx',
        decoder: '/speech/decoder.onnx',
        joiner: '/speech/joiner.onnx',
        tokens: '/speech/tokens.txt',
    },
},
```

The runtime is configuration for a reason: the npm `sherpa-onnx` package is the **Node** build and
refuses to start in a browser (`NODERAWFS is currently only supported on Node.js environment`). A
browser needs a WebAssembly build that takes the model files from its own filesystem, wrapped in a
module that exports `createOnlineRecognizer(config)` and answers with `createStream`, `isReady`,
`decode`, `isEndpoint`, `reset` and `getResult`. `blong-browser` ships such a wrapper for
[the published Bulgarian Zipformer](https://huggingface.co/preslaff/bulgarian-asr-zipformer) at
`core/blong-browser/public/speech/sherpawAdapter.js`; Storybook serves it, and the
`Components/Feedback/Sherpa` story runs the whole path against the real 73.6 MB model, with a button
that checks the model files are reachable first.

**Starting is silent unless the microphone is already granted.** Creating a callout, or focusing its
text, starts listening on its own only when `navigator.permissions` already reports the microphone
as `granted`. An automatic start that raised a prompt would ambush a person who just clicked a card,
and a prompt they dismiss poisons the origin for the rest of the session. The mic button in the
callout's bevel is the one place a prompt is allowed, because clicking it is consent.

**What was heard is never what was typed.** A finished phrase is appended to the comment; the phrase
still being recognised is drawn as a caption under the text area, so a partial result that then
changes cannot overwrite a word the person wrote. One box listens at a time, and removing the box,
discarding the draft, submitting or closing the mode closes the microphone.

**The pause is measured in tiers.** Recognition is not instant — a service has to be reached or a
model loaded, and the first use of a page is the slowest — so a flat four seconds from the moment
the box opens cuts the microphone off in the middle of a sentence the recogniser is still working
on. The clock therefore starts from what the session has actually achieved: fifteen seconds before a
voice is heard at all, ten between a voice and its first word, and **eight** once words are coming
back, which is the only state where a pause means what it says. Eight rather than four because the
pause and the engine's own finalisation of a phrase are close together: at four seconds the box
often closed on a phrase that was about to be finalised, and the words arrived as the unfinished
interim instead. Every result, speech start and speech end restarts the clock, and a session that
reaches its wait closes the microphone the way the switch does — no error. A phrase that arrives
once the session has closed is dropped: a recogniser reports what it heard a moment after it was
stopped, and a late phrase must not make the box read as listening again with no microphone behind
it.

**The caption says what is in the microphone, and how long is left.** A dot beside the words is dim
while the room is quiet, still and amber when something that is not a voice is in it, and filled and
pulsing while someone speaks — three states rather than two, because a room is rarely silent and an
indicator that calls a fan a voice teaches a person to ignore it. Under the caption a thin strip
drains over the wait the engine is counting down, so how much time is left is visible rather than
inferred. Both are reported by the engine, which is the only thing that knows which tier its clock
is in: a Web Speech recogniser from its own sound and speech events with a short hold so the dot
does not blink between phrases, sherpa from the loudness of each captured frame.

**What was already recognised survives the close.** The pause is the most common way a phrase ends,
and a person who has just spoken expects the words on screen to be in the comment, not back in the
microphone: whatever the caption holds when the session closes is written as it stands, without
punctuation, because it is a phrase the engine had not finished. The microphone button keeps it the
same way.

**A phrase under way can be settled before the engine settles it.** The caption carries two small
buttons: a tick takes the words into the comment, a cross drops them. Either way the words are
remembered, so the phrase the engine finishes with adds only what is left and the sentence is never
written twice. The caption grows with the phrase — it is the whole sentence the person is about to
own — and scrolls once it has used about half the box.

**Three switches sit under the caption**, remembered until the page is reloaded and never persisted,
and drawn on the box the person is using — the one being dictated into or the one with focus —
rather than on every callout at once:

| Pill          | Default | What it does                                                 |
| ------------- | ------- | ------------------------------------------------------------ |
| `Local`       | on      | Recognise on the device where the browser has the model      |
| `Punctuation` | on      | Write the punctuation a speaker leaves out                   |
| `English`     | off     | Dictate in English over a portal that is in another language |

`Local` is drawn only where the browser offers on-device recognition and is not drawn at all for
`sherpa`, which is always local; `English` is not drawn for `sherpa` either, because its model is
fixed. A session falls back to the service in every doubtful case — a language whose model would
have to be downloaded, a recogniser that refuses the flag outright, or a model that hears a voice
and produces no word before its wait expires — and a session that falls back turns the switch off,
so the next box does not spend the same wait finding out again. Punctuation is written here rather
than by the service — neither engine produces any — so it is a capital after a sentence and a full
stop at the end, and nothing cleverer than that. A phrase a person took part of is mid-sentence by
definition, so the rest of it is left exactly as it was spoken.

**A switch pressed while a box is listening starts that dictation again.** The recogniser reads its
language and its on-device flag only when it starts, so the new setting would otherwise wait for the
next box — and the seconds spent pressing a pill would run down the pause budget. The restart also
gives the box a fresh wait.

**The callout is written at the size of a form input** (1rem), not at caption size: its wording is
what the person is composing, and the box starts large enough to hold a sentence of it.

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
- `feedback.item.edit` — the reviewer's edit of one comment: its wording (`refinedText`), the box it
  sits in (`callout`) or closing it (`removed`). The gateway's params schema names all three: a
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
room) and the session — its picture with every recorded anchor outlined and every callout drawn
where the person left it. The callouts **are** the editor: a reviewer rewrites the words in the box,
drags its bevel, pulls its corner, or closes it with the ×, and each of those acts is a
`feedback.item.edit` call — the geometry goes back as fractions, so the shape survives the next
reader's window. A closed comment is kept (`removedAt`), leaves the picture and the document, and is
listed under the pane so it can be restored. Below the panes, the two acts that make the workflow:
render the document for the selection and copy it out, then mark that same selection processed.

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
  grammar, the placement solver, the guard, the capture's failures, the hooks' inertness and the
  callout's dictation chrome.
- **Dictation on its own** — `core/blong-browser/src/feedback/speech.test.ts` drives both engines
  through fakes: the restart, the four-second close, the on-device fallback, the switches, the
  punctuation, and a phrase taken or dropped before the engine finishes it.
- **The end-to-end walk** — `realm/blong-sport/test/feedback.play.ts` switches the mode on a real
  page, comments on a field and a column, drags and resizes a box, crops the picture, submits, opens
  the review page from its menu, rewrites a comment and drags its callout, reads both back through
  the handler and again by re-opening the session, renders the document (which quotes the new
  wording), closes a comment and sees it leave the picture and the document, restores it, and marks
  the session processed. It is the only test that sees the gateway's schema, so it is the one that
  catches a field the schema forgets (`@@F-632`). The picture capture is a stub (`getDisplayMedia`
  needs a picker and a secure context), so the code under test still draws, crops and encodes a
  frame.
- **The stories** — `core/blong-browser/src/feedback/Feedback.stories.tsx` shows the chrome on its
  own, and `realm/blong-sport/src/stories/Feedback.stories.tsx` shows the mode over real model
  pages, commenting through a real click so the guard is exercised.

A visual baseline of the review page should clip to the detail pane: the queue beside it carries the
timestamps of whatever the dev database happens to hold, which no run can reproduce. `sport`'s spec
empties the queue first (by marking every open session processed) and waits out the confirmation
toast.
