import { Module } from "@nestjs/common";
import { CommentsService } from "./comments.service";
import { ShareAccessService } from "./share-access.service";
import { CommentsController, SharesController } from "./sharing.controller";
import { SharesService } from "./shares.service";

/** Berbagi item antar-user + komentar. `ShareAccessService` dipakai records & uploads untuk memeriksa akses. */
@Module({
  controllers: [SharesController, CommentsController],
  providers: [ShareAccessService, SharesService, CommentsService],
  exports: [ShareAccessService],
})
export class SharingModule {}
