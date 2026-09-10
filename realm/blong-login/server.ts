import {realm} from '@feasibleone/blong';

export default realm(blong => {
    // Schema for one `login.methods.*` entry — a wire name (string) or `false`
    // to disable that functionality.  Shared by all methods so the union isn't
    // repeated for each one.
    const optionalMethod = () =>
        blong.type.Optional(blong.type.Union([blong.type.String(), blong.type.Literal(false)]));
    return {
        url: import.meta.url,
        validation: blong.type.Object({
            login: blong.type.Object({
                expire: blong.type.Object({
                    code: blong.type.Number(),
                    access: blong.type.Number(),
                    cookie: blong.type.Number(),
                    refresh: blong.type.Number(),
                    nonce: blong.type.Number(),
                    /** Inactivity timeout (s) — sessions idle longer are refused renewal. */
                    inactivity: blong.type.Number(),
                    /** Delete-after (s) — stale/revoked/expired sessions are purged. */
                    deleteAfter: blong.type.Number(),
                }),
                /**
                 * Wire names of the methods blong-login calls into the access realm.
                 * Defaults point at the blong-access handlers, so a suite can override
                 * them with its own implementations — or set a method to `false` to
                 * disable that functionality (lightweight suites without blong-access:
                 * e.g. `sessionCreate`/`sessionVerify`/… = false for stateless tokens,
                 * `auditRecord` = false to skip auditing).
                 */
                methods: blong.type.Optional(
                    blong.type.Object({
                        credentialCheck: optionalMethod(),
                        credentialCheckClient: optionalMethod(),
                        identityCheck: optionalMethod(),
                        permissionList: optionalMethod(),
                        sessionCreate: optionalMethod(),
                        sessionVerify: optionalMethod(),
                        sessionRestore: optionalMethod(),
                        sessionRotate: optionalMethod(),
                        sessionClose: optionalMethod(),
                        sessionCleanup: optionalMethod(),
                        auditRecord: optionalMethod(),
                    }),
                ),
                /**
                 * Restore-cookie + session settings.  `cookieName`/`cookiePath` let a
                 * suite rename/scope the opaque restore cookie; `isSecure`/`isHttpOnly`
                 * follow the defaults unless a deployment needs to relax them.
                 */
                session: blong.type.Optional(
                    blong.type.Object({
                        cookieName: blong.type.Optional(blong.type.String()),
                        cookiePath: blong.type.Optional(blong.type.String()),
                        isSecure: blong.type.Optional(blong.type.Boolean()),
                        isHttpOnly: blong.type.Optional(blong.type.Boolean()),
                    }),
                ),
                cookie: blong.type.Object({
                    encoding: blong.type.String(),
                    isSecure: blong.type.Boolean(),
                    isHttpOnly: blong.type.Boolean(),
                    clearInvalid: blong.type.Boolean(),
                    strictHeader: blong.type.Boolean(),
                }),
                keys: blong.type.Object({
                    refresh: blong.type.String(),
                    access: blong.type.Object({
                        crv: blong.type.String(),
                        x: blong.type.String(),
                        d: blong.type.String(),
                        kty: blong.type.String(),
                        kid: blong.type.String(),
                        use: blong.type.String(),
                        alg: blong.type.String(),
                    }),
                }),
            }),
        }),
        children: ['./orchestrator', './gateway'],
        config: {
            default: {
                login: {
                    expire: {
                        code: 60, // 1 minute
                        access: 15 * 60, // 15 minutes
                        cookie: 8 * 60 * 60, // 8 hours
                        refresh: 8 * 60 * 60, // 8 hours
                        nonce: 15 * 60, // 15 minute
                        inactivity: 30 * 60, // 30 minutes
                        deleteAfter: 24 * 60 * 60, // 24 hours
                    },
                    session: {
                        cookieName: 'blong.session',
                        cookiePath: '/rpc/login/token/restore',
                        isSecure: true,
                        isHttpOnly: true,
                    },
                    cookie: {
                        encoding: 'none',
                        isSecure: true,
                        isHttpOnly: true,
                        clearInvalid: false,
                        strictHeader: true,
                    },
                    keys: {
                        refresh: 'b1226b7ed6c6e5aded611ffb55a26a18154fb2263c8c2ea0974dd63e8e11919b',
                        access: {
                            crv: 'Ed25519',
                            x: 'hhcGW1iHk_YWlNYDxn7P4PGV1N6mPjghBge4O7zterQ',
                            d: 'KGpSfEzpbelEdQStQBlYmHPkHrG4cEcRx_yJZkRc_qY',
                            kty: 'OKP',
                            kid: 'kMfX1WoDc9dWVRugwGh9sSL956JS7yB8jE1ylo71Z-M',
                            use: 'sig',
                            alg: 'EdDSA',
                        },
                    },
                },
            },
            dev: {},
            microservice: {
                orchestrator: true,
                gateway: true,
            },
            integration: {},
        },
    };
});
