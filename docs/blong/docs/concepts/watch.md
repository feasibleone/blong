# Watch

Watch mode or server side hot reload is a central part of the framework.
‘Watch’ mode has become a mandatory feature of every self-respecting tool,
including node.js, so the following features are official goal of Blong:

- Changing a TypeScript file, which implements a method handler, adapter or
  validation will immediately load the change
- Changing a codec, reloads automatically, without dropping the connection
- Changing a SQL file, which implements a stored procedure will immediately
  change the procedure in the database
- Changing a configuration, reloads immediately
- Changing a test or any of the above, reruns the configured tests
