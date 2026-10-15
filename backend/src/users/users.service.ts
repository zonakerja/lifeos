import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "../generated/prisma/client";
import { hash } from "@node-rs/argon2";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { domainDelegate } from "../records/record-delegate";
import { RECORD_TYPES } from "../records/record-schema";
import { ObjectStorageService } from "../storage/object-storage.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { toPublicUser } from "./user.mapper";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

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
    const assets = [
      ...(await this.prisma.asset.findMany({ where: { userId: id }, select: { objectKey: true } })),
      // Versi lama dokumen yang diedit di ONLYOFFICE
      ...(await this.prisma.assetVersion.findMany({ where: { asset: { userId: id } }, select: { objectKey: true } })),
    ];
    await this.prisma.user.delete({ where: { id } });
    // Data di database ikut terhapus (cascade); berkasnya dihapus dari object storage
    for (const { objectKey } of assets) {
      await this.storage
        .deleteObject(objectKey)
        .catch((error) =>
          this.logger.warn(`Objek ${objectKey} gagal dihapus: ${error instanceof Error ? error.message : error}`),
        );
    }
    return { success: true };
  }

  /**
   * Statistik per user untuk admin: jumlah data, berkas & ukurannya, berbagi, dan waktu aktif terakhir. Isi data
   * tidak pernah dikembalikan (isolasi data).
   */
  async stats() {
    const records = new Map<string, number>();
    for (const type of RECORD_TYPES) {
      const groups = await domainDelegate(this.prisma, type).groupBy({
        by: ["userId"],
        where: { deletedAt: null },
        _count: { _all: true },
      });
      for (const g of groups) records.set(g.userId, (records.get(g.userId) ?? 0) + g._count._all);
    }
    const [assets, sharesOut, sharesIn, sessions] = await Promise.all([
      this.prisma.asset.groupBy({ by: ["userId"], _count: { _all: true }, _sum: { size: true } }),
      this.prisma.share.groupBy({ by: ["ownerId"], _count: { _all: true } }),
      this.prisma.share.groupBy({ by: ["recipientId"], _count: { _all: true } }),
      this.prisma.refreshToken.groupBy({ by: ["userId"], _max: { createdAt: true } }),
    ]);
    const users = await this.prisma.user.findMany({ select: { id: true } });
    return users.map(({ id }) => {
      const asset = assets.find((a) => a.userId === id);
      return {
        userId: id,
        records: records.get(id) ?? 0,
        files: asset?._count._all ?? 0,
        storageBytes: asset?._sum.size ?? 0,
        sharesOut: sharesOut.find((s) => s.ownerId === id)?._count._all ?? 0,
        sharesIn: sharesIn.find((s) => s.recipientId === id)?._count._all ?? 0,
        lastActiveAt: sessions.find((s) => s.userId === id)?._max.createdAt ?? null,
      };
    });
  }

  /** Pencarian akun penerima berbagi: nama/email mengandung `q` (min. 3 huruf), tanpa diri sendiri. */
  async directory(q: string, actor: AuthUser) {
    const term = q.trim();
    if (term.length < 3) return [];
    return this.prisma.user.findMany({
      where: {
        id: { not: actor.id },
        OR: [{ email: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }],
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 8,
    });
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
