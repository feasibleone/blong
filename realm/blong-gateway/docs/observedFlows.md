# Sequence Diagrams

```mermaid
sequenceDiagram
    autonumber
    participant public
    participant gateway
    participant db
    public->>gateway: gateway.bundle.find
    gateway->>db: db/gateway.bundle.find
    db-->>gateway: db/gateway.bundle.find
    gateway-->>public: gateway.bundle.find
```
