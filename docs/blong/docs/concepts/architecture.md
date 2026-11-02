# Architecture

The framework offers flexibility during deployment, in what may be called "bring your own
architecture". The functionality is split into suites, suites into realms and realms into layers.
When deploying, each layer can be activated in a process (also known as a microservice) alone or
with some other layers. This allows the solution to run in as many or as few processes as required,
including running in a single process like a monolith app.

Six processes of one such deployment are drawn below, and they are not alike. One holds a gateway, an
orchestrator and two adapters; one is entered by a device through a stream adapter and has no gateway
at all; one is a worker that nothing calls; and one — `blong-chat` beside `blong-agent` — takes its
input as a webhook the platform posts to and answers through an SDK. No realm is tied to a server
either: `admin` and `app` keep their schemas in one MySQL while `pos` keeps its own in another, and
object storage is one more store a realm can own.

The colours are the layers, and the arrow colours are the call classes: red for the public API,
neutral for the private API, green for an integration — an adapter call, or the write it makes. The
picture is drawn wide enough that scaling it into a column would cost its labels, so it opens full
screen:

<ArchifyDiagram
    slug="blong-architecture"
    title="Blong deployment architecture — six processes, six shapes"
    linked
    posterLight={require('./img/diagrams/blong-architecture-light.png').default}
    posterDark={require('./img/diagrams/blong-architecture-dark.png').default}
/>

For more information see [suite](./suite.md), [layer](./layer.md) and [realm](./realm.md).

## Deployment

Each of these processes usually runs in a Kubernetes pod. When needed, a service mesh like Istio can
also be used, where it will add its proxy to that pod. Each of the processes is capable of sending
logging, metrics and trace data to the observability solution, where Grafana and Prometheus are
supported out of the box.

How many of them there are is a profile rather than a rewrite: `monolith` keeps every realm and layer
in one process, `realm` is the default, and `group` and `namespace` split the same code further. A
deployed pod carries one `--<realm>.<layer>` flag per split, so it loads only what it serves. The
[`k8s` intent](./intents.md) writes that tree from the registry — see [kustomize](./kustomize.md) for
what it produces.
