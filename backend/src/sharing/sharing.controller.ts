import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { CommentsService } from "./comments.service";
import {
  CommentTargetQueryDto,
  CreateCommentDto,
  CreateShareDto,
  ShareTargetQueryDto,
  UpdateCommentDto,
  UpdateShareDto,
} from "./dto/sharing.dto";
import { SharesService } from "./shares.service";

@ApiTags("shares")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("shares")
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  /** Penerima satu item milik sendiri (`?recordType=&recordId=`). */
  @Get()
  listForItem(@Query() query: ShareTargetQueryDto, @CurrentUser() user: AuthUser) {
    return this.shares.listForItem(user, query);
  }

  @Get("outgoing")
  outgoing(@CurrentUser() user: AuthUser) {
    return this.shares.outgoing(user);
  }

  @Get("incoming")
  incoming(@CurrentUser() user: AuthUser) {
    return this.shares.incoming(user);
  }

  @Post()
  create(@Body() dto: CreateShareDto, @CurrentUser() user: AuthUser) {
    return this.shares.create(user, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateShareDto, @CurrentUser() user: AuthUser) {
    return this.shares.update(user, id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.shares.remove(user, id);
  }
}

@ApiTags("comments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("comments")
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(@Query() query: CommentTargetQueryDto, @CurrentUser() user: AuthUser) {
    return this.comments.list(user, query);
  }

  @Post()
  create(@Body() dto: CreateCommentDto, @CurrentUser() user: AuthUser) {
    return this.comments.create(user, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCommentDto, @CurrentUser() user: AuthUser) {
    return this.comments.update(user, id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.comments.remove(user, id);
  }
}
