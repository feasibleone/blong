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
    // Record-level (ACL) refusals.  `reason` rides on `error.params.reason`
    // (`recordRequired` / `scopeRequired` / `denied` / `notFound` / `notPermitted`)
    // so a caller can branch without parsing the message.
    // A record the caller may not act on: 403 for writes, 404 for a
    // single-record read so it does not leak the record's existence.
    'acl.denied': {message: 'Not allowed to access this record', statusCode: 403},
    'acl.notFound': {message: 'Record not found', statusCode: 404},
    // The action itself is no longer permitted (revoked since the token was
    // issued) — raised by the `access.session.verify` live action check.
    'acl.notPermitted': {message: 'Not allowed to perform this action', statusCode: 403},
    // Creating a record in a scope the caller has no grant on.
    'acl.scopeDenied': {message: 'Not allowed to create a record in this scope', statusCode: 403},
    // Role bits.  A bit is the role's position in a token's permission mask, so
    // it is allocated once (`MAX(roleBit) + 1`, never reused) and never moved:
    // an explicitly requested bit that is taken, out of range, or different from
    // the one a role already owns is refused instead of being silently dropped.
    'role.bitTaken': 'Role bit {roleBit} is already used by the role {roleName}',
    'role.bitInvalid': 'Role bit {roleBit} is not a number between 0 and 1023',
    'role.bitImmutable':
        'The role bit of {roleName} is {roleBit} and cannot be changed (tokens are bound to it)',
};
