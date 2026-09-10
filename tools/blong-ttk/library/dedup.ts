/**
 * Duplication detection and analysis
 * 
 * Analyzes ml-testing-toolkit collections for duplicated patterns
 * that can be extracted into reusable helper functions.
 */

import type {
    ITtkCollection,
    ITtkRequest,
    IDuplicationAnalysis,
    IDuplicationSuggestion,
} from '../types.js';

/**
 * Analyze a collection for duplication patterns
 */
export function analyzeCollectionDuplication(
    collection: ITtkCollection,
): IDuplicationAnalysis {
    const requests: ITtkRequest[] = [];
    
    // Flatten all requests
    for (const testCase of collection.test_cases) {
        requests.push(...testCase.requests);
    }

    const requestPatterns = analyzeRequestPatterns(requests);
    const assertionPatterns = analyzeAssertionPatterns(requests);
    const scriptPatterns = analyzeScriptPatterns(requests);

    return {
        totalRequests: requests.length,
        duplicatedRequests: requestPatterns.length,
        duplicatedAssertions: assertionPatterns.length,
        duplicatedScripts: scriptPatterns.length,
        suggestions: [
            ...requestPatterns,
            ...assertionPatterns,
            ...scriptPatterns,
        ],
    };
}

/**
 * Analyze request patterns for duplication
 */
function analyzeRequestPatterns(requests: ITtkRequest[]): IDuplicationSuggestion[] {
    const patterns = new Map<string, {count: number; locations: string[]}>();

    for (const request of requests) {
        // Create pattern key from method + path
        const key = `${request.method.toUpperCase()} ${request.operationPath}`;
        
        if (!patterns.has(key)) {
            patterns.set(key, {count: 0, locations: []});
        }

        const pattern = patterns.get(key)!;
        pattern.count++;
        pattern.locations.push(request.description);
    }

    // Filter to only duplicated patterns (appears more than once)
    const suggestions: IDuplicationSuggestion[] = [];
    for (const [key, data] of patterns.entries()) {
        if (data.count > 1) {
            suggestions.push({
                type: 'request',
                pattern: key,
                occurrences: data.count,
                locations: data.locations,
            });
        }
    }

    return suggestions;
}

/**
 * Analyze assertion patterns for duplication
 */
function analyzeAssertionPatterns(requests: ITtkRequest[]): IDuplicationSuggestion[] {
    const patterns = new Map<string, {count: number; locations: string[]}>();

    for (const request of requests) {
        if (!request.tests?.assertions) continue;

        for (const assertion of request.tests.assertions) {
            // Use assertion description as pattern key
            const key = assertion.description;
            
            if (!patterns.has(key)) {
                patterns.set(key, {count: 0, locations: []});
            }

            const pattern = patterns.get(key)!;
            pattern.count++;
            pattern.locations.push(request.description);
        }
    }

    const suggestions: IDuplicationSuggestion[] = [];
    for (const [key, data] of patterns.entries()) {
        if (data.count > 1) {
            suggestions.push({
                type: 'assertion',
                pattern: key,
                occurrences: data.count,
                locations: data.locations,
            });
        }
    }

    return suggestions;
}

/**
 * Analyze script patterns for duplication
 */
function analyzeScriptPatterns(requests: ITtkRequest[]): IDuplicationSuggestion[] {
    const patterns = new Map<string, {count: number; locations: string[]}>();

    for (const request of requests) {
        // Analyze preRequest scripts
        if (request.scripts?.preRequest) {
            const scriptKey = request.scripts.preRequest.exec.join('\n');
            if (scriptKey.length > 20) { // Only consider substantial scripts
                if (!patterns.has(scriptKey)) {
                    patterns.set(scriptKey, {count: 0, locations: []});
                }
                const pattern = patterns.get(scriptKey)!;
                pattern.count++;
                pattern.locations.push(`${request.description} (preRequest)`);
            }
        }

        // Analyze postRequest scripts
        if (request.scripts?.postRequest) {
            const scriptKey = request.scripts.postRequest.exec.join('\n');
            if (scriptKey.length > 20) {
                if (!patterns.has(scriptKey)) {
                    patterns.set(scriptKey, {count: 0, locations: []});
                }
                const pattern = patterns.get(scriptKey)!;
                pattern.count++;
                pattern.locations.push(`${request.description} (postRequest)`);
            }
        }
    }

    const suggestions: IDuplicationSuggestion[] = [];
    for (const [key, data] of patterns.entries()) {
        if (data.count > 1) {
            // Truncate pattern for display
            const displayPattern = key.length > 100 
                ? key.substring(0, 100) + '...'
                : key;
            
            suggestions.push({
                type: 'script',
                pattern: displayPattern,
                occurrences: data.count,
                locations: data.locations,
            });
        }
    }

    return suggestions;
}

/**
 * Calculate duplication reduction percentage
 */
export function calculateReductionPercentage(analysis: IDuplicationAnalysis): number {
    const totalDuplications = 
        analysis.duplicatedRequests + 
        analysis.duplicatedAssertions + 
        analysis.duplicatedScripts;
    
    if (analysis.totalRequests === 0) return 0;
    
    return Math.round((totalDuplications / analysis.totalRequests) * 100);
}
