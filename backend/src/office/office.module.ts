import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ExtractionModule } from "../extraction/extraction.module";
import { UploadsModule } from "../uploads/uploads.module";
import { OfficeController } from "./office.controller";
import { OfficeService } from "./office.service";

@Module({
  imports: [
    ExtractionModule,
    UploadsModule,
    // Token link berkas & callback untuk ONLYOFFICE memakai secret turunan (tidak bisa dipakai sebagai login/unduhan
    // biasa). Config editor & callback ditandatangani dengan ONLYOFFICE_JWT_SECRET (secret dikirim per panggilan).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: `${config.getOrThrow<string>("JWT_ACCESS_SECRET")}:office`,
      }),
    }),
  ],
  controllers: [OfficeController],
  providers: [OfficeService],
})
export class OfficeModule {}
