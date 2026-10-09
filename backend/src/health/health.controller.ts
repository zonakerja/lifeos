import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import IORedis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { ObjectStorageService } from "../storage/object-storage.service";

type CheckResult = "up" | "down";

@ApiTags("health")
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    @Inject(REDIS_CLIENT) private readonly redis: IORedis,
  ) {}

  /** Liveness: proses API hidup (tanpa cek dependensi). */
  @Get("live")
  live() {
    return { status: "ok" };
  }

  /** Readiness: database, redis, dan storage siap melayani (503 bila ada yang down). */
  @Get()
  async check() {
    const run = async (fn: () => Promise<unknown>): Promise<CheckResult> => {
      try {
        await fn();
        return "up";
      } catch {
        return "down";
      }
    };

    const [database, redis, storage] = await Promise.all([
      run(() => this.prisma.$queryRaw`SELECT 1`),
      run(() => this.redis.ping()),
      run(() => this.storage.ping()),
    ]);
    const checks = { database, redis, storage };
    const status = Object.values(checks).every((c) => c === "up") ? "ok" : "degraded";
    const body = {
      status,
      service: "lifeos-backend",
      checks,
      timestamp: new Date().toISOString(),
    };

    if (status !== "ok") throw new ServiceUnavailableException(body);
    return body;
  }
}
