import got from 'got';

/**
 * The tunnel that publishes this process, asked of the agent that runs it.
 *
 * An ngrok hostname changes between runs, and both platforms that need it — Slack for its two request
 * URLs, Viber for `set_webhook` — need the *current* one. The agent already knows it: its status API
 * lists the tunnels it forwards, each with the local address it points at, so the port asks for the
 * tunnel whose `config.addr` names its own listening port. That is what `ngrokUrl` in an rc file was
 * for; naming one is now an override for an agent that is somewhere else, or a fixed hostname.
 */
export interface INgrokTunnel {
    public_url?: string;
    proto?: string;
    name?: string;
    config?: {addr?: string};
}

export interface INgrokTunnels {
    tunnels?: INgrokTunnel[];
}

/** Where the agent answers by default; a second agent on the same machine is on 4041. */
export const NGROK_AGENT_URL = 'http://127.0.0.1:4040/api/tunnels';

/** The port an ngrok `config.addr` names: `http://localhost:8095`, `localhost:8095` or `8095`. */
const addrPort = (addr: string | undefined): number | undefined => {
    const match = /(\d+)\/*$/.exec(addr ?? '');
    return match ? Number(match[1]) : undefined;
};

/**
 * The public base of the tunnel that forwards to one local port.
 *
 * `https` wins when both protocols forward the same port, because Slack refuses an `http` request URL
 * and Viber rejects it in production. A tunnel for another port is ignored: a machine often runs two,
 * one per listener, and picking the wrong one points a platform at the other process.
 */
export const ngrokPublicUrl = (
    tunnels: INgrokTunnels | undefined,
    listenerPort: number | undefined,
): string | undefined => {
    const found = (tunnels?.tunnels ?? []).filter(
        tunnel =>
            tunnel.public_url &&
            listenerPort !== undefined &&
            addrPort(tunnel.config?.addr) === listenerPort,
    );
    const chosen = found.find(tunnel => tunnel.proto === 'https') ?? found[0];
    return chosen?.public_url?.replace(/\/+$/, '');
};

/** What the agent says it is forwarding, or `undefined` when nothing answers on that address. */
export const ngrokTunnelsGet = async (
    agentUrl = NGROK_AGENT_URL,
): Promise<INgrokTunnels | undefined> => {
    try {
        const answer = await got.get(agentUrl, {
            responseType: 'json',
            throwHttpErrors: false,
            timeout: {request: 3000},
        });
        const body = answer.body as INgrokTunnels | undefined;
        return body && Array.isArray(body.tunnels) ? body : undefined;
    } catch {
        return undefined;
    }
};
