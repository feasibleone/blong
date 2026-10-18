# Why a test run belongs in the application

A test report is written after the fact. It answers what failed and which assertion fired, but the
question a developer asks first is different: **what was the run doing when it stopped?** Which step
was in flight, which step had already produced the value the next one read, and which branch did the
code take. Answering that from a report means re-running the scenario with print statements, paying
for the same information twice.

The Test runs console moves the run into the application the test drives. The same steps that a CI
run executes are started from a portal page, and their progress is shown while they happen. The gain
is not only the wall-clock time: the reader can pause on a failure, open the step that failed, read
its assertion log beside the result it produced, and follow the dependency edge to the step whose
value it consumed.

## One model, two hosts

A console that only worked in the browser would miss the half of the system that lives on the
server. A console that only worked on the server would need a second UI for the browser suites that
already run in the page. The console therefore defines **one JSON-safe run model** and one reducer.
The browser source produces it from an in-page executor; the server source produces it from an event
page that the page polls. The presentation does not know which host it is looking at beyond the
`host` field.

That shape has a second benefit: a recorded run is a fixture. The `Replay` Storybook story is the
same model with a clock attached, so a reviewer can watch a session flow without a database, a
gateway or a login. The connection the console shows — step, dependency, assertion, progress point —
is not mocked; it is the recording of a real run.

## A catalog, not a method runner

It is tempting to let the page call any test group. That would make the page a remote code runner
with the logged-in user's permissions, and it would hide the set of scenarios the host actually
supports. The catalog is deliberately small and static: it is the display guard, the server
allowlist is the execution guard, and a method outside both is never loaded. The cost is that a new
entity has to be added to the catalog; the benefit is that a reader can see every scenario the page
offers, and a failure in the page cannot become a way to start an arbitrary handler.

## Why the server still needs a runner

The browser can execute a test group only if every handler that group calls is reachable from the
page. Some groups deliberately call server-only handlers — a login flow, a session store, an audit
trail. Putting those steps in the browser would test a different system. The server-hosted entry
keeps the steps where their dependencies are, and the page becomes a viewer of an event log.

That choice makes the transport boring on purpose: start, poll, snapshot, cancel. There is no
WebSocket requirement and no long-lived connection to keep alive across a dev-server restart. A
polling source also makes cancellation explicit: leaving the page stops the loop and cancels the
run, so a console that is closed does not leave work behind.

## Trade-offs

- **Test-only, by intent.** The menu and the page handler are behind `test-ui`; a normal portal does
  not carry a console that can start server work.
- **Polling, not streaming.** A quiet run may show a short delay. In exchange the page survives a
  restart and needs no extra server infrastructure.
- **Bounded results.** A result larger than 32 KB is replaced by a truncation marker at the
  projection boundary; a console must not try to render an arbitrary payload.
- **The catalog is hand-written.** A generator could derive it, but a list a reviewer can read is
  worth the one line a new entity costs.

The console is not a replacement for CI. CI still decides whether a change is good. The console
shortens the loop between a red build and the moment a developer understands it — and it does that
by showing the run the same model the report and the Storybook replay already use.
