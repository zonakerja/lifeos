import { UserRole } from "../../generated/prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};
