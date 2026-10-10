import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ConfigService } from "@nestjs/config";
import type { Params } from "nestjs-pino";

/**
 * Log terstruktur (pino):
 * - production: JSON satu baris per event (siap dikumpulkan Docker/Loki/ELK);
 * - development: format mudah dibaca (pino-pretty).
 * Setiap request punya `reqId` (dari header X-Request-Id atau dibuat baru) yang juga
 * dikirim balik di respons. Header sensitif (Authorization, Cookie, Set-Cookie) disensor.
 */
export function loggerConfig(config: ConfigService): Params {
  const production = config.get<string>("NODE_ENV") === "production";
  return {
    pinoHttp: {
      level: config.get<string>("LOG_LEVEL") ?? (production ? "info" : "debug"),
      transport: production ? undefined : { target: "pino-pretty", options: { singleLine: true, colorize: true } },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const header = req.headers["x-request-id"];
        const id = typeof header === "string" && header.length <= 100 ? header : randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]', "req.query.token"],
        censor: "[redacted]",
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          // Token unduhan di query string tidak ikut tercatat
          url: req.url.replace(/token=[^&]+/, "token=[redacted]"),
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      // Health check dipanggil berkala oleh Docker/monitoring → tidak perlu dicatat
      autoLogging: { ignore: (req) => req.url?.startsWith("/api/v1/health") ?? false },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    },
  };
}
