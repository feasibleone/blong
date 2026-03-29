/**
 * Mock API helper for Storybook stories.
 * Patches globalThis.fetch to intercept JSON-RPC calls and return mock responses.
 */

/** Handler map: method name → response value or function */
export type MockHandlers = Record<string, unknown | ((params: unknown) => unknown)>;

// Store the original fetch so teardown can restore it.
let _originalFetch: typeof globalThis.fetch | null = null;

/**
 * Set up mock API config for Storybook.
 * Patches globalThis.fetch for the duration of the story.
 * Call teardownMockApi() in afterEach to restore the original.
 */
export function setupMockApi(handlers: MockHandlers): void {
    if (_originalFetch === null) {
        _originalFetch = globalThis.fetch;
    }

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url =
            typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url;

        // Check if this is an RPC call
        if (url.includes('/rpc/')) {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            const method = body.method as string;

            if (method && method in handlers) {
                const handler = handlers[method];
                const result =
                    typeof handler === 'function'
                        ? (handler as (params: unknown) => unknown)(body.params)
                        : handler;

                const response = {
                    jsonrpc: '2.0',
                    result,
                    id: body.id,
                };

                return new Response(JSON.stringify(response), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                });
            }
        }

        return (_originalFetch ?? globalThis.fetch)(input, init);
    };
}

/**
 * Restore the original fetch after mocking.
 * Call this in afterEach to prevent test pollution between stories.
 */
export function teardownMockApi(): void {
    if (_originalFetch !== null) {
        globalThis.fetch = _originalFetch;
        _originalFetch = null;
    }
}

/**
 * Create a mock RPC handler that returns paginated results.
 */
export function mockFindHandler<T>(
    items: T[],
): (params: {paging?: {pageSize: number; pageNumber: number}}) => object {
    return (params) => {
        const pageSize = params?.paging?.pageSize ?? 20;
        const pageNumber = params?.paging?.pageNumber ?? 1;
        const start = (pageNumber - 1) * pageSize;
        return {
            items: items.slice(start, start + pageSize),
            pagination: {
                recordsTotal: items.length,
                pageSize,
                pageNumber,
            },
        };
    };
}
