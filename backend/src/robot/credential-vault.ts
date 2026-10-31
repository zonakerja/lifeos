import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "c1";
const ALGORITHM = "aes-256-gcm";

/**
 * Brankas kredensial konektor robot (tahap 6 docs/AI-AGENT.md §21.1): AES-256-GCM dengan kunci **khusus**
 * `CREDENTIAL_ENCRYPTION_KEY` (bukan kunci API key AI, tanpa kunci bawaan). Setiap nilai diikat ke pemilik, sistem, dan
 * kolomnya lewat AAD (`additional authenticated data`) — ciphertext yang dipindah ke baris/kolom/user lain gagal
 * didekripsi. Format: `c1.<iv>.<tag>.<ciphertext>` (base64url). Diuji di `credential-vault.spec.ts`.
 */
export class CredentialVault {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    if (!/^[0-9a-f]{64}$/i.test(hexKey)) throw new Error("CREDENTIAL_ENCRYPTION_KEY harus 64 karakter hex.");
    this.key = Buffer.from(hexKey, "hex");
  }

  static aad(userId: string, system: string, field: "username" | "password") {
    return Buffer.from(`lifeos:robot-credential:${userId}:${system}:${field}`, "utf8");
  }

  encrypt(plaintext: string, aad: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
      .join(".");
  }

  decrypt(payload: string, aad: Buffer): string {
    const [version, iv, tag, ciphertext] = payload.split(".");
    if (version !== VERSION || !iv || !tag || ciphertext === undefined)
      throw new Error("Format kredensial tidak dikenal.");
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, "base64url"));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  }
}

/** Nama pengguna tersamar untuk tampilan: 2 karakter awal + 2 akhir (pendek → hanya awal). */
export function maskUsername(username: string) {
  const u = username.trim();
  if (u.length <= 4) return `${u.slice(0, 1)}•••`;
  return `${u.slice(0, 2)}•••${u.slice(-2)}`;
}
