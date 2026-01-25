# Orchestrator

The role of the orchestrator is to provide an intermediate point in the
architecture where the business logic can be implemented in a way that is
decoupled from the integration protocols and APIs.

Orchestrators are the place where the API namespaces are defined;
usually there is one orchestrator per namespace. The orchestrators
can call adapters within the same realm or orchestrators in
another realm. Calling adapters from another realm is discouraged
and is only feasible in isolated cases where maximizing performance
is needed. The namespaces of the orchestrators are used for service
discovery and also become the service names in Kubernetes. So the
orchestrator is the place where the server side solution is glued together
by reusing the functionality of the different realms.

The orchestrator is the typical place where the logic of a
[sequence diagram](https://en.wikipedia.org/wiki/Sequence_diagram)
resides, where each vertical line represents one or more orchestrators.

Orchestration can also be used as a distributed transaction architecture,
which is well explained in this article from RedHat:
[Distributed transaction patterns for microservices compared](https://developers.redhat.com/articles/2021/09/21/distributed-transaction-patterns-microservices-compared#orchestration).
