# Real time log

Real time log is a feature that allows you to see the log of your application in
real time. This is useful for debugging and monitoring your application. You can
see the log of your application in the browser, which provides the following functionality:

- **Filtering and Search**:
  - Filter by configurable set of properties (log level, service name, trace ID, has error)
  - Filtering uses dropdowns with predefined values and free text search
  - Filters are applied both client-side (on already-fetched data) and server-side
  - Filters persist on WebSocket reconnection and are re-sent to server
  - Free text search across all log message content and properties
  - Search terms are highlighted with yellow background throughout all content
  - Clear button to reset all filters at once

- **Real-time Updates**:
  - Loads recent log entries on open (configurable count)
  - Updates in real time as new log entries arrive via WebSocket
  - Efficient client-side filtering for instant response
  - Handles streaming performance with high message rates (10+ msgs/sec)

- **Interactive UI**:
  - Click log entries to toggle between single-line and expanded multi-line views
  - Expanded view shows full message with proper formatting for errors and HTTP details
  - Hover over any cell to reveal copy-to-clipboard button (📋 icon)
  - Copy buttons preserve full content including formatted multi-line text
  - Copy operation provides visual feedback (✓ checkmark on success)

- **Column-Specific Features**:
  - **Timestamp** - Toggle between absolute time (HH:MM:SS.mmm) and relative time ("2 hours ago")
    by clicking the column header
  - **Log level** - Color-coded badges (debug=gray, info=blue, warn=yellow, error=red, fatal=purple)
    with dropdown filter
  - **Service name** - Displays service name with free text filter and autocomplete
  - **Trace ID** - Rendered as clickable link with two actions:
    - Left-click: Opens trace view in new browser tab using configurable URL pattern
      with {traceId} and {timeRange} placeholders
    - Filter icon: Filters log entries to show only this trace ID
  - **Message** - Single-line preview with search highlighting, expands to show:
    - Full message content with proper line breaks
    - Exception details with type, message, and stack trace (color-coded red border)
    - HTTP request details (method, URL, headers as key-value pairs, JSON body with syntax highlighting)
    - HTTP response details (status code with color coding, headers, JSON body with syntax highlighting, response time)
  - **JSON** - Full log entry as JSON with syntax highlighting and search highlighting

- **Visual Features**:
  - Syntax highlighting for JSON content (properties=blue, strings=green, numbers=orange, booleans/null=purple)
  - Search highlighting integrated with syntax highlighting
  - Responsive column widths optimized for content
  - Dark and light theme support (Willow/WillowDark)
  - Color-coded HTTP status (success=green, error=red)
  - Smooth scrolling and row expansion transitions

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

The client side is implemented as a React component using:

- **React 18.3.1** with hooks (useState, useCallback, useMemo, useContext, useRef)
- **SVAR React Grid 2.5.2** - High-performance data grid with row expansion
  [https://github.com/svar-widgets/react-grid](https://github.com/svar-widgets/react-grid)
- **Navigator Clipboard API** - For copy-to-clipboard functionality

**Features Implementation**:

- **Dual filtering**: Client-side filtering (useMemo) for instant response on fetched data,
  plus server-side filtering via WebSocket subscription messages
- **Filter persistence**: Uses ref to track current filters and re-sends them on WebSocket reconnection
- **Search highlighting**: Custom highlightSearch() function wraps matches in yellow background spans
- **Syntax highlighting**: JSON tokenizer with color-coded rendering for different value types
- **Copy buttons**: Hover-revealed buttons with absolute positioning to prevent layout shifts,
  using event.stopPropagation() to prevent row expansion on click
- **Timestamp toggle**: State-based switching between absolute (ISO format) and relative (time ago)
- **Row expansion**: Context-based tracking of expanded rows with toggle on click
- **Trace URL generation**: Template-based URL construction with {traceId} and {timeRange} placeholders

**Connection Management**:

- On open: Fetches recent log entries via REST API
- After initial load: Subscribes to real-time updates via WebSocket
- Uses ULID to track which entries already received, preventing duplicates
- Automatic reconnection with filter re-subscription on WebSocket disconnect

**Performance Optimizations**:

- useMemo for filtered and displayed entries
- useCallback for event handlers
- Efficient row rendering with custom cell components
- Client-side filtering reduces server load and provides instant response

### Configuration

**Server Configuration**:

- UDP port for receiving log entries (default: 9999)
- HTTP port for REST and WebSocket APIs (default: 9998)
- Buffer size for in-memory log storage (default: 10000 entries)
- Recent entry count sent on client connect (default: 200)
- Maximum UDP packet size (default: 65507 bytes)

**Property Mapping**:
Configurable property names for UI recognition:

- Timestamp property (default: 'time')
- Log level property (default: 'level')
- Service name property (default: 'name')
- Trace ID property (default: 'traceId')
- Error property (default: 'err')
- HTTP request property (default: 'req')
- HTTP response property (default: 'res')

**Trace View Integration**:

- URL pattern with {traceId} and {timeRange} placeholders
- Example: `https://tracing.example.com/trace/{traceId}?start={timeRange.start}&end={timeRange.end}`
- Allows integration with any distributed tracing system

**Theme Configuration**:
Two default themes provided (Willow dark and light), customizable via:

- Theme mode: 'dark' or 'light'
- Log level colors: Custom colors for debug, info, warn, error, fatal
- Syntax highlighting colors: For JSON properties, strings, numbers, booleans, null
- Search highlight color (default: yellow background)
- Background and text colors
- Border and spacing preferences

All configuration is passed to the log server, which makes relevant settings
available to the client via REST API on connection.

### Testing

**Storybook Testing**: Comprehensive visual testing with 22 stories covering:

- **Theme variations**: Dark and light themes
- **Data scenarios**: Empty state, error-only, large datasets (500+ entries)
- **HTTP details**: Full request/response rendering with headers and bodies
- **Expanded views**: Exception details, HTTP details, mixed content
- **Search highlighting**: Single-line and expanded views, HTTP and error content
- **Performance testing**: 10 messages/second streaming (200 messages over 20 seconds)
- **Filter testing**: Server-side filter verification with live message streaming

All stories use Playwright-based snapshot testing for visual regression detection.

**Unit Testing**: TAP/Jest for server-side components including:

- UDP packet reassembly and parsing
- WebSocket subscription and filter handling
- Circular buffer management
- REST API endpoints

### Agent usage

AI agents can utilize the real time log to monitor the behavior of the
application in real time, while they implement new features or debug issues.
This allows them to see the log entries as they are created, which can provide
valuable insights into the behavior of the application and help them if the
functionality they are implementing is working as expected.
A skill for the same is implemented.
