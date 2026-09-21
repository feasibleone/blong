# Sequence Diagrams

```mermaid
sequenceDiagram
    autonumber
    participant public
    participant gateway
    participant db
    public->>gateway: public.gateway.bundle.find
    gateway->>db: gateway.db.gateway.bundle.find
    db-->>gateway: gateway.db.gateway.bundle.find
    gateway-->>public: public.gateway.bundle.find
```
