# Semantic Log

**Semantic logging** keeps one readable line on stdout and gives **every record a locally-minted
id**, so a human or an agent can reach the full detail on demand instead of grepping. It lives in
`core/semantic-log/`.

It goes beyond ordinary logging in five ways.

- **Identity comes from structure, not text.** Timestamps, ids, IP addresses and numbers are masked,
  and the masked message is hashed — so two occurrences of one code path share one **template**
  however much their values differ. The **template registry**, not the stream of records, is the
  durable artifact.
- **Causal lineage and intent travel with the request.** A **trace** id follows one request across
  services; a **flow execution** id names exactly one execution of a named process, and the flow's
  progress through its steps is recorded as it goes; each record points at the record that caused
  it. Business intent is attached once, at the entry point, and inherited below it. A **leg** names
  one **call** inside an execution — an id the source code declares, the participant the caller
  expects to answer, and the call's position in the execution — so a record answers "which call was
  this?" and a diagram drawn from records can label every arrow with something greppable.
- **Anomalies are distinguished by kind.** A first-seen template is **novelty**, a familiar template
  at an unfamiliar rate a **rate-shift**, and a flow whose shape has moved **drift** — three events,
  not one score, because they call for three different responses.
- **Verbose detail is held back until it is wanted.** Detail a call did not need to transmit is
  retained and released onto the record that reports the failure, so the happy path stays quiet and
  the failure explains itself.
- **One fact, several audiences.** The same stored entry is projected into operational, diagnostic
  or compliance views when it is read, rather than emitted three times.

The cluster service is optional. An emitter writes readable lines and retains every record in a
local cache with no service anywhere, and ships the same records to one when configured. It keeps
**two** things durably — the template registry and the calls observed per flow kind — and treats
records as evidence it holds for a while rather than a corpus it keeps: what it can _search_ is the
templates and the few records per template it is currently holding, so "find me the record that
looked like this" is a question about now, not about history.

- How to use it: [pattern guide](../patterns/semantic-log.md)
- Demonstration flows, leg by leg: [flow walkthrough](../patterns/semantic-log-flows.md)
- Why it is built this way: [rationale](../rationale/semantic-log.md)
