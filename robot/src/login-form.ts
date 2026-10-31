/**
 * Logika murni pengenalan formulir login (diuji di `login-form.test.ts`): kolom nama pengguna, kata sandi, CAPTCHA, OTP,
 * dan tombol kirim dikenali dari label/placeholder/nama — bukan selektor khusus situs — agar satu mesin dipakai SRIKANDI,
 * e-Kinerja, dan sistem lain. Robot **tidak** membaca CAPTCHA/OTP: keduanya selalu diketik pengguna (human-in-the-loop).
 */

export interface FieldInfo {
  /** Indeks urutan elemen di halaman (dipakai kembali sebagai penanda `data-lifeos-field`) */
  index: number;
  type: string;
  /** Gabungan label, placeholder, name, id, aria-label, autocomplete (huruf kecil) */
  text: string;
  maxLength: number | null;
  inputMode: string;
}

export interface ButtonInfo {
  index: number;
  text: string;
}

export interface LoginFields {
  username?: number;
  password?: number;
  captcha?: number;
  /** Satu kolom OTP, atau beberapa kotak satu digit */
  otp: number[];
}

const CAPTCHA = /captcha|kode keamanan|kode gambar|security code|verification image|kode pada gambar/;
const OTP =
  /\botp\b|one-time-code|authenticator|\btoken\b|kode verifikasi|verification code|\b2fa\b|\bmfa\b|totp|kode otp|kode autentikasi|kode authenticator/;
const USERNAME = /nama pengguna|username|user ?name|user ?id|\bnip\b|email|\blogin\b|\bakun\b|\buser\b/;
const TEXTUAL = new Set(["text", "email", "tel", "number", ""]);

/** Kenali kolom-kolom formulir login dari daftar input yang terlihat. */
export function classifyFields(fields: FieldInfo[]): LoginFields {
  const result: LoginFields = { otp: [] };
  const password = fields.find((f) => f.type === "password");
  if (password) result.password = password.index;
  const textual = fields.filter((f) => TEXTUAL.has(f.type));

  const captcha = textual.find((f) => CAPTCHA.test(f.text));
  if (captcha) result.captcha = captcha.index;

  // OTP: kolom berlabel OTP/authenticator, atau ≥ 4 kotak satu karakter berurutan
  const boxes = textual.filter((f) => f.maxLength === 1 && f.index !== captcha?.index);
  if (boxes.length >= 4) result.otp = boxes.map((f) => f.index);
  else {
    const otp = textual.find(
      (f) =>
        f.index !== captcha?.index &&
        (OTP.test(f.text) ||
          (f.maxLength === 6 && /numeric|tel/.test(f.inputMode)) ||
          f.text.includes("one-time-code")),
    );
    if (otp) result.otp = [otp.index];
  }

  const taken = new Set([captcha?.index, ...result.otp]);
  const candidates = textual.filter((f) => !taken.has(f.index));
  const username =
    candidates.find((f) => USERNAME.test(f.text)) ??
    // Cadangan: kolom teks terakhir sebelum kolom kata sandi
    (password ? [...candidates].reverse().find((f) => f.index < password.index) : undefined);
  if (username && password) result.username = username.index;
  return result;
}

const SUBMIT = /masuk|login|log in|sign in|verifikasi|verify|lanjut|lanjutkan|kirim|submit|konfirmasi|^ok$/;
const NOT_SUBMIT = /lupa|forgot|daftar|register|refresh|muat ulang|lihat|tampilkan|batal|kembali|privasi|bantuan/;

/** Tombol kirim formulir: teks seperti Masuk/Login/Verifikasi, bukan Lupa sandi/Daftar/Muat ulang CAPTCHA. */
export function pickSubmit(buttons: ButtonInfo[]): number | null {
  const ok = buttons.filter((b) => {
    const t = b.text.trim().toLowerCase();
    return t && SUBMIT.test(t) && !NOT_SUBMIT.test(t);
  });
  return ok.length ? ok[0].index : null;
}

export type LoginStage = "done" | "captcha" | "otp" | "credentials" | "unknown";

/** Tahap login berikutnya dari keadaan halaman. */
export function loginStage(loggedIn: boolean, fields: LoginFields): LoginStage {
  if (loggedIn) return "done";
  if (fields.otp.length) return "otp";
  if (fields.captcha !== undefined) return "captcha";
  if (fields.password !== undefined) return "credentials";
  return "unknown";
}

/** Validasi jawaban pengguna (CAPTCHA 1–12 karakter tanpa spasi, OTP 4–8 digit). */
export function validAnswer(kind: string, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (kind === "captcha") return /^\S{1,12}$/.test(value);
  if (kind === "otp") return /^\d{4,8}$/.test(value);
  return false;
}

/** Kredensial dari backend: dibatasi panjangnya; tidak pernah dicatat. */
export function validCredentials(value: unknown): value is { username: string; password: string } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.username === "string" &&
    typeof v.password === "string" &&
    v.username.length > 0 &&
    v.username.length <= 200 &&
    v.password.length > 0 &&
    v.password.length <= 200
  );
}

const INFO_TEXT = /berhasil|sukses|success|selamat datang|welcome/;
const ACTION_TEXT = /hapus|kirim|ajukan|setujui|tandatangan|tanda tangan|tte|submit|simpan|yakin|batalkan/;
const OK_BUTTON = /^(ok|oke|okay|tutup|close|baik|mengerti|lanjut|lanjutkan)$/;

/**
 * Modal informasi setelah login (mis. "Login berhasil" + tombol OK di e-Kinerja) boleh ditutup robot. Modal yang
 * meminta keputusan (kirim, hapus, setujui, tanda tangan, "yakin?") **tidak pernah** ditutup otomatis.
 */
export function infoDialogButton(text: string, buttons: ButtonInfo[]): number | null {
  const t = text.toLowerCase();
  if (!INFO_TEXT.test(t) || ACTION_TEXT.test(t)) return null;
  const ok = buttons.find((b) => OK_BUTTON.test(b.text.trim().toLowerCase()));
  return ok ? ok.index : null;
}
