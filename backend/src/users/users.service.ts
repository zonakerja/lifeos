import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "../generated/prisma/client";
import { hash } from "@node-rs/argon2";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { toPublicUser } from "./user.mapper";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
    });
    return users.map((user) => toPublicUser(user));
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User tidak ditemukan.");
    return toPublicUser(user);
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    this.ensureCanAssignRole(actor, dto.role);
    await this.ensureEmailAvailable(dto.email);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash: await hash(dto.password),
        role: dto.role,
        phone: dto.phone,
        address: dto.address,
      },
    });
    return toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const target = await this.findById(id);
    this.ensureCanManage(actor, target.role);
    if (dto.role) this.ensureCanAssignRole(actor, dto.role);
    if (dto.email) await this.ensureEmailAvailable(dto.email, id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email?.toLowerCase(),
        role: dto.role,
        phone: dto.phone,
        address: dto.address,
        passwordHash: dto.password ? await hash(dto.password) : undefined,
      },
    });
    // Password/role berubah → paksa login ulang di semua perangkat user tersebut
    if (dto.password || (dto.role && dto.role !== target.role)) {
      await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    }
    return toPublicUser(user);
  }

  async remove(id: string, actor: AuthUser) {
    if (id === actor.id) throw new BadRequestException("Tidak dapat menghapus akun Anda sendiri.");
    const target = await this.findById(id);
    this.ensureCanManage(actor, target.role);
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  /** Admin (bukan super admin) tidak boleh mengelola akun super admin. */
  private ensureCanManage(actor: AuthUser, targetRole: UserRole) {
    if (actor.role !== UserRole.super_admin && targetRole === UserRole.super_admin) {
      throw new ForbiddenException("Hanya Super Admin yang dapat mengelola akun Super Admin.");
    }
  }

  private ensureCanAssignRole(actor: AuthUser, role: UserRole) {
    if (actor.role !== UserRole.super_admin && role === UserRole.super_admin) {
      throw new ForbiddenException("Hanya Super Admin yang dapat memberikan role Super Admin.");
    }
  }

  private async ensureEmailAvailable(email: string, exceptId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing && existing.id !== exceptId) throw new ConflictException("Email sudah digunakan.");
  }
}
