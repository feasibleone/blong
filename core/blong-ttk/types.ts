/**
 * Type definitions for blong-ttk
 */


/**
 * Test collection configuration
 */
export interface ICollectionConfig {
    collection: string | (() => Promise<any>);
    concurrency?: number;
    timeout?: number;
    realm?: string;
    logUrl?: string;
}

/**
 * Test collection metadata
 */
export interface ICollectionMetadata {
    name: string;
    path: string;
    description?: string;
    testCount?: number;
}

/**
 * Callback registration
 */
export interface ICallbackRegistration {
    correlationId: string;
    type: string;
    timeout?: number;
}

/**
 * Callback receipt
 */
export interface ICallbackReceipt {
    correlationId: string;
    type: string;
    status: number;
    headers: Record<string, string>;
    body: any;
}

/**
 * ml-testing-toolkit JSON test collection format
 */
export interface ITtkCollection {
    name: string;
    test_cases: ITtkTestCase[];
}

/**
 * ml-testing-toolkit test case
 */
export interface ITtkTestCase {
    id: number | string;
    name: string;
    requests: ITtkRequest[];
}

/**
 * ml-testing-toolkit request
 */
export interface ITtkRequest {
    id: number | string;
    description: string;
    apiVersion?: {
        minorVersion: number;
        majorVersion: number;
        type: string;
    };
    operationPath: string;
    method: string;
    headers?: Record<string, string>;
    body?: any;
    params?: Record<string, string>;
    tests?: {
        assertions: ITtkAssertion[];
    };
    scripts?: {
        preRequest?: {exec: string[]};
        postRequest?: {exec: string[]};
    };
}

/**
 * ml-testing-toolkit assertion
 */
export interface ITtkAssertion {
    id: number | string;
    description: string;
    exec: string[];
}

/**
 * Migration result
 */
export interface IMigrationResult {
    sourcePath: string;
    targetPath: string;
    success: boolean;
    errors?: string[];
    warnings?: string[];
}

/**
 * Duplication analysis result
 */
export interface IDuplicationAnalysis {
    totalRequests: number;
    duplicatedRequests: number;
    duplicatedAssertions: number;
    duplicatedScripts: number;
    suggestions: IDuplicationSuggestion[];
}

/**
 * Duplication suggestion
 */
export interface IDuplicationSuggestion {
    type: 'request' | 'assertion' | 'script';
    pattern: string;
    occurrences: number;
    locations: string[];
}

/**
 * Rule conversion result
 */
export interface IRuleConversionResult {
    sourcePath: string;
    targetPath: string;
    rulesConverted: number;
    warnings?: string[];
}
