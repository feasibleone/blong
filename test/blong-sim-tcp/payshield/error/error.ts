/**
 * Error definitions for the payshield realm.
 * These errors are thrown by HSM operations when the device reports errors.
 */
export default {
    'ctp.hsm': 'HSM generic',
    'ctp.hsm.notConnected': 'No connection to HSM',
    'ctp.hsm.timeout': 'HSM timed out',
    'ctp.hsm.missingParameters': 'Missing parameters',
    'ctp.hsm.invalidParameters': 'Invalid parameters',
    'ctp.hsm.badArqcMethod': 'Bad ARQC method',
};
