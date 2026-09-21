# Sequence Diagrams

```mermaid
sequenceDiagram
    autonumber
    participant public
    participant blong
    participant semlog
    public->>blong: public.blong.flow.find
    blong->>semlog: blong.semlog.blong.flow.find
    semlog-->>blong: blong.semlog.blong.flow.find
    blong-->>public: public.blong.flow.find
```
