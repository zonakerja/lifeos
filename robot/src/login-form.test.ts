import { describe, expect, it } from "vitest";
import { classifyFields, type FieldInfo, loginStage, pickSubmit, validAnswer, validCredentials } from "./login-form.js";

const field = (index: number, type: string, text: string, extra: Partial<FieldInfo> = {}): FieldInfo => ({
  index,
  type,
  text,
  maxLength: null,
  inputMode: "",
  ...extra,
});

describe("pengenalan formulir login", () => {
  it("formulir SRIKANDI: nama pengguna, kata sandi, captcha", () => {
    const fields = [
      field(0, "text", "nama pengguna nama pengguna username"),
      field(1, "password", "kata sandi kata sandi password"),
      field(2, "checkbox", "lihat kata sandi"),
      field(3, "text", "captcha captcha"),
    ];
    expect(classifyFields(fields)).toEqual({ username: 0, password: 1, captcha: 3, otp: [] });
  });

  it("formulir NIP + CAPTCHA kode keamanan (e-Kinerja)", () => {
    const fields = [field(0, "text", "nip"), field(1, "password", "password"), field(2, "text", "kode keamanan")];
    expect(classifyFields(fields)).toEqual({ username: 0, password: 1, captcha: 2, otp: [] });
  });

  it("cadangan nama pengguna = kolom teks sebelum kata sandi", () => {
    expect(classifyFields([field(0, "text", "x"), field(1, "password", "")]).username).toBe(0);
  });

  it("OTP satu kolom berlabel / numerik 6 digit / kotak per digit", () => {
    expect(classifyFields([field(0, "text", "kode otp authenticator")]).otp).toEqual([0]);
    expect(classifyFields([field(0, "text", "code", { maxLength: 6, inputMode: "numeric" })]).otp).toEqual([0]);
    const boxes = [0, 1, 2, 3, 4, 5].map((i) => field(i, "text", "", { maxLength: 1 }));
    expect(classifyFields(boxes).otp).toEqual([0, 1, 2, 3, 4, 5]);
    expect(classifyFields(boxes).username).toBeUndefined();
  });

  it("tombol kirim: Masuk/Verifikasi, bukan Lupa sandi / muat ulang", () => {
    expect(
      pickSubmit([
        { index: 0, text: "Lupa Kata Sandi?" },
        { index: 1, text: "Privasi" },
        { index: 2, text: "MASUK" },
      ]),
    ).toBe(2);
    expect(pickSubmit([{ index: 0, text: "Verifikasi" }])).toBe(0);
    expect(pickSubmit([{ index: 0, text: "Lupa Nama Pengguna?" }])).toBeNull();
  });

  it("tahap login", () => {
    expect(loginStage(true, { otp: [] })).toBe("done");
    expect(loginStage(false, { otp: [3] })).toBe("otp");
    expect(loginStage(false, { otp: [], captcha: 2, password: 1 })).toBe("captcha");
    expect(loginStage(false, { otp: [], password: 1 })).toBe("credentials");
    expect(loginStage(false, { otp: [] })).toBe("unknown");
  });

  it("validasi jawaban & kredensial", () => {
    expect(validAnswer("captcha", "TZ3SE")).toBe(true);
    expect(validAnswer("captcha", "a b")).toBe(false);
    expect(validAnswer("otp", "123456")).toBe(true);
    expect(validAnswer("otp", "12a456")).toBe(false);
    expect(validAnswer("lain", "1")).toBe(false);
    expect(validCredentials({ username: "u", password: "p" })).toBe(true);
    expect(validCredentials({ username: "", password: "p" })).toBe(false);
    expect(validCredentials({ username: "u", password: "p".repeat(201) })).toBe(false);
  });
});

describe("modal informasi setelah login", () => {
  it("menutup modal berhasil, bukan modal keputusan", async () => {
    const { infoDialogButton } = await import("./login-form.js");
    expect(infoDialogButton("Login Berhasil! Selamat datang", [{ index: 0, text: "OK" }])).toBe(0);
    expect(
      infoDialogButton("Sukses", [
        { index: 0, text: "Batal" },
        { index: 1, text: "Oke" },
      ]),
    ).toBe(1);
    expect(infoDialogButton("Apakah Anda yakin mengirim naskah?", [{ index: 0, text: "OK" }])).toBeNull();
    expect(infoDialogButton("Data berhasil dihapus? Yakin", [{ index: 0, text: "OK" }])).toBeNull();
    expect(infoDialogButton("Perhatian: sesi akan berakhir", [{ index: 0, text: "OK" }])).toBeNull();
    expect(infoDialogButton("Berhasil", [{ index: 0, text: "Kirim" }])).toBeNull();
  });
});
