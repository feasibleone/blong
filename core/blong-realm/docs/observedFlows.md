# Sequence Diagrams

```mermaid
sequenceDiagram
    autonumber
    participant public
    participant blong
    participant semlog
    public->>blong: blong.flow.find
    blong->>semlog: semlog/blong.flow.find
    semlog-->>blong: semlog/blong.flow.find
    blong-->>public: blong.flow.find
```
