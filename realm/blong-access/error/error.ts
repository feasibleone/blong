export default {
    'credentials.mismatch': 'Credentials do not match',
    // Self-service profile password change — the supplied current password does
    // not match the active credential. 401 so the UI treats it as a re-auth signal.
    'profile.wrongPassword': {message: 'Current password is incorrect', statusCode: 401},
    'user.notFound': 'User not found',
    'user.inactive': 'User account is inactive',
    'credential.notFound': 'Active credential not found for user',
    'application.notFound': 'Application not found',
    'application.inactive': 'Application is inactive',
    'account.exists': 'Account with email {emailAddress} already exists',
    'account.invalidEmail': 'Invalid email address',
    'account.weakPassword': 'Password must be at least {minLength} characters',
    'account.invalidGoogleToken': 'Invalid Google token',
    // Session verification errors — thrown by `access.session.verify`. All are
    // auth-classified (401) so the UI treats an invalid session as a re-login
    // signal; the specific reason rides on `error.params.reason`.
    'session.notFound': {message: 'Session not found', statusCode: 401},
    'session.revoked': {message: 'Session has been revoked', statusCode: 401},
    'session.expired': {message: 'Session has expired', statusCode: 401},
    'session.inactive': {message: 'Session is inactive', statusCode: 401},
    // Login-eligibility on the session gate — the session's user has been
    // deactivated, or its roles no longer grant the `accessLogin` action.
    'session.userInactive': {message: 'User account is inactive', statusCode: 401},
    'session.loginNotAllowed': {message: 'User is not allowed to log in', statusCode: 401},
    // Closing a session that is not the caller's own without the
    // `access.session.close` permission.
    'session.closeForbidden': {message: 'Not allowed to close this session', statusCode: 403},
};
