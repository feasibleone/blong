# Kafka telemetry: what the session UI may expect

The measurement `test/blong-int-adapter/kafka/test/test/testKafkaPerf.ts` runs (`T-802` `T-803`
`T-804`). Its thresholds are the numbers below; a run that exceeds them fails and prints what it
saw, so a regression is a red group rather than a page that feels slow (`D-995`).

Every run also leaves a **report**: the distribution of each series, a plain-text histogram and an
SVG chart, written beside the test and attached to the Allure result. The toolkit that builds it is
`@feasibleone/blong-lib/perf`, so the next transport measured gets the same report for free.

## What is measured

A telemetry feed, not a benchmark of librdkafka at its limits: small keyed messages through the two
operations a session actually uses, in the two shapes a session produces them.

|          |                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Broker   | the dev k3d cluster's Kafka on `localhost:9092` (KRaft), reached from the host                                               |
| Topic    | `blong.telemetry.perf`, 12 partitions, `retention.ms` 10 minutes, `cleanup.policy=delete`                                    |
| Message  | ~250–300 bytes of JSON: `{seq, session, kind, text, sentAt}`, keyed `session-<n>`                                            |
| Producer | `{ns}.message.send`, one awaited delivery report per message, one producer for the run                                       |
| Consumer | `{ns}.topic.watch` from the watermarks read before the first send, filtered to one key, assigned directly with no group join |
| Clock    | `Date.now()` at produce and at receipt, in one process, so the latency is the broker's and the client's together             |

The measurement reads the watermarks **before** it writes, so a second run does not read the first
run's history: retention bounds the topic, it does not reset it.

### Scenario one: bursts interleaved with silence

A live session is not a steady stream — a turn produces a burst of deltas, then the session waits
for a person or for the model. Five bursts of 120 messages (6 sessions interleaved) with 1500 ms of
silence between them, watched continuously on one key.

Four populations are recorded, because they are what a reader feels:

- `send acknowledgement` — how long one produce waited for its report inside a burst;
- `first send after silence` — the first produce of each burst, which meets whatever the idle period
  left behind;
- `warm record` — send returned → record at the watch, inside a burst;
- `first after silence` — the same latency, for the first record the reader received after at least
  80% of the silence had passed.

Throughput is over the time actually spent sending: the silences are the pattern being measured, not
a cost of the broker.

### Scenario two: produce, then consume

The write path and the read path measured alone, never at once: 300 messages produced with each send
waiting for its acknowledgement and no consumer running, then a watch opened from the watermarks
read before the run.

- `produce acknowledgement` — what one awaited send costs when nothing else competes;
- `watch open` — connect and assign, before the first record can arrive;
- `first record after the pause` — the backlog age a reader opening the session sees;
- `record interval` — the gap between two consecutive records while draining;
- `drain span` — opening the watch → the last record, which is what a reader of a backlog waits for.

## The numbers

Measured on a Ryzen desktop (`ms-02`), 2026-11-24, with the broker on the same machine:

|                                                  | Measured                                 | Threshold asserted               |
| ------------------------------------------------ | ---------------------------------------- | -------------------------------- |
| Send throughput (busy time, bursts)              | **240–384 msg/s**                        | ≥ 150 msg/s                      |
| Warm p95 / p99 (send returned → record at watch) | **1–3 ms** / **7–58 ms**                 | ≤ 400 ms / ≤ 800 ms              |
| First record after a silence                     | **2–5 ms**                               | ≤ 250 ms                         |
| First send after a silence                       | **2–59 ms**                              | ≤ 250 ms                         |
| Produce throughput, nothing consuming            | **518–546 msg/s**                        | ≥ 150 msg/s                      |
| Produce acknowledgement p95                      | **2 ms** (max 18 ms)                     | ≤ 60 ms                          |
| Watch open                                       | **6–57 ms**                              | reported, not asserted           |
| Watch close                                      | **0 ms to the reader** (~1.5 s deferred) | reported, not asserted           |
| Drain span, 300-record backlog                   | **8 ms**                                 | ≤ 2000 ms                        |
| Sends slower than 100 ms                         | **0 per run** (see below)                | counted and reported, not failed |

The latency is the number the page lives by: the gap between the moment a batch is produced and the
moment a watching reader can render it. The throughput is the ceiling of the _serialized_ path — one
awaited report per message — which is what a session does today.

## The spike that was the measurement

The first runs recorded **exactly one send of about 1500 ms** among ~600, always at the same
position — late in the last burst — while the first-send-after-silence series stayed at 2–59 ms and
the five sends right after it were under 5 ms. A spike that reproducible is not the feed: it was the
measurement's own teardown. The watcher stopped when its count was reached, and closing a
`node-rdkafka` consumer is a **synchronous** call that blocked the process for 1500 ms — during
which the next produce could not be reported.

Two things came out of it, and both are in the code now:

- the reader is closed after the last send, so the run times the feed rather than its own exit (a
  `watch close` measure reports the teardown separately);
- `topicWatch` defers the close to the next turn of the loop, so a reader that leaves is answered
  first. The process is still busy for ~1.5 s when the close runs; it is simply no longer busy _for
  the reader_. A pool of assigned consumers is the fix when a watch becomes per-page rather than
  per-session (`F-834`).

With the teardown out of the window, the burst run records **zero** sends over 100 ms and a slowest
send of 15–17 ms.

## What the numbers cost

`message.send` awaits the broker's delivery report, because a session's first message has to come
back with its partition (`D-996`). That makes each send a round trip, and the round trip is bounded
by two settings rather than by the broker:

- `dr_cb` must be set, or librdkafka never reports at all — the send then times out.
- `linger.ms` must be 0. The default batches for 5 ms, which was six of the 6.7 ms a waited send
  took: 87 msg/s. With `linger.ms: 0` the same run is 384 msg/s. A batch that wants coalescing asks
  for it in its own producer config.

So throughput is one publisher waiting for every report. A publish path that waits once per batch of
64 events, rather than once per event, is bounded by the broker instead — worth doing when the
telemetry adapter batches, and worth measuring again then.

A **cluster** that is not on localhost is not covered: a network hop adds its round-trip to the p95
by definition. A deployment that puts the broker in another zone should measure again before it
inherits these thresholds.

## Where the reports go

Each run writes `<name>.txt` and `<name>.svg` beside the test (the package directory) and, in the
`allure-results-tap` directory, the same two files under the `uuid-attachment` names Allure reads,
with one result file per scenario referencing them. The result is tagged `perf` and named after the
scenario, so the distribution and the chart appear in the report beside the test that produced them.
A run with no Allure directory still leaves its numbers on disk.
