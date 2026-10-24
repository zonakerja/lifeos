import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { parseWebhook, verifySignature } from "./whatsapp-logic";
import {
  BotProfileDto,
  ContactDto,
  GroupDto,
  ReplyDto,
  SimulateDto,
  UpdateContactDto,
  UpdateGroupDto,
} from "./whatsapp.dto";
import { WhatsappService } from "./whatsapp.service";

/**
 * Webhook WhatsApp Cloud API (dipanggil server Meta, tanpa login). GET = verifikasi pendaftaran webhook, POST = pesan
 * masuk; isi mentah diverifikasi tanda tangan `X-Hub-Signature-256` (App Secret) sebelum dibaca.
 */
@ApiTags("whatsapp")
@SkipThrottle()
@Controller("whatsapp/webhook")
export class WhatsappWebhookController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get()
  @ApiExcludeEndpoint()
  verify(@Req() req: Request) {
    if (!this.whatsapp.configured) throw new NotFoundException();
    const q = req.query as Record<string, string | undefined>;
    if (q["hub.mode"] !== "subscribe" || q["hub.verify_token"] !== this.whatsapp.verifyToken) {
      throw new ForbiddenException("Verify token tidak cocok.");
    }
    return q["hub.challenge"] ?? "";
  }

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receive(@Req() req: Request, @Headers("x-hub-signature-256") signature?: string) {
    if (!this.whatsapp.configured) throw new NotFoundException();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    if (!verifySignature(raw, signature, this.whatsapp.appSecret)) {
      throw new ForbiddenException("Tanda tangan webhook tidak valid.");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return { received: 0 };
    }
    return { received: await this.whatsapp.receive(parseWebhook(payload)) };
  }
}

/** Pengelolaan bot WhatsApp oleh user: profil layanan, grup, kontak terverifikasi, percakapan, balasan manual, simulator. */
@ApiTags("whatsapp")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("whatsapp")
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    return this.whatsapp.status(user);
  }

  @Get("profile")
  profile(@CurrentUser() user: AuthUser) {
    return this.whatsapp.profile(user.id);
  }

  @Put("profile")
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: BotProfileDto) {
    return this.whatsapp.updateProfile(user.id, dto);
  }

  @Get("groups")
  groups(@CurrentUser() user: AuthUser) {
    return this.whatsapp.groups(user.id);
  }

  @Post("groups")
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: GroupDto) {
    return this.whatsapp.createGroup(user.id, dto);
  }

  @Patch("groups/:id")
  updateGroup(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateGroupDto) {
    return this.whatsapp.updateGroup(user.id, id, dto);
  }

  @Delete("groups/:id")
  removeGroup(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.whatsapp.removeGroup(user.id, id);
  }

  @Get("contacts")
  contacts(@CurrentUser() user: AuthUser) {
    return this.whatsapp.contacts(user.id);
  }

  @Post("contacts")
  createContact(@CurrentUser() user: AuthUser, @Body() dto: ContactDto) {
    return this.whatsapp.createContact(user.id, dto);
  }

  @Patch("contacts/:id")
  updateContact(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateContactDto) {
    return this.whatsapp.updateContact(user.id, id, dto);
  }

  @Delete("contacts/:id")
  removeContact(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.whatsapp.removeContact(user.id, id);
  }

  @Get("conversations")
  conversations(@CurrentUser() user: AuthUser) {
    return this.whatsapp.conversations(user.id);
  }

  @Get("conversations/:phone")
  messages(@CurrentUser() user: AuthUser, @Param("phone") phone: string) {
    return this.whatsapp.messages(user.id, phone);
  }

  @Post("conversations/:phone/reply")
  reply(@CurrentUser() user: AuthUser, @Param("phone") phone: string, @Body() dto: ReplyDto) {
    return this.whatsapp.reply(user, phone, dto);
  }

  @HttpCode(200)
  @Post("conversations/:phone/resolve")
  resolve(@CurrentUser() user: AuthUser, @Param("phone") phone: string) {
    return this.whatsapp.resolve(user.id, phone);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post("simulate")
  simulate(@CurrentUser() user: AuthUser, @Body() dto: SimulateDto) {
    return this.whatsapp.simulate(user, dto);
  }
}
