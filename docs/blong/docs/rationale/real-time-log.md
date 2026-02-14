# Real time log

Real time log is a feature that allows you to see the log of your application in
real time. This is useful for debugging and monitoring your application. You can
see the log of your application in the browser, which provides the following functionality:

- Filter by configurable set of properties, such as log level, service name, etc.
  The filtering allows drop down with predefined values, but also free text search.
- Search by free text, which searches in the log message and all the properties,
  highlighting the search term
- Loads recent log entries on open, and then updates in real time as new log
  entries are  added. The number of recent log entries to load is configurable.
- Syntax highlighting for log messages, which is useful for log messages that contain
  JSON or other structured data.
- You can click on a log entry to:
  - See the full log message and all the properties in a modal
  - Turn on wrapping for the log message, which is useful for long log messages
- The UI recognizes specific properties and provides a better visualization for
  them:
  - Timestamp - shows the time of the log entry in a human readable format, and
    also shows how long ago the log entry was created
  - Log level - shows the log level with a specific color, and allows
    filtering by log level
  - Service name - shows the name of the service that created the log entry,
    and allows filtering by service name
  - Trace id - shows the trace id of the log entry and renders it as a link,
    which when clicked, can:
    - Open the trace view for that trace id in a new browser tab.
      The link URL uses a pattern where the trace id and time range are injected
      in a specific placeholders, which allows it to work with different
      tracing systems.
    - Allows searching for log entries with the same trace id by highlighting
      them.
    - Allows filtering by trace id, which shows only log entries with the
      same trace id.
  - Exception - if the log entry contains an exception, it shows the exception
    message and stack trace in a readable format, and allows filtering by exception
  - HTTP request - if the log entry contains HTTP request information, it shows
    the HTTP method, URL, headers and body in a readable format. It allows syntax
    highlighting for the body in case of JSON.
  - HTTP response - if the log entry contains HTTP response information, it shows
    the HTTP method, URL, status code and response time in a readable format.
    It allows syntax highlighting for the body in case of JSON.

## Implementation details

This is implemented as a new package in the folder core/blong-log. It is only
loosely coupled to the blong framework runtime (core/blong-gogo), so that it can
be tested independently.

### Server side

Implemented as a new Pino transport, which sends log entries via UDP to a log
server. The log server is implemented as a separate microservice, which receives
log entries from the transport and stores them in a circular buffer in memory.
The log entries are in JSON format and are split into UDP packets, which are
sent to the log server.
Each set of packets contains a batch of log entries and has a randomly generated
8 byte batch id, which allows the log server to reassemble the log entries in the
correct order. After reassembling the log entries, the log server tries to parse
the log message as JSON, and if it succeeds, it stores them in the buffer and adds
an ULID to each log entry.
The log server also exposes a WebSocket API, which allows the client to
subscribe to log entries in real time, and also to provide filters.
The log server also exposes a REST API, which allows the client to fetch recent
log entries on open, and also to fetch log entries based on filters.

The server side also hosts the client side artifacts. The REST API is implemented
with the usual Blong patterns for orchestrator and a namespace "log".
For implementing the WebSocket API, it extends the blong capabilities to allow
this. The log server keeps track of the connected clients and their filters,
and when a new log entry is added to the buffer, it checks if it matches the
filters of any connected client, and if it does, it sends the log entry to that
client via WebSocket. The log server also handles the case when a client
disconnects, by removing it from the list of connected clients and their filters.

### Client side

The client side is implemented as a React component, which connects to the log server
via WebSocket and REST API. It uses the SVAR data grid
[https://github.com/svar-widgets/react-grid](https://github.com/svar-widgets/react-grid)

On open, it fetches recent log entries via REST API and then subscribes to log
entries in real time via WebSocket. It utilizes the ULID to tell the log server
which log entries it has already received, so that the log server only sends new
log entries via WebSocket. The client side also provides the UI for filtering,
searching and displaying log entries, as described in the features section.
The client side also provides the functionality to open the trace view when
clicking on a trace id, by injecting the trace id and time range into a URL pattern.

### Configuration

The names of the properties that are recognized by the UI, the URL pattern for
the trace view, and the number of recent log entries to load on open are all
configurable and passed as options to the log server, which then passes the
relevant configuration to the client side via API.

The colors for the log levels, syntax highlighting for log messages, and the UI
layout are also configurable. A default dark and light theme are provided,
but users can customize the colors and layout to their preference.

### Testing

Utilize Storybook for testing the client side component.
Utilize snapshot testing for the server side; use TAP or Jest.

### Agent usage

AI agents can utilize the real time log to monitor the behavior of the
application in real time, while they implement new features or debug issues.
This allows them to see the log entries as they are created, which can provide
valuable insights into the behavior of the application and help them if the
functionality they are implementing is working as expected.
A skill for the same is implemented.
