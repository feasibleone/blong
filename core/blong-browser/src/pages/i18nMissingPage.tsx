import {useCallback, useState} from 'react';
import {Button} from '../components/Button/Button.js';
import {Text} from '../components/Text/Text.js';
import {renderedCounts, translationReport} from '../i18n/collect.js';

/**
 * The untranslated-strings page.
 *
 * Lists what this session rendered and the dictionary could not answer — the same
 * report the Playwright seed writer consumes, shown instead of written. Client
 * only: it reads the collector and offers the lines as text, because writing a
 * seed file is the runner's job and two writers of one file would race (`D-634`).
 *
 * The workflow it supports is the one a browser is good at: open the screens that
 * matter, then read the list. A Playwright run covers the ones nobody opens.
 */
export function I18nMissingPage() {
    const [report, setReport] = useState(() => translationReport());
    const [counts, setCounts] = useState(() => renderedCounts());
    const [copied, setCopied] = useState(false);

    const refresh = useCallback(() => {
        setReport(translationReport());
        setCounts(renderedCounts());
    }, []);

    const seedLines = report.missing.map(key => `${key}=`).join('\n');
    const copy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(seedLines);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    }, [seedLines]);

    return (
        <div
            className="blong-i18n-missing"
            style={{padding: 16}}
        >
            <div style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12}}>
                <h3 style={{margin: 0}}>
                    <Text>Untranslated strings</Text>
                </h3>
                <span style={{opacity: 0.7}}>
                    <Text>Language</Text>: {report.language}
                </span>
                <span style={{opacity: 0.7}}>
                    <Text>Missing</Text>: {report.missing.length} / {report.rendered.length}
                </span>
                <Button
                    label="Refresh"
                    icon="pi pi-refresh"
                    size="small"
                    onClick={refresh}
                />
                <Button
                    label="Copy seed lines"
                    icon="pi pi-copy"
                    size="small"
                    outlined
                    disabled={report.missing.length === 0}
                    onClick={copy}
                />
                {copied && (
                    <small>
                        <Text>Copied</Text>
                    </small>
                )}
            </div>

            {report.missing.length === 0 ? (
                <p>
                    <Text>
                        Nothing is missing. Open the screens you want to check, then refresh.
                    </Text>
                </p>
            ) : (
                <table
                    className="p-datatable-table"
                    style={{width: '100%', borderCollapse: 'collapse'}}
                >
                    <thead>
                        <tr>
                            <th style={{textAlign: 'left', padding: 6}}>
                                <Text>Key</Text>
                            </th>
                            <th style={{textAlign: 'right', padding: 6, width: 100}}>
                                <Text>Renders</Text>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {report.missing.map(key => (
                            <tr key={key}>
                                <td style={{padding: 6, fontFamily: 'monospace'}}>{key}</td>
                                <td style={{padding: 6, textAlign: 'right'}}>{counts[key] ?? 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
