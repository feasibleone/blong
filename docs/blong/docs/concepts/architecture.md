# Architecture

![architecture](img/architecture-dark.png#gh-dark-mode-only)![architecture](img/architecture-light.png#gh-light-mode-only)

The framework offers flexibility during deployment, in what may be called
"bring your own architecture". The functionality is split into realms and
realms into layers. When deploying, each layer can be activated
in a process (also known as a microservice) alone or with some other layers.
This allows the solution to run in as many or as few processes as required,
including running in a single process like a monolith app.

For more information see [layer](./layer.md) and [realm](./realm.md).

Each of these processes usually runs in a Kubernetes pod. When needed, a service
mesh like Istio can also be used, where it will add its proxy to that pod. Each
of the processes is capable of sending logging, metrics and trace data to
the observability solution, where Grafana and Prometheus are supported out of
the box.
