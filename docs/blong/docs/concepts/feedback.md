# Feedback mode

Feedback mode turns a running application into something a person can annotate where they see the
problem. They switch it on, click the element that is wrong, type a sentence beside it, and submit;
the batch is stored with a picture of the screen, the page it came from and a path identifier for
every element they pointed at. A reviewer later renders one or more submissions as a Markdown
document for a coding agent — generated from the stored rows on demand, never saved.

Three things make that work:

- **An identifier is a path, not a position.** It is the page plus one step per container —
  `sport.club.browse/card:browse/table:club/column:legalName/label`. No array index appears, so an
  identifier survives paging, sorting and re-layout, and it says what contains what.
- **The page cannot answer back.** While the mode is on, one capture-phase guard stops clicks, keys
  and pointer events before the page sees them: a menu does not close, a table does not page and
  nothing is submitted by accident. Only the mode's own chrome receives events.
- **A callout belongs to the person.** It is placed beside its element, joined to it by an arrow,
  then dragged and resized; the box and the element's rectangle are stored as fractions of the
  picture. The reviewer opens the same boxes on the same picture and can move, resize or close them
  too, so a comment that hides what it describes is fixed rather than read around. The picture is
  cropped to what matters — and when the browser refuses to capture, the URL and the anchors are what
  remains.

An unconfigured suite pays nothing: while the mode is off every hook answers nothing, and no
provider or attribute reaches the tree.

The mode is a capability of `blong-browser` plus a realm that stores the reports
(`realm/blong-feedback`). See the [pattern](../patterns/feedback.md) for the configuration block,
the RBAC grants, the storage and the work needed to make a component addressable.
