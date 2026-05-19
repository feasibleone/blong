/**
 * Convert ml-testing-toolkit rule files to @infitx/decision YAML
 */

import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {IRuleConversionResult} from '../../../types.js';
/* eslint-disable @typescript-eslint/no-explicit-any */

export default handler(() => ({
    /**
     * Convert json-rules-engine JSON to @infitx/decision YAML
     *
     * @param params - Conversion parameters
     * @param $meta - Metadata
     */
    migrateMigrateRuleConvert: async (
        params: {
            sourcePath: string;
            targetPath: string;
        },
        _$meta: IMeta,
    ): Promise<IRuleConversionResult> => {
        const warnings: string[] = [];

        try {
            // Read JSON rules
            const content = await readFile(params.sourcePath, 'utf-8');
            const rules = JSON.parse(content);

            if (!Array.isArray(rules)) {
                throw new Error('Rule file must contain an array of rules');
            }

            // Convert to YAML
            const yamlLines: string[] = [];
            yamlLines.push('# Converted from ml-testing-toolkit rules');
            yamlLines.push('# Review and test before use');
            yamlLines.push('');
            yamlLines.push('rules:');

            for (const rule of rules) {
                yamlLines.push(...convertRule(rule, warnings));
            }

            const yaml = yamlLines.join('\n');

            // Ensure target directory exists
            await mkdir(dirname(params.targetPath), {recursive: true});

            // Write YAML file
            await writeFile(params.targetPath, yaml, 'utf-8');

            console.log(`✓ Converted ${rules.length} rules to ${params.targetPath}`);

            if (warnings.length > 0) {
                console.log(`\nWarnings:`);
                warnings.forEach(w => console.log(`  - ${w}`));
            }

            return {
                sourcePath: params.sourcePath,
                targetPath: params.targetPath,
                rulesConverted: rules.length,
                warnings: warnings.length > 0 ? warnings : undefined,
            };
        } catch (error: any) {
            throw new Error(`Rule conversion failed: ${error.message}`);
        }
    },
}));

/**
 * Convert a single rule to YAML format
 */
function convertRule(rule: any, warnings: string[]): string[] {
    const lines: string[] = [];

    // Rule header
    lines.push(`  - rule: rule-${rule.ruleId || 'unknown'}`);

    if (rule.priority !== undefined) {
        lines.push(`    priority: ${rule.priority}`);
    }

    if (rule.description) {
        lines.push(`    # ${rule.description}`);
    }

    // Convert conditions
    if (rule.conditions) {
        lines.push(`    when:`);
        lines.push(...convertConditions(rule.conditions, '      ', warnings));
    }

    // Convert event to decision
    if (rule.event) {
        const decisionKey = convertEventType(rule.event.type);
        lines.push(`    then:`);
        lines.push(`      ${decisionKey}:`);

        if (rule.event.params) {
            lines.push(...convertParams(rule.event.params, '        '));
        }
    }

    lines.push('');

    return lines;
}

/**
 * Convert conditions to @infitx/match format
 */
function convertConditions(conditions: any, indent: string, warnings: string[]): string[] {
    const lines: string[] = [];

    // Handle 'all' conditions (AND)
    if (conditions.all) {
        for (const condition of conditions.all) {
            lines.push(...convertCondition(condition, indent, warnings));
        }
    }

    // Handle 'any' conditions (OR)
    if (conditions.any) {
        warnings.push('OR conditions (any) require manual review - converted to array');
        for (const condition of conditions.any) {
            lines.push(...convertCondition(condition, indent, warnings));
        }
    }

    return lines;
}

/**
 * Convert a single condition
 */
function convertCondition(condition: any, indent: string, _warnings: string[]): string[] {
    const lines: string[] = [];
    const fact = condition.fact;
    const path = condition.path;
    const _operator = condition.operator;
    const value = condition.value;

    // Build path to fact
    const fullPath = path ? `${fact}.${path}` : fact;
    const pathParts = fullPath.split('.');

    // Build YAML path
    const yamlPath = buildYamlPath(pathParts, value, indent);
    lines.push(...yamlPath);

    return lines;
}

/**
 * Build YAML path from parts
 */
function buildYamlPath(parts: string[], value: any, indent: string): string[] {
    const lines: string[] = [];

    if (parts.length === 1) {
        lines.push(`${indent}${parts[0]}: ${formatValue(value)}`);
    } else {
        lines.push(`${indent}${parts[0]}:`);
        const nested = buildYamlPath(parts.slice(1), value, indent + '  ');
        lines.push(...nested);
    }

    return lines;
}

/**
 * Convert event type to decision key
 */
function convertEventType(eventType: string): string {
    const mapping: Record<string, string> = {
        FIXED_CALLBACK: 'fixedCallback',
        MOCK_CALLBACK: 'mockCallback',
        FIXED_ERROR_CALLBACK: 'fixedErrorCallback',
        MOCK_ERROR_CALLBACK: 'mockErrorCallback',
        NO_CALLBACK: 'noCallback',
        FIXED_RESPONSE: 'fixedResponse',
        MOCK_RESPONSE: 'mockResponse',
    };

    return mapping[eventType] || eventType.toLowerCase();
}

/**
 * Convert params to YAML
 */
function convertParams(params: any, indent: string): string[] {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'object' && !Array.isArray(value)) {
            lines.push(`${indent}${key}:`);
            lines.push(...convertParams(value, indent + '  '));
        } else {
            lines.push(`${indent}${key}: ${formatValue(value)}`);
        }
    }

    return lines;
}

/**
 * Format value for YAML
 */
function formatValue(value: any): string {
    if (typeof value === 'string') {
        // Escape special characters and wrap in quotes if needed
        if (value.includes(':') || value.includes('{') || value.includes('[')) {
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        return value;
    }

    return JSON.stringify(value);
}
