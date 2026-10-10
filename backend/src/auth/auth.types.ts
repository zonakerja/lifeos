import { UserRole } from "../generated/prisma/client";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
};
