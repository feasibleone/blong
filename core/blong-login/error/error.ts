export default {
    'login.refreshTokenExpired': {
        message: 'Refresh token has expired',
        statusCode: 401,
        silent: true,
    },
    'login.invalidRefreshToken': {message: 'Invalid refresh token', statusCode: 401},
    'login.sessionNotFound': {message: 'Session not found', statusCode: 401},
    'login.sessionRevoked': {message: 'Session has been revoked', statusCode: 401},
    'login.sessionInactive': {message: 'Session is inactive', statusCode: 401},
    'login.sessionExpired': {message: 'Session has expired', statusCode: 401, silent: true},
    'login.invalidCookie': {message: 'Invalid session cookie', statusCode: 200, silent: true},
    'login.sessionRestoreFailed': {message: 'Session restore failed', statusCode: 401},
    // Login-eligibility gates — a user who is deactivated or no longer holds
    // the `accessLogin` action is refused at login and at every renewal/restore.
    'login.userInactive': {message: 'User account is inactive', statusCode: 401},
    'login.loginNotAllowed': {message: 'User is not allowed to log in', statusCode: 401},
    // Configurable-methods errors — a required `login.methods.*` entry is
    // missing/disabled in this deployment, or a session-backed operation was
    // called while session management is turned off (lightweight suites).
    'login.configurationError': {
        message: 'Login is not configured for this operation',
        statusCode: 400,
    },
};
