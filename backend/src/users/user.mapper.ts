import { User } from "../generated/prisma/client";

/** Hilangkan field sensitif dari user. */
export function toPublicUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}
