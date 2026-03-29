/**
 * Mock API helper for Storybook stories.
 * Patches rpcCall to return mock responses without network calls.
 */
import {setApiConfig} from '../../src/hooks/useApi.js';

/** Handler map: method name → response value or function */
export type MockHandlers = Record<string, unknown | ((params: unknown) => unknown)>;

/**
 * Set up mock API config for Storybook.
 * Call this in story decorators or beforeEach.
 */
export function setupMockApi(handlers: MockHandlers): void {
    // Patch globalThis.fetch to intercept RPC calls
    const originalFetch = globalThis.fetch;

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

        return originalFetch(input, init);
    };
}

/**
 * Restore original fetch after mocking.
 */
export function teardownMockApi(): void {
    // Nothing to do - fetch is module-scoped
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
