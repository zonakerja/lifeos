import { describe, expect, it } from "vitest";
import { htmlToText, isBlockedAddress, parseWebUrl, WebSourceError } from "./web-source";

describe("alamat terlarang", () => {
  it("menolak jaringan lokal, loopback, link-local, metadata cloud, dan IPv6 privat", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.5",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "bukan-ip",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("mengizinkan alamat publik", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe("URL sumber web", () => {
  it("menambah https:// dan membuang fragmen", () => {
    expect(parseWebUrl("contoh.go.id/berita#bagian").toString()).toBe("https://contoh.go.id/berita");
  });

  it("menolak skema lain, kredensial, localhost, dan IP lokal", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://contoh.com",
      "http://user:pass@contoh.com",
      "http://localhost:4000",
      "http://app.localhost",
      "http://printer.local",
      "http://127.0.0.1/admin",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data",
      "javascript:alert(1)",
    ]) {
      expect(() => parseWebUrl(url), url).toThrow(WebSourceError);
    }
  });
});

describe("HTML → teks", () => {
  it("mengambil isi artikel tanpa navigasi/skrip", () => {
    const paragraph = "Pemerintah kota menetapkan anggaran pendidikan sebesar 20 persen dari APBD tahun 2027. ";
    const html = `<!doctype html><html><head><title>Berita Anggaran</title><script>var x=1</script></head>
      <body><nav>Beranda | Profil | Kontak</nav><article><h1>Anggaran 2027</h1><p>${paragraph.repeat(6)}</p>
      <p>Kebijakan ini mulai berlaku Januari.</p></article><footer>Hak cipta</footer></body></html>`;
    const { title, text } = htmlToText(html, "https://contoh.go.id/berita");
    expect(title).toContain("Anggaran");
    expect(text).toContain("anggaran pendidikan sebesar 20 persen");
    expect(text).toContain("Kebijakan ini mulai berlaku Januari.");
    expect(text).not.toContain("var x=1");
  });

  it("halaman pendek tetap diambil dari body", () => {
    const { title, text } = htmlToText(
      "<html><head><title>Kecil</title><style>p{}</style></head><body><nav>menu</nav><p>Isi singkat saja.</p></body></html>",
      "https://contoh.com",
    );
    expect(title).toBe("Kecil");
    expect(text).toBe("Isi singkat saja.");
  });
});
