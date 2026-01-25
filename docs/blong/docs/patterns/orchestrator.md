# Orchestrator

Blong includes the following commonly used orchestrators:

## Dispatch

The `dispatch` orchestrator enables calling the attached handlers using
the configured namespace, optionally falling back to the configured
destination, when no handler is defined. This is often used
as an intermediate place to include some logic, before calling a
database adapter or another downstream adapter.

Configuration properties:

```yaml
destination: sql            # call the method in another namespace when
                            # no method handler exists in the orchestrator
```

```ts
import { orchestrator } from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch'
}));
```

## Schedule

The `schedule` orchestrator is used to invoke functionality based
on predefined schedule.

Configuration properties:

```yaml
schedule:
  handlerName: 0 0 * * *    # call the handler, using the specified cron pattern
```

```ts
import { orchestrator } from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.schedule'
}));
```

## Configuration

All orchestrators share some common configuration properties, such as:

- `logLevel` - the log level for the orchestrator
- `namespace` - prefixes used to call the orchestrator API
- `imports` - handlers to attach in the orchestrator
- `validations` - validations to attach in the orchestrator

See the [configuration pattern](./configuration.md) for more details
about the places where adapters and orchestrators can be configured.
