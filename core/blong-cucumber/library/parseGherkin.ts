import {AstBuilder, GherkinClassicTokenMatcher, Parser} from '@cucumber/gherkin';
import {IdGenerator} from '@cucumber/messages';

export interface IGherkinStep {
    keyword: string;
    text: string;
    dataTable?: string[][];
    docString?: string;
}

export interface IGherkinExamples {
    name: string;
    tags: string[];
    headers: string[];
    rows: string[][];
}

export interface IGherkinScenario {
    name: string;
    tags: string[];
    steps: IGherkinStep[];
    examples: IGherkinExamples[];
    isOutline: boolean;
}

export interface IGherkinBackground {
    steps: IGherkinStep[];
}

export interface IGherkinFeature {
    name: string;
    tags: string[];
    background?: IGherkinBackground;
    scenarios: IGherkinScenario[];
}

export function parseGherkin(source: string): IGherkinFeature {
    const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
    const doc = parser.parse(source);
    if (!doc.feature) throw new Error('No feature found in Gherkin source');
    const feature = doc.feature;
    let background: IGherkinBackground | undefined;
    const scenarios: IGherkinScenario[] = [];
    for (const child of feature.children) {
        if (child.background) {
            background = {
                steps: child.background.steps.map(s => ({
                    keyword: s.keyword.trim(),
                    text: s.text,
                    dataTable: s.dataTable
                        ? s.dataTable.rows.map(r => r.cells.map(c => c.value))
                        : undefined,
                    docString: s.docString?.content,
                })),
            };
        } else if (child.scenario) {
            const scenario = child.scenario;
            const isOutline = scenario.keyword.trim() === 'Scenario Outline' || scenario.examples.length > 0;
            const examples: IGherkinExamples[] = scenario.examples.map(ex => ({
                name: ex.name || '',
                tags: ex.tags.map(t => t.name),
                headers: ex.tableHeader ? ex.tableHeader.cells.map(c => c.value) : [],
                rows: ex.tableBody.map(row => row.cells.map(c => c.value)),
            }));
            scenarios.push({
                name: scenario.name,
                tags: scenario.tags.map(t => t.name),
                steps: scenario.steps.map(s => ({
                    keyword: s.keyword.trim(),
                    text: s.text,
                    dataTable: s.dataTable
                        ? s.dataTable.rows.map(r => r.cells.map(c => c.value))
                        : undefined,
                    docString: s.docString?.content,
                })),
                examples,
                isOutline,
            });
        }
    }
    return {
        name: feature.name,
        tags: feature.tags.map(t => t.name),
        background,
        scenarios,
    };
}

export function expandOutline(scenario: IGherkinScenario): IGherkinScenario[] {
    if (!scenario.isOutline || scenario.examples.length === 0) return [scenario];
    const expanded: IGherkinScenario[] = [];
    for (const exTable of scenario.examples) {
        for (const row of exTable.rows) {
            const substitutions: Record<string, string> = {};
            for (let i = 0; i < exTable.headers.length; i++) {
                substitutions[exTable.headers[i]] = row[i];
            }
            const name =
                scenario.name +
                (exTable.name ? ` (${exTable.name})` : '') +
                ' | ' +
                exTable.headers.map(h => substitutions[h]).join(', ');
            expanded.push({
                ...scenario,
                name,
                steps: scenario.steps.map(step => ({
                    ...step,
                    text: step.text.replace(/<([^>]+)>/g, (_, key) => substitutions[key] ?? `<${key}>`),
                })),
                examples: [],
                isOutline: false,
            });
        }
    }
    return expanded;
}
