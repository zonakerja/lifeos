import { User } from "../generated/prisma/client";

type PublicUser = Omit<User, "passwordHash" | "apiKey"> & {
  apiKey?: string | null;
};

/**
 * Hilangkan field sensitif dari user. `apiKey` hanya disertakan untuk pemilik akun sendiri.
 */
export function toPublicUser(user: User, options: { includeApiKey?: boolean } = {}): PublicUser {
  const { passwordHash, apiKey, ...rest } = user;
  void passwordHash;
  return options.includeApiKey ? { ...rest, apiKey } : rest;
}
