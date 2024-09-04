import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Config } from "~/packages/config-manager/config.type";
import type { HonoEnv } from "~/types/api";
import { debugResponse } from "./api";

export const createServer = (config: Config, app: OpenAPIHono<HonoEnv>) =>
    Bun.serve({
        port: config.http.bind_port,
        reusePort: true,
        tls: config.http.tls.enabled
            ? {
                  key: Bun.file(config.http.tls.key),
                  cert: Bun.file(config.http.tls.cert),
                  passphrase: config.http.tls.passphrase,
                  ca: config.http.tls.ca
                      ? Bun.file(config.http.tls.ca)
                      : undefined,
              }
            : undefined,
        hostname: config.http.bind || "0.0.0.0", // defaults to "0.0.0.0"
        async fetch(req, server) {
            const output = await app.fetch(req, { ip: server.requestIP(req) });

            if (config.logging.log_responses) {
                await debugResponse(output.clone());
            }

            return output;
        },
    });
