import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

/**
 * Enkripsi API key AI dengan AES-256-GCM. Format tersimpan: `v1.<iv>.<authTag>.<ciphertext>` (base64url).
 * GCM memastikan nilai yang diubah di database ditolak saat didekripsi, bukan menghasilkan key palsu.
 */
export class AiCrypto {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    this.key = Buffer.from(hexKey, "hex");
    if (this.key.length !== 32) throw new Error("AI_ENCRYPTION_KEY harus 32 byte (64 karakter hex).");
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
      .join(".");
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(".");
    if (version !== VERSION || !iv || !tag || ciphertext === undefined)
      throw new Error("Format kredensial tidak dikenal.");
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  }
}

/** 4 karakter terakhir key untuk ditampilkan (mis. "…a1B2"); key pendek tidak ditampilkan sama sekali. */
export const keyHint = (apiKey: string) => (apiKey.length >= 12 ? apiKey.slice(-4) : "");
