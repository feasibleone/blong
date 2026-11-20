/**
 * The framework's own signals — what blong reports while it loads, watches and serves.
 *
 * These are the lines `core/blong-gogo` used to write through `this.log?.info?.(…)` and now declares,
 * for the reason a level call stopped being the right shape: a level names *how loud* a line is, and a
 * declared identifier names *what happened*. An operator raising `frameworkWatchFileChanged` to debug
 * is a statement about the watcher's file events; raising `info` to `debug` is a statement about
 * everything, which is what made tuning a framework run impossible without silencing it.
 *
 * ## What belongs here, and what does not
 *
 * Only what the *framework* reports: its lifecycle, its watch events, its gateway key resolution. A
 * realm's signals belong in that realm's own `lukaot/` layer, because they are that realm's promises to
 * its operators. The split is the one the plan draws, and it is what keeps this file small enough to
 * read in one sitting — the framework's own vocabulary is a few dozen identifiers, not a catalogue of
 * everything any process may say.
 *
 * ## The messages are the ones the code already wrote
 *
 * Every message below is the sentence that was already on the line, with its variable parts turned into
 * `{placeholders}` and supplied by the call. Nothing is reworded: a run's log history stays searchable,
 * and a reader comparing an old log with a new one sees the same sentence with a name in front of it.
 */

import {createRegistry, declare, type SignalRegistry} from '@feasibleone/lukaot';

const vocabulary = declare({
    log: {
        /** A file in a handler group folder exported nothing — usually a shared module put there. */
        frameworkSourceEmpty: {
            level: 'error',
            message:
                'error loading {file}: probably a generic source code was put in a handler group folder',
        },
        /** The file watcher reported an error; the run continues without that watch. */
        frameworkWatchFailed: {level: 'error', message: 'file watch failed: {error}'},
        /** A watched file changed, and the event named it. */
        frameworkWatchFileChanged: {
            level: 'info',
            message: '{file}',
            mtid: 'event',
            // The event name is the watcher's, so the declaration interpolates it like a message value.
            method: 'watch.reload.{event}',
        },
        /** A watched file changed and reloading it failed. */
        frameworkWatchReloadFailed: {level: 'error', message: 'reloading {file} failed: {error}'},
        /** The watcher started, and these are the folders it is watching. */
        frameworkWatchStarted: {
            level: 'debug',
            message: 'watching {folders}',
            mtid: 'event',
            method: 'watch.start',
        },
        /** The platform declared no test groups, so a test run had nothing to do. */
        frameworkWatchNoTests: {
            level: 'info',
            message: 'no test groups configured on this platform; nothing to run',
            mtid: 'event',
            // The readiness anchor a spawn test waits on, so its header fields matter: a line that
            // lost them would still read, and the test would still pass, but an operator reading the
            // log would no longer know which stage produced it.
            method: 'watch.test.none',
        },
        /** A test group failed, and the run reports it rather than leaving the wait silent. */
        frameworkTestGroupFailed: {level: 'error', message: 'test group failed: {error}'},
        /** The report session could not be closed, so the results are not published. */
        frameworkAllureSessionFailed: {
            level: 'error',
            message: 'closing the report session failed: {error}',
        },
        /** Config was reloaded; `changed` names the keys that moved. */
        frameworkConfigReloaded: {
            level: 'info',
            message: 'config reloaded: {changed}',
            mtid: 'event',
            method: 'watch.config.reload',
        },
        /** A config change arrived and there is nothing to apply it to. */
        frameworkConfigDetached: {
            level: 'warn',
            message: 'ConfigRuntime not attached; config change ignored',
            mtid: 'event',
            method: 'watch.config.reload',
        },
        /** Reloading a module after a config change failed. */
        frameworkConfigReloadFailed: {level: 'error', message: 'config reload failed: {error}'},
        /**
         * An error definition was registered in a way the factory cannot honour, which used to be
         * written as a `deprecation` notice: the sentence is the caller's, the method names the
         * registration it came from, and the offending definition travels as a param.
         */
        frameworkErrorDeprecated: {
            level: 'warn',
            mtid: 'deprecation',
            method: '{method}',
            message: '{reason}',
        },
        /** A port answered a method it does not hold. */
        frameworkAdapterMethodNotFound: {
            level: 'warn',
            message: '{namespace} has no method {method}',
        },
        /**
         * A port recorded a failure — the identity every record `AdapterBase.error()` writes is
         * counted under (`@@T-731`).
         *
         * The record is the port's own shape rather than this template, because it carries the error
         * object itself: `err` is the slot the printer reads the message and stack from, and the
         * declared kind has nowhere to put one. So the declaration is the *identity* — what an
         * operator filters with `blong-dev log --signal` and what the service counts — while the
         * sentence is the one the failure already has, and `type`, `method` and `statusCode` ride
         * beside it as fields.
         */
        frameworkPortFailure: {
            level: 'error',
            message: '{type} failed in {method}',
        },
        /** A connection's database did not exist and was created. */
        frameworkDbDatabaseCreated: {
            level: 'info',
            message: 'created missing database {database}',
        },
        /** The database could not be created; schema sync will report the real failure. */
        frameworkDbDatabaseCreateFailed: {
            level: 'warn',
            message: 'could not auto-create database — will continue: {error}',
        },
        /** An ordering term named a column the result does not have, so it was ignored. */
        frameworkDbOrderColumnIgnored: {
            level: 'warn',
            message: 'ignoring order by {column}: no such column on {table}',
            mtid: 'event',
            method: '{subject}.{object}.find',
        },
        /** A query asked for an operation the adapter does not implement. */
        frameworkDbOperationMissing: {
            level: 'warn',
            message: "no operation for '{operation}'",
            mtid: 'event',
            method: '{method}',
        },
        /** An asset is being read into the deployment. */
        frameworkAssetProcessing: {
            level: 'debug',
            message: 'processing asset {name} at {path}',
            mtid: 'event',
            method: '{method}',
        },
        /** A port started, or finished starting. */
        frameworkAdapterStarted: {level: 'info', message: '{id} started'},
        /** A port stopped. */
        frameworkAdapterStopped: {level: 'info', message: '{id} stopped'},
        /** A gateway resolved or failed to resolve the key it answers with. */
        frameworkGatewayKeyResolved: {
            level: 'debug',
            message: '{usage} key resolved from {source}',
        },
        /** A gateway could not resolve a key and is answering without it. */
        frameworkGatewayKeyMissing: {level: 'warn', message: 'no {usage} key: {reason}'},
        /** A remote call was expected to resolve locally and nothing holds that name. */
        frameworkRemoteMethodNotFound: {
            level: 'warn',
            message: "remote method not found locally: '{method}'",
            mtid: 'event',
            method: 'remote.methodNotFound',
        },
        /** A `remote.canSkipSocket` setting is not a regular expression, so it is ignored. */
        frameworkRemoteSkipPatternInvalid: {
            level: 'warn',
            message: 'canSkipSocket is not a regular expression: {pattern} ({error})',
            mtid: 'event',
            method: 'remote.canSkipSocket',
        },
        /** The introspection endpoints are on, which a released process must never do. */
        frameworkDebugEnabled: {
            level: 'warn',
            message:
                'systemDebug is enabled — introspection endpoints are active; do not enable in production',
        },
        /** An API schema file is being written over the one it generated before. */
        frameworkSchemaFileRewritten: {level: 'warn', message: 'writing {file}'},
        /** An orchestrator folder is being read for API schema generation. */
        frameworkSchemaDirScanning: {level: 'info', message: 'generating dir {dir}'},
        /** MCP was asked for and no remote dispatcher is available, so it is skipped. */
        frameworkMcpUnavailable: {
            level: 'warn',
            message: 'mcp is enabled but no remote dispatcher is available; skipping',
        },
        /** A report was asked for on a platform that cannot write its files. */
        frameworkAllureUnwritable: {level: 'warn', message: '{reason}'},
        /** The report session failed, so the run continues without one. */
        frameworkAllureFailed: {level: 'error', message: 'allure reporting failed: {error}'},
        /** One group's result could not be written into the report. */
        frameworkAllureGroupFailed: {
            level: 'error',
            message: 'writing a group result failed: {error}',
        },
        /** The Slack port read the accounts it was configured with. */
        frameworkSlackAccountsRead: {
            level: 'info',
            message: 'slack port read its accounts',
        },
        /** The account store answered nothing usable, so the port kept what it had. */
        frameworkSlackAccountsUnreadable: {
            level: 'warn',
            message: 'the stored accounts could not be read: {error}',
        },
        /** The configuration token is due for renewal and no store could keep the replacement. */
        frameworkSlackTokenNotSavable: {
            level: 'warn',
            message:
                'the configuration token is due for renewal, but no account store can keep the ' +
                'replacement, so it was left as it is',
        },
        /** The platform refused to renew the configuration token. */
        frameworkSlackTokenNotRenewed: {
            level: 'warn',
            message: 'the configuration token was not renewed: {reason}',
        },
        /** The renewed token could not be written to the account store. */
        frameworkSlackTokenUnsaved: {
            level: 'warn',
            message: 'the renewed configuration token could not be stored: {error}',
        },
        /** The configuration token was renewed and stored. */
        frameworkSlackTokenRenewed: {
            level: 'info',
            message: 'slack configuration token renewed',
        },
        /** Renewing the token threw. */
        frameworkSlackTokenRenewFailed: {
            level: 'warn',
            message: 'the token renewal failed: {error}',
        },
        /** An account has no public address, so no Slack app was created for it. */
        frameworkSlackNoPublicAddress: {
            level: 'warn',
            message: 'no public address publishes this port, so no Slack app was created',
        },
        /** The platform answered the app creation with an error. */
        frameworkSlackAppNotCreated: {
            level: 'warn',
            message: 'the Slack app was not created: {reason}',
        },
        /** The app creation answered without an app id. */
        frameworkSlackAppNoId: {
            level: 'warn',
            message: 'the Slack app creation answered no app id',
        },
        /** The created app could not be written to the account store. */
        frameworkSlackAppUnsaved: {
            level: 'warn',
            message: 'the created Slack app could not be stored: {error}',
        },
        /** An app was created for this account. */
        frameworkSlackAppCreated: {
            level: 'info',
            message: 'slack app was created',
        },
        /** Creating the app threw. */
        frameworkSlackAppCreateFailed: {
            level: 'warn',
            message: 'the Slack app creation failed: {error}',
        },
        /** The platform refused `auth.test` for this account. */
        frameworkSlackAuthFailed: {
            level: 'warn',
            message: 'auth.test failed: {reason}',
        },
        /** An account has no public address, so its app was left pointing where it was. */
        frameworkSlackAppLeftAsWas: {
            level: 'warn',
            message: 'no public address publishes this port, so the Slack app was left as it was',
        },
        /** The public address exists and does not answer yet. */
        frameworkSlackPublicUrlSilent: {
            level: 'warn',
            message: 'the public address does not answer yet: {error}',
        },
        /** The app's manifest could not be read from the platform. */
        frameworkSlackManifestUnreadable: {
            level: 'warn',
            message: 'the manifest could not be read: {reason}',
        },
        /** The app already points at its public address and reads its messages. */
        frameworkSlackAppAlreadyPointed: {
            level: 'info',
            message: 'slack app already points at its public address and reads its messages',
        },
        /** The platform refused the manifest update. */
        frameworkSlackManifestRefused: {
            level: 'warn',
            message: 'the manifest was refused: {reason}',
        },
        /** The app now points at its public address and reads its messages. */
        frameworkSlackAppPointed: {
            level: 'info',
            message: 'slack app points at its public address and reads its messages',
        },
        /** Updating the manifest threw. */
        frameworkSlackManifestUpdateFailed: {
            level: 'warn',
            message: 'the manifest update failed: {error}',
        },
        /** A topic read did not answer within its budget. */
        frameworkKafkaTopicTimeout: {level: 'warn', message: 'kafka topic read timed out'},
        /** A topic read failed. */
        frameworkKafkaTopicFailed: {level: 'warn', message: 'kafka topic read failed: {error}'},
        /** A topic read returned. */
        frameworkKafkaTopicRead: {level: 'info', message: 'kafka topic read'},
        /** The consumer is being created for this group. */
        frameworkKafkaConsumerCreating: {level: 'info', message: 'kafka consumer creating'},
        /** The consumer was given its partitions. */
        frameworkKafkaConsumerAssigned: {level: 'info', message: 'kafka consumer assigned'},
        /** The consumer waited past its session timeout for an assignment. */
        frameworkKafkaAssignmentTimedOut: {
            level: 'warn',
            message: 'kafka consumer assignment timed out',
        },
        /** The consumer was already connected, so it was not connected again. */
        frameworkKafkaConsumerConnected: {
            level: 'info',
            message: 'kafka consumer already connected',
        },
        /** The consumer is connecting and the caller has to wait for it. */
        frameworkKafkaConsumerConnecting: {
            level: 'info',
            message: 'kafka consumer connecting, waiting for ready',
        },
        /** The consumer is ready and can poll. */
        frameworkKafkaConsumerReady: {level: 'info', message: 'kafka consumer ready'},
        /** The adapter is stopping. */
        frameworkKafkaStop: {level: 'info', message: 'kafka adapter stop'},
        /** Closing the consumer or producer exceeded its budget. */
        frameworkKafkaCloseTimedOut: {level: 'warn', message: 'kafka close timed out'},
        /** The consumer and producer closed and the group was left. */
        frameworkKafkaClosed: {
            level: 'info',
            message: 'kafka consumer/producer closed (LeaveGroup sent)',
        },
        /** The adapter finished stopping. */
        frameworkKafkaStopComplete: {level: 'info', message: 'kafka adapter stop complete'},
        /** The process is shutting down. */
        frameworkShutdownStarting: {level: 'info', message: 'shutting down'},
        /** A graceful shutdown failed and the process is exiting anyway. */
        frameworkShutdownFailed: {level: 'error', message: 'graceful shutdown failed: {error}'},
        /** A TCP port is at its connection limit and has to drop one. */
        frameworkTcpConnectionLimit: {
            level: 'warn',
            message:
                'connection limit exceeded (max {maxConnections}); closing the {policy} connection',
        },
        /** Fetching the report a port serves threw. */
        frameworkS3ReportFetchFailed: {
            level: 'error',
            message: 'error fetching the report from {url}: {error}',
        },
        /** A message read off a subscribe channel did not dispatch. */
        frameworkRedisDispatchFailed: {
            level: 'warn',
            message: 'a message on {channel} did not dispatch: {error}',
        },
        /** A notify channel could not be subscribed; the wake is skipped, not the realm. */
        frameworkRedisSubscribeFailed: {
            level: 'warn',
            message: 'redis notify channel {channel} not subscribed: {error}',
        },
        /** A Viber send answered a status other than success. */
        frameworkViberSendRefused: {
            level: 'warn',
            message: 'viber sent to {account} answered status {status}: {reason}',
        },
        /** Sending a Viber message threw. */
        frameworkViberSendFailed: {
            level: 'warn',
            message: 'sending a viber message failed: {error}',
        },
        /** An inbound Slack request names an app and client no account declares. */
        frameworkSlackRequestAccountMissing: {
            level: 'warn',
            message:
                'the request names app {appId} and client {clientId}, which no account declares',
        },
        /** A webhook was acked while its detached destination is still running. */
        frameworkWebhookDestinationSlow: {
            level: 'debug',
            message: 'the webhook was acked and its destination is still running',
        },
        /** A detached destination failed after the webhook had been acked. */
        frameworkWebhookDestinationFailed: {
            level: 'warn',
            message: 'the webhook destination failed after the ack: {error}',
        },
        /** The webhook handler threw and the platform is answered with its status. */
        frameworkWebhookHandlerFailed: {
            level: 'warn',
            message: 'the webhook handler threw: {error}',
        },
        /** A stream's `disconnected` event failed. */
        frameworkLoopDisconnectedFailed: {
            level: 'error',
            message: 'the disconnected event failed: {error}',
        },
        /** `auth.test` could not be reached, so a token's validity is unknown. */
        frameworkSlackAuthUnreachable: {
            level: 'warn',
            message: 'auth.test could not be reached: {error}',
        },
        /** The second accounts pass, after a store answered nothing, failed. */
        frameworkSlackStoreRetryFailed: {
            level: 'warn',
            message: 'the second accounts pass failed: {error}',
        },
        /** A scheduled maintenance pass failed. */
        frameworkSlackMaintainFailed: {
            level: 'warn',
            message: 'the maintenance pass failed: {error}',
        },
    },
    /**
     * The payloads the framework can capture, declared rather than written as a dump (`@@T-730`).
     *
     * A capture is not a signal: its sentence is a note, and what it records is the rendered shape at
     * a rung the configuration chooses. They are declared here for the same reason a signal is — so an
     * operator can name one, raise its rung and switch it off, without the port changing a line.
     */
    capture: {
        /** An HTTP exchange, one half per call: `line` → `headers` → `body` → `full`. */
        frameworkHttpExchange: {
            enabled: false,
            shape: 'http.exchange',
            level: 'line',
            message: 'http exchange',
        },
        /** A frame on a wire: `line` → `hex` → `full`. */
        frameworkTcpFrame: {
            enabled: false,
            shape: 'tcp.frame',
            level: 'line',
            message: 'tcp frame',
        },
        /** A JSON document — an event object, a protocol body: `line` → `keys` → `body`. */
        frameworkJsonPayload: {
            enabled: false,
            shape: 'json',
            level: 'keys',
            message: 'json payload',
        },
    },
});

/**
 * The one registry the framework's vocabulary lives in.
 *
 * One, not one per component: the identifiers, the policy, the counters and the recorded sites are
 * properties of the *process*, and a component that had its own copy would fragment the answer to
 * "which declared signals did this process reach, and from where". A component writes through a child
 * view over this registry instead — the same shape as `logger.child({name})`, where the context belongs
 * to the binding rather than to the vocabulary.
 */
let registry: SignalRegistry | undefined;

export function frameworkSignalRegistry(): SignalRegistry {
    return (registry ??= createRegistry(vocabulary));
}

export default vocabulary;
