import { Global, Inject, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import IORedis from "ioredis";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

/** Opsi koneksi Redis bersama untuk ioredis & BullMQ. */
export function redisConnectionOptions(config: ConfigService) {
  return {
    host: config.getOrThrow<string>("REDIS_HOST"),
    port: config.getOrThrow<number>("REDIS_PORT"),
    password: config.get<string>("REDIS_PASSWORD") || undefined,
    // Wajib null untuk worker BullMQ
    maxRetriesPerRequest: null,
  };
}

@Injectable()
class RedisShutdown implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: IORedis) {}

  async onModuleDestroy() {
    await this.client.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new IORedis({ ...redisConnectionOptions(config), lazyConnect: false }),
    },
    RedisShutdown,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
