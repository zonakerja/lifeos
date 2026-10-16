import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { type Express, json, text } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/filters/prisma-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService);
  const corsOrigin = config.getOrThrow<string>("CORS_ORIGIN");

  if (config.get<boolean>("TRUST_PROXY")) (app.getHttpAdapter().getInstance() as Express).set("trust proxy", 1);
  app.setGlobalPrefix("api/v1");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // Proxy tab AI ONLYOFFICE: plugin mengirim JSON tanpa Content-Type (text/plain) dan bisa memuat gambar base64
  app.use("/api/v1/office/ai/proxy", text({ type: () => true, limit: "30mb" }));
  // Batas body JSON dinaikkan untuk logo (data URL) & payload record besar
  app.use(json({ limit: "5mb" }));
  const corsOrigins = corsOrigin.split(",").map((origin) => origin.trim());
  app.enableCors((req: { url?: string }, callback: (error: Error | null, options: object) => void) => {
    // Tab AI ONLYOFFICE berjalan di iframe origin server ONLYOFFICE dan memanggil proxy AI dengan token sesi AI (bukan
    // cookie) → origin apa pun boleh, tanpa credentials. Endpoint lain tetap hanya origin aplikasi + cookie.
    if (req.url?.startsWith("/api/v1/office/ai/")) return callback(null, { origin: true, credentials: false });
    callback(null, { origin: corsOrigins, credentials: true });
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.enableShutdownHooks();

  if (config.get<string>("NODE_ENV") !== "production") {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("LifeOS API").setVersion("1.0").addBearerAuth().build(),
    );
    SwaggerModule.setup("api/docs", app, document, {
      jsonDocumentUrl: "api/docs-json",
    });
  }

  await app.listen(config.getOrThrow<number>("PORT"));
}

void bootstrap();
