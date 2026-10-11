import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../generated/prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/types/auth-user";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(UserRole.super_admin, UserRole.admin)
  @Get()
  findAll() {
    return this.users.findAll();
  }

  /** Statistik pemakaian per user (jumlah data & berkas) — tanpa isi data. */
  @Roles(UserRole.super_admin, UserRole.admin)
  @Get("stats")
  stats() {
    return this.users.stats();
  }

  /** Cari akun untuk dibagikan item (semua user login; min. 3 huruf, maks. 8 hasil, hanya nama & email). */
  @Get("directory")
  directory(@Query("q") q: string | undefined, @CurrentUser() user: AuthUser) {
    return this.users.directory(q ?? "", user);
  }

  @Roles(UserRole.super_admin, UserRole.admin)
  @Get(":id")
  findById(@Param("id") id: string) {
    return this.users.findById(id);
  }

  @Roles(UserRole.super_admin, UserRole.admin)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(dto, user);
  }

  @Roles(UserRole.super_admin, UserRole.admin)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.update(id, dto, user);
  }

  @Roles(UserRole.super_admin, UserRole.admin)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.users.remove(id, user);
  }
}
