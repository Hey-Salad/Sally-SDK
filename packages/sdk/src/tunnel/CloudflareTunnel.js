import * as childProcess from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { TunnelRegistry } from "./TunnelRegistry.js";
export class CloudflareTunnel {
    accountId;
    apiToken;
    cloudflaredCommand;
    lifecycle;
    mode;
    quickTunnelTimeoutMs;
    registry;
    cleanupHandler;
    process;
    session;
    sessionMode;
    constructor(options = {}) {
        this.accountId = options.accountId ?? process.env.CF_ACCOUNT_ID;
        this.apiToken = options.apiToken ?? process.env.CF_API_TOKEN;
        this.cloudflaredCommand = options.cloudflaredCommand ?? "cloudflared";
        this.lifecycle = options.lifecycle ?? process;
        this.mode = options.mode ?? "auto";
        this.quickTunnelTimeoutMs = options.quickTunnelTimeoutMs ?? 15_000;
        this.registry = options.registry;
    }
    async open(options) {
        if (this.session) {
            return this.session;
        }
        const mode = this.resolveMode(options);
        const session = mode === "quick"
            ? await this.openQuickTunnel(options)
            : await this.openNamedTunnel(options);
        this.session = session;
        this.sessionMode = mode;
        this.bindCleanup();
        return session;
    }
    async close() {
        if (!this.session) {
            return;
        }
        const session = this.session;
        const mode = this.sessionMode;
        this.unbindCleanup();
        if (this.process) {
            this.process.kill("SIGTERM");
            await once(this.process, "exit");
            this.process = undefined;
        }
        if (mode === "named") {
            await this.deregister(session);
            await execFileText(this.cloudflaredCommand, ["tunnel", "delete", session.name]);
        }
        this.session = undefined;
        this.sessionMode = undefined;
    }
    async openNamedTunnel(options) {
        const name = requireValue(options.name, "name");
        const publicHostname = requireValue(options.publicHostname, "publicHostname");
        const tunnelId = await this.createTunnel(name);
        const session = {
            id: tunnelId,
            name,
            targetUrl: options.targetUrl,
            url: `https://${publicHostname}`
        };
        await execFileText(this.cloudflaredCommand, ["tunnel", "route", "dns", name, publicHostname]);
        await this.register(session);
        this.process = childProcess.spawn(this.cloudflaredCommand, ["tunnel", "run", name], {
            env: {
                ...process.env,
                CF_ACCOUNT_ID: this.requireAccountId(),
                CF_API_TOKEN: this.requireApiToken()
            },
            stdio: "pipe"
        });
        return session;
    }
    async openQuickTunnel(options) {
        const name = options.name ?? `sally-quick-${randomUUID().slice(0, 8)}`;
        const child = childProcess.spawn(this.cloudflaredCommand, ["tunnel", "--url", options.targetUrl], {
            env: {
                ...process.env
            },
            stdio: "pipe"
        });
        this.process = child;
        const url = await waitForQuickTunnelUrl(child, this.quickTunnelTimeoutMs);
        return {
            id: `quick-${randomUUID()}`,
            name,
            targetUrl: options.targetUrl,
            url
        };
    }
    bindCleanup() {
        this.cleanupHandler = () => {
            void this.close();
        };
        this.lifecycle.on("SIGINT", this.cleanupHandler);
        this.lifecycle.on("SIGTERM", this.cleanupHandler);
        this.lifecycle.on("exit", this.cleanupHandler);
    }
    unbindCleanup() {
        if (!this.cleanupHandler) {
            return;
        }
        this.lifecycle.off("SIGINT", this.cleanupHandler);
        this.lifecycle.off("SIGTERM", this.cleanupHandler);
        this.lifecycle.off("exit", this.cleanupHandler);
        this.cleanupHandler = undefined;
    }
    async createTunnel(name) {
        const output = await execFileText(this.cloudflaredCommand, ["tunnel", "create", name]);
        const tunnelId = parseTunnelId(output);
        if (!tunnelId) {
            throw new Error("Unable to parse Cloudflare tunnel id");
        }
        return tunnelId;
    }
    async register(session) {
        const registry = this.getRegistry();
        if (!registry) {
            return;
        }
        await registry.register(this.toRegistration(session));
    }
    async deregister(session) {
        const registry = this.getRegistry();
        if (!registry) {
            return;
        }
        await registry.deregister(session.id);
    }
    getRegistry() {
        if (this.registry) {
            return this.registry;
        }
        if (!this.apiToken) {
            return undefined;
        }
        this.registry = new TunnelRegistry({ apiToken: this.apiToken });
        return this.registry;
    }
    resolveMode(options) {
        const mode = options.mode ?? this.mode;
        if (mode === "quick" || mode === "named") {
            return mode;
        }
        return options.publicHostname && this.accountId && this.apiToken ? "named" : "quick";
    }
    requireAccountId() {
        return requireValue(this.accountId, "CF_ACCOUNT_ID");
    }
    requireApiToken() {
        return requireValue(this.apiToken, "CF_API_TOKEN");
    }
    toRegistration(session) {
        return {
            accountId: this.requireAccountId(),
            publicUrl: session.url,
            targetUrl: session.targetUrl,
            tunnelId: session.id,
            tunnelName: session.name
        };
    }
}
function execFileText(file, args) {
    return new Promise((resolve, reject) => {
        childProcess.execFile(file, args, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(`${stdout}${stderr}`);
        });
    });
}
function parseTunnelId(output) {
    return output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
}
function requireValue(value, name) {
    if (!value) {
        throw new Error(`Missing required value ${name}`);
    }
    return value;
}
function waitForQuickTunnelUrl(child, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Timed out waiting for Cloudflare quick tunnel URL"));
        }, timeoutMs);
        const onData = (chunk) => {
            const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
            if (match?.[0]) {
                cleanup();
                resolve(match[0]);
            }
        };
        const onExit = () => {
            cleanup();
            reject(new Error("Cloudflare quick tunnel exited before a URL was emitted"));
        };
        const cleanup = () => {
            clearTimeout(timer);
            child.stdout?.off("data", onData);
            child.stderr?.off("data", onData);
            child.off("exit", onExit);
            child.off("error", onExit);
        };
        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);
        child.once("exit", onExit);
        child.once("error", onExit);
    });
}
//# sourceMappingURL=CloudflareTunnel.js.map