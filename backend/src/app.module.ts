import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { validateEnv } from "./config/env.validation";
import { loggerConfig } from "./config/logger.config";
import { ExtractionModule } from "./extraction/extraction.module";
import { HealthModule } from "./health/health.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { NotebooksModule } from "./notebooks/notebooks.module";
import { OfficeModule } from "./office/office.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RecordsModule } from "./records/records.module";
import { RedisModule } from "./redis/redis.module";
import { SettingsModule } from "./settings/settings.module";
import { SharingModule } from "./sharing/sharing.module";
import { ObjectStorageModule } from "./storage/object-storage.module";
import { UploadsModule } from "./uploads/uploads.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({ inject: [ConfigService], useFactory: loggerConfig }),
    // Default longgar; endpoint sensitif (login) memakai @Throttle lebih ketat
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    RedisModule,
    ObjectStorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    SharingModule,
    RecordsModule,
    ExtractionModule,
    UploadsModule,
    AiModule,
    KnowledgeModule,
    NotebooksModule,
    OfficeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
