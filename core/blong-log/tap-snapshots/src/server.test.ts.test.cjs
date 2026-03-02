/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports[`src/server.test.ts > TAP > LogServer > snapshot - GET /api/config > GET /api/config response 1`] = `
Object {
  "apiUrl": "http://127.0.0.1:PORT/api",
  "properties": Object {
    "error": "err",
    "level": "level",
    "name": "name",
    "request": "req",
    "response": "res",
    "timestamp": "time",
    "traceId": "traceId",
  },
  "recentCount": 200,
  "theme": Object {
    "levels": Object {
      "debug": "#3b82f6",
      "error": "#ef4444",
      "fatal": "#dc2626",
      "info": "#22c55e",
      "trace": "#6b7280",
      "warn": "#eab308",
    },
    "mode": "dark",
    "syntax": Object {
      "boolean": "#ff7b72",
      "key": "#79c0ff",
      "null": "#8b949e",
      "number": "#ffa657",
      "punctuation": "#c9d1d9",
      "string": "#7ee787",
    },
  },
  "traceUrlPattern": "https://trace.example.com/{traceId}",
  "wsUrl": "ws://127.0.0.1:PORT/ws",
}
`

exports[`src/server.test.ts > TAP > LogServer > snapshot - GET /api/entries with data > GET /api/entries response shape 1`] = `
Object {
  "entries": Array [
    Object {
      "id": "ULID",
      "level": 30,
      "levelName": "info",
      "msg": "info message",
      "name": "test-service",
      "time": 1700000000000,
    },
    Object {
      "err": Object {
        "message": "something went wrong",
        "type": "Error",
      },
      "id": "ULID",
      "level": 50,
      "levelName": "error",
      "msg": "error occurred",
      "name": "test-service",
      "time": 1700000001000,
    },
  ],
  "total": 2,
}
`

exports[`src/server.test.ts > TAP > LogServer > snapshot - GET /api/search with results > GET /api/search filtered results 1`] = `
Object {
  "entries": Array [
    Object {
      "id": "ULID",
      "level": 30,
      "levelName": "info",
      "msg": "user login",
      "name": "auth",
      "time": 1700000000000,
    },
    Object {
      "id": "ULID",
      "level": 30,
      "levelName": "info",
      "msg": "user logout",
      "name": "auth",
      "time": 1700000001000,
    },
  ],
  "total": 2,
}
`
