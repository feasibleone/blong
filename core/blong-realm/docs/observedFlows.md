# Sequence Diagrams

```mermaid
sequenceDiagram
    autonumber
    participant public
    participant blong
    participant observer
    public->>blong: blong.flow.find
    blong->>observer: observer/blong.flow.find
    observer-->>blong: observer/blong.flow.find
    blong-->>public: blong.flow.find
```
