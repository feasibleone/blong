/**
 * Unit tests for {@link reportProcessWarnings} in runServer.ts.
 *
 * `process.emitWarning` is real and process-wide, so each test installs the reporter through its
 * injected log face and unsubscribes before it ends — a listener left behind would write into the
 * next test's records. Node emits the `warning` event after the current tick, hence the `setImmediate`
 * before every assertion.
 */

import type {ILog} from '@feasibleone/blong/types';
import {test} from 'tap';

import {reportProcessWarnings} from './runServer.ts';

interface IRecord {
    level: string;
    fields: {signal?: string; params?: Record<string, unknown>};
    message: string;
}

function captureLog(records: IRecord[], warnThrows?: boolean): ILog {
    const line = (level: string) => (fields: IRecord['fields'], message: string) => {
        records.push({level, fields, message});
        if (warnThrows) throw new Error('the destination refused this one too');
    };
    return {logger: () => ({warn: line('warn'), error: line('error')})} as unknown as ILog;
}

test('a destination that refused a batch is reported at error level', async t => {
    const records: IRecord[] = [];
    const stop = reportProcessWarnings(captureLog(records));
    try {
        process.emitWarning('the log destination refused a batch', {code: 'BLONG_LOG_DESTINATION'});
        await new Promise(resolve => setImmediate(resolve));
    } finally {
        stop();
    }

    t.equal(records.length, 1, 'one warning, one record');
    t.equal(
        records[0].fields.signal,
        'frameworkLogDestinationFailed',
        'under the identifier the declaration gives error level',
    );
    t.equal(records[0].level, 'error', 'and written at error level, not as a caution');
    t.same(
        records[0].fields.params,
        {
            name: 'Warning',
            code: 'BLONG_LOG_DESTINATION',
            message: 'the log destination refused a batch',
        },
        'the warning its code, its message and its name',
    );
    t.match(records[0].message, /the log destination refused a batch/, 'the message survives');
});

test('a warning without a code still reads as one', async t => {
    const records: IRecord[] = [];
    const stop = reportProcessWarnings(captureLog(records));
    try {
        process.emitWarning('a plain warning');
        await new Promise(resolve => setImmediate(resolve));
    } finally {
        stop();
    }

    t.equal(records[0].fields.params?.code, 'no-code', 'a missing code is named rather than blank');
    t.equal(
        records[0].fields.signal,
        'frameworkProcessWarning',
        'and an ordinary runtime warning stays a warning',
    );
    t.equal(records[0].level, 'warn', 'written at warn level');
});

test('a reporter that cannot write a record is not fed by its own failure', async t => {
    const records: IRecord[] = [];
    const stop = reportProcessWarnings(captureLog(records, true));
    try {
        t.doesNotThrow(
            () => process.emitWarning('one warning', {code: 'FIRST'}),
            'a throwing destination does not reach the caller',
        );
        await new Promise(resolve => setImmediate(resolve));
    } finally {
        stop();
    }

    t.equal(records.length, 1, 'the failure was not retried, so it cannot loop');
});

test('a sink that warns while its record is written is not heard by the reporter', async t => {
    // The log destination is this sink: `createUdpWriter` raises `BLONG_LOG_DESTINATION` from inside a
    // write, and a warning arrives on the next tick — after the record that caused it was written. A
    // guard that only covered the call would let the reporter write another record into the same broken
    // destination, turn after turn, forever.
    const records: IRecord[] = [];
    const line = (level: string) => (fields: IRecord['fields'], message: string) => {
        records.push({level, fields, message});
        process.emitWarning('the destination refused this batch', {code: 'BLONG_LOG_DESTINATION'});
        // A safety net for this test rather than for the product: without the guard the count grows
        // instead of hanging the runner.
        if (records.length > 20) throw new Error('the reporter is feeding itself');
    };
    const log = {
        logger: () => ({warn: line('warn'), error: line('error')}),
    } as unknown as ILog;
    const stop = reportProcessWarnings(log);
    try {
        process.emitWarning('one warning', {code: 'FIRST'});
        await new Promise(resolve => setTimeout(resolve, 20));
    } finally {
        stop();
    }

    t.equal(records.length, 1, 'one record, and the reporter stopped listening for that turn');
});

test('the process reports its warnings once, whatever it was handed', async t => {
    const records: IRecord[] = [];
    const before = process.listenerCount('warning');
    const first = reportProcessWarnings(captureLog(records));
    const second = reportProcessWarnings(captureLog(records));
    t.equal(process.listenerCount('warning'), before + 1, 'the second install added no listener');

    second();
    process.emitWarning('still reported', {code: 'SECOND'});
    await new Promise(resolve => setImmediate(resolve));
    first();

    t.equal(records.length, 1, 'the surviving reporter wrote the warning');
    t.equal(process.listenerCount('warning'), before, 'unsubscribing restores the count');
});

test('a process whose log never arrived reports nothing and stays quiet', async t => {
    const before = process.listenerCount('warning');
    const stop = reportProcessWarnings(undefined);
    t.equal(process.listenerCount('warning'), before, 'no listener without a log');
    t.doesNotThrow(() => stop(), 'unsubscribing is harmless');
});
