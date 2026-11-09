import { describe, expect, it } from "vitest";
import { splitWebm } from "./webm-split";

const known = (value: number) => {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value) | (1n << 56n));
  return out;
};
const UNKNOWN = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const el = (id: number[], body: Buffer) => Buffer.concat([Buffer.from(id), known(body.length), body]);

const EBML = el([0x1a, 0x45, 0xdf, 0xa3], Buffer.from("hdr"));
const SEEK_HEAD = el([0x11, 0x4d, 0x9b, 0x74], Buffer.from("seek"));
const VOID = el([0xec], Buffer.alloc(8));
const DURATION = el([0x44, 0x89], Buffer.from("durasi-utuh"));
const SCALE = (value: number) =>
  el([0x2a, 0xd7, 0xb1], Buffer.from([0, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]));
const INFO = (scale = 1_000_000) =>
  el([0x15, 0x49, 0xa9, 0x66], Buffer.concat([SCALE(scale), DURATION, el([0x4d, 0x80], Buffer.from("app"))]));
const TRACKS = el([0x16, 0x54, 0xae, 0x6b], Buffer.from("tracks"));
const CUES = el([0x1c, 0x53, 0xbb, 0x6b], Buffer.from("cues-indeks"));
const CLUSTER_ID = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);

const clusterBody = (timecode: number, payload: string, width: number) => {
  const value = Buffer.alloc(width);
  value.writeUIntBE(timecode, 0, width);
  return Buffer.concat([el([0xe7], value), el([0xa3], Buffer.from(payload))]);
};
const cluster = (timecode: number, payload = "audio", width = 4) => {
  const body = clusterBody(timecode, payload, width);
  return Buffer.concat([CLUSTER_ID, known(body.length), body]);
};
const unknownCluster = (timecode: number, payload = "audio") =>
  Buffer.concat([CLUSTER_ID, UNKNOWN, clusterBody(timecode, payload, 4)]);

/** Bentuk rekaman yang diunduh dari browser: Segment berukuran pasti, SeekHead di depan, Cues di belakang. */
const finalized = (...clusters: Buffer[]) => {
  const inner = Buffer.concat([SEEK_HEAD, VOID, INFO(), TRACKS, ...clusters, CUES]);
  return Buffer.concat([EBML, Buffer.from([0x18, 0x53, 0x80, 0x67]), known(inner.length), inner]);
};
/** Bentuk siaran: Segment & Cluster tanpa ukuran, tanpa indeks. */
const streaming = (...clusters: Buffer[]) =>
  Buffer.concat([EBML, Buffer.from([0x18, 0x53, 0x80, 0x67]), UNKNOWN, INFO(), TRACKS, ...clusters]);

const LIMITS = { maxMs: 600_000, maxBytes: 1_000_000 };

/** Waktu semua Cluster & apakah struktur potongan berakhir tepat di akhir data. */
function inspect(data: Buffer) {
  const segmentAt = EBML.length;
  expect(data.subarray(0, EBML.length).equals(EBML)).toBe(true);
  expect(data.readUInt32BE(segmentAt)).toBe(0x18538067);
  const segmentSize = Number(data.readBigUInt64BE(segmentAt + 4) & ~(1n << 56n));
  expect(segmentAt + 12 + segmentSize).toBe(data.length);

  const times: number[] = [];
  let p = data.indexOf(CLUSTER_ID);
  while (p >= 0 && p < data.length) {
    const size = Number(data.readBigUInt64BE(p + 4) & ~(1n << 56n));
    const width = Number(data.readBigUInt64BE(p + 13) & ~(1n << 56n));
    times.push(data.readUIntBE(p + 21, width));
    p += 12 + size;
  }
  expect(p).toBe(data.length);
  return times;
}

describe("splitWebm", () => {
  it("rekaman pendek menjadi satu potongan valid tanpa indeks & durasi lama", () => {
    const pieces = splitWebm(finalized(cluster(0), cluster(30_000)), LIMITS)!;
    expect(pieces).toHaveLength(1);
    expect(pieces[0].startMs).toBe(0);
    expect(inspect(pieces[0].data)).toEqual([0, 30_000]);
    for (const dropped of ["seek", "cues-indeks", "durasi-utuh"]) {
      expect(pieces[0].data.includes(dropped)).toBe(false);
    }
    expect(pieces[0].data.includes("tracks")).toBe(true);
    expect(pieces[0].data.includes("app")).toBe(true);
  });

  it("dipotong per batas waktu dan tiap potongan mulai dari nol", () => {
    const clusters = [0, 300_000, 600_000, 900_000, 1_200_000].map((t) => cluster(t, `isi-${t}`));
    const pieces = splitWebm(finalized(...clusters), LIMITS)!;
    expect(pieces.map((p) => p.startMs)).toEqual([0, 600_000, 1_200_000]);
    expect(pieces.map((p) => inspect(p.data))).toEqual([[0, 300_000], [0, 300_000], [0]]);
    expect(pieces[1].data.includes("isi-900000")).toBe(true);
    expect(pieces[1].data.includes("isi-300000")).toBe(false);
  });

  it("lebar kolom waktu berbeda antar Cluster tetap benar", () => {
    const pieces = splitWebm(
      finalized(cluster(0, "a", 1), cluster(600_000, "b", 3), cluster(630_000, "c", 3)),
      LIMITS,
    )!;
    expect(inspect(pieces[1].data)).toEqual([0, 30_000]);
  });

  it("tidak ada isi yang hilang atau berulang", () => {
    const stamps = Array.from({ length: 40 }, (_, i) => i * 30_000);
    const pieces = splitWebm(finalized(...stamps.map((t) => cluster(t, `isi-${t};`))), LIMITS)!;
    const all = pieces.map((p) => p.data.toString("latin1")).join("");
    for (const t of stamps) expect(all.split(`isi-${t};`).length - 1).toBe(1);
  });

  it("berkas sumber tidak berubah", () => {
    const source = finalized(cluster(0), cluster(600_000), cluster(630_000));
    const copy = Buffer.from(source);
    splitWebm(source, LIMITS);
    expect(source.equals(copy)).toBe(true);
  });

  it("bentuk siaran (ukuran tidak diketahui) juga dipotong", () => {
    const pieces = splitWebm(streaming(unknownCluster(0, "a"), unknownCluster(600_000, "b")), LIMITS)!;
    expect(pieces.map((p) => p.startMs)).toEqual([0, 600_000]);
    expect(pieces[1].data.includes("b")).toBe(true);
    expect(pieces[1].data.indexOf(CLUSTER_ID)).toBeGreaterThan(0);
  });

  it("batas ukuran juga memotong", () => {
    const big = "x".repeat(500);
    const pieces = splitWebm(finalized(cluster(0, big), cluster(1_000, big), cluster(2_000, big)), {
      maxMs: 600_000,
      maxBytes: 1_200,
    })!;
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.data.length).toBeLessThanOrEqual(1_200);
  });

  it("struktur yang tidak dikenali mengembalikan null", () => {
    expect(splitWebm(Buffer.from("ID3 bukan webm sama sekali"), LIMITS)).toBeNull();
    expect(splitWebm(Buffer.concat([EBML, INFO(), TRACKS]), LIMITS)).toBeNull();
    const whole = finalized(cluster(0, "x".repeat(100)));
    expect(splitWebm(whole.subarray(0, whole.length - CUES.length - 50), LIMITS)).toBeNull();
  });

  it("skala waktu selain milidetik tidak dipotong", () => {
    const inner = Buffer.concat([INFO(500_000), TRACKS, cluster(0)]);
    const source = Buffer.concat([EBML, Buffer.from([0x18, 0x53, 0x80, 0x67]), known(inner.length), inner]);
    expect(splitWebm(source, LIMITS)).toBeNull();
  });
});
