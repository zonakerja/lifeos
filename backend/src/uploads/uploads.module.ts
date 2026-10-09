import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { MulterModule } from "@nestjs/platform-express";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diskStorage } from "multer";
import { ExtractionModule } from "../extraction/extraction.module";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [
    ExtractionModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Berkas ditulis ke disk sementara lalu di-stream ke object storage (hemat RAM)
        storage: diskStorage({ destination: join(tmpdir(), "lifeos-uploads") }),
        limits: {
          fileSize: config.getOrThrow<number>("UPLOAD_MAX_MB") * 1024 * 1024,
        },
      }),
    }),
    // Token unduhan memakai secret turunan (berbeda dari access token agar tidak bisa dipakai sebagai login)
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: `${config.getOrThrow<string>("JWT_ACCESS_SECRET")}:download`,
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
