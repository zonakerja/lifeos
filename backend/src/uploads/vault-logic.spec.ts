import { describe, expect, it } from "vitest";
import {
  isPrivateIp,
  locationLabel,
  normalizeIp,
  parseGeo,
  shortUserAgent,
  VAULT_UPLOAD_CONTEXT,
  vaultFilesToRelease,
} from "./vault-logic";

describe("brankas digital — log akses", () => {
  it("IP dirapikan; IP lokal/privat/CGNAT dikenali", () => {
    expect(normalizeIp("::ffff:103.10.1.2")).toBe("103.10.1.2");
    expect(normalizeIp("")).toBeNull();
    for (const ip of ["127.0.0.1", "::1", "10.1.2.3", "192.168.0.5", "172.20.1.1", "100.64.0.1", "fd00::1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ["103.10.1.2", "172.32.0.1", "8.8.8.8"]) expect(isPrivateIp(ip)).toBe(false);
  });

  it("lokasi dari layanan IP; galat & IP privat ditangani", () => {
    const geo = parseGeo({ country_name: "Indonesia", region: "Jakarta", city: "Jakarta", org: "PT Telkom" });
    expect(geo).toEqual({ country: "Indonesia", region: "Jakarta", city: "Jakarta", network: "PT Telkom" });
    expect(locationLabel(geo, "103.10.1.2")).toBe("Jakarta, Indonesia");
    expect(parseGeo({ error: true, reason: "RateLimited" })).toBeNull();
    expect(locationLabel(null, "8.8.8.8")).toBe("Tidak diketahui");
    expect(locationLabel(null, "192.168.1.1")).toBe("Jaringan lokal / privat");
  });

  it("ringkasan peramban", () => {
    expect(
      shortUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome 140 · Windows");
    expect(
      shortUserAgent("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/139.0 Mobile Safari/537.36 Edg/139.0"),
    ).toBe("Edge 139 · Android");
    expect(shortUserAgent(null)).toBeNull();
  });
});

describe("brankas digital — berkas yang dilepas", () => {
  it("hanya unggahan khusus brankas milik pemilik yang tidak dipakai brankas lain", () => {
    const removed = [
      { id: "a", userId: "u1", context: VAULT_UPLOAD_CONTEXT },
      { id: "b", userId: "u1", context: "schedule" },
      { id: "c", userId: "u1", context: VAULT_UPLOAD_CONTEXT },
      { id: "d", userId: "u2", context: VAULT_UPLOAD_CONTEXT },
      { id: "e", userId: "u1", context: null },
    ];
    expect(vaultFilesToRelease(removed, "u1", new Set(["c"]))).toEqual(["a"]);
    expect(vaultFilesToRelease([], "u1", new Set())).toEqual([]);
  });
});
