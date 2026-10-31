import { describe, expect, it } from "vitest";
import type { VaultAccess } from "@/types/api";
import { distinctVisitors, formatVaultSize, vaultUrl } from "./vault-utils";

describe("brankas digital", () => {
  it("ukuran berkas ringkas", () => {
    expect(formatVaultSize(512)).toBe("512 B");
    expect(formatVaultSize(1536)).toBe("1,5 KB");
    expect(formatVaultSize(4.7 * 1024 * 1024)).toBe("4,7 MB");
    expect(formatVaultSize(-1)).toBe("-");
  });

  it("jumlah IP berbeda & tautan lengkap", () => {
    const row = (ip: string | null) => ({ ip }) as VaultAccess;
    expect(distinctVisitors([row("1.1.1.1"), row("1.1.1.1"), row("2.2.2.2"), row(null)])).toBe(3);
    expect(vaultUrl("/brankas/bv_abc", "https://lifeos.go.id")).toBe("https://lifeos.go.id/brankas/bv_abc");
  });
});
