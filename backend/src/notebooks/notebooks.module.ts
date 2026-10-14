import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { UploadsModule } from "../uploads/uploads.module";
import { NotebooksController } from "./notebooks.controller";
import { NotebooksService } from "./notebooks.service";

@Module({
  imports: [AiModule, UploadsModule],
  controllers: [NotebooksController],
  providers: [NotebooksService],
})
export class NotebooksModule {}
