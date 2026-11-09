/** Elemen EBML/Matroska yang dibutuhkan untuk memotong rekaman browser (MediaRecorder). */
const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_TRACKS = 0x1654ae6b;
const ID_CLUSTER = 0x1f43b675;
const ID_TIMECODE = 0xe7;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK_GROUP = 0xa0;
const ID_PREV_SIZE = 0xab;
/** Indeks & metadata yang boleh ada di antara / sesudah Cluster; tidak ikut ke potongan. */
const SKIPPABLE = new Set([0x114d9b74 /* SeekHead */, 0x1c53bb6b /* Cues */, 0x1254c367 /* Tags */, 0xec /* Void */]);
const ONE_MS_SCALE = 1_000_000;

export interface WebmPiece {
  /** Waktu mulai potongan dalam rekaman asli. */
  startMs: number;
  data: Buffer;
}

const readId = (buf: Buffer, p: number) => {
  let len = 1;
  let mask = 0x80;
  while (len <= 4 && !(buf[p] & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 4 || p + len > buf.length) return null;
  let value = 0;
  for (let i = 0; i < len; i++) value = value * 256 + buf[p + i];
  return { value, len };
};

const readSize = (buf: Buffer, p: number) => {
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(buf[p] & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 8 || p + len > buf.length) return null;
  let value = buf[p] & (mask - 1);
  let unknown = value === mask - 1;
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[p + i];
    if (buf[p + i] !== 0xff) unknown = false;
  }
  return { value, len, unknown };
};

const readUint = (buf: Buffer, at: number, length: number) => {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + buf[at + i];
  return value;
};

/** Ukuran EBML 8 byte (cukup untuk berkas apa pun). */
const size8 = (value: number) => {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value) | (1n << 56n));
  return out;
};

const idBytes = (id: number) => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(id);
  return out;
};

/** Info tanpa Duration: durasi rekaman utuh tidak berlaku untuk potongan. Null bila skala waktu bukan milidetik. */
function rebuildInfo(buf: Buffer, start: number, end: number) {
  const kept: Buffer[] = [];
  let p = start;
  let scale = ONE_MS_SCALE;
  while (p < end) {
    const id = readId(buf, p);
    const size = id && readSize(buf, p + id.len);
    if (!id || !size || size.unknown) return null;
    const body = p + id.len + size.len;
    if (body + size.value > end) return null;
    if (id.value === ID_TIMECODE_SCALE) scale = readUint(buf, body, size.value);
    if (id.value !== ID_DURATION) kept.push(buf.subarray(p, body + size.value));
    p = body + size.value;
  }
  if (scale !== ONE_MS_SCALE) return null;
  const content = Buffer.concat(kept);
  return Buffer.concat([idBytes(ID_INFO), size8(content.length), content]);
}

interface ClusterSpan {
  start: number;
  end: number;
  timecode: number;
  timecodeAt: number;
  timecodeLen: number;
}

/** EBML, Info, Tracks, dan posisi semua Cluster; null bila struktur tidak dikenali. */
function scan(buf: Buffer) {
  let ebml: Buffer | null = null;
  let info: Buffer | null = null;
  let tracks: Buffer | null = null;
  const clusters: ClusterSpan[] = [];
  let open: ClusterSpan | null = null;
  const close = (at: number) => {
    if (open) open.end = at;
    open = null;
  };

  let p = 0;
  while (p < buf.length) {
    const id = readId(buf, p);
    const size = id && readSize(buf, p + id.len);
    if (!id || !size) return null;
    const body = p + id.len + size.len;

    // Master yang isinya ditelusuri langsung (ukurannya pasti atau tidak diketahui, keduanya dipakai browser)
    if (id.value === ID_SEGMENT) {
      p = body;
      continue;
    }
    if (id.value === ID_CLUSTER) {
      close(p);
      open = { start: p, end: buf.length, timecode: -1, timecodeAt: -1, timecodeLen: 0 };
      clusters.push(open);
      p = body;
      continue;
    }

    if (size.unknown || body + size.value > buf.length) return null;
    const next = body + size.value;
    if (id.value === ID_TIMECODE && open) {
      if (size.value < 1 || size.value > 6) return null;
      Object.assign(open, {
        timecode: readUint(buf, body, size.value),
        timecodeAt: body,
        timecodeLen: size.value,
      });
    } else if (id.value === ID_SIMPLE_BLOCK || id.value === ID_BLOCK_GROUP || id.value === ID_PREV_SIZE) {
      if (!open) return null;
    } else {
      close(p);
      if (id.value === ID_EBML) ebml = buf.subarray(p, next);
      else if (id.value === ID_TRACKS) tracks = buf.subarray(p, next);
      else if (id.value === ID_INFO) {
        info = rebuildInfo(buf, body, next);
        if (!info) return null;
      } else if (!SKIPPABLE.has(id.value)) return null;
    }
    p = next;
  }
  close(buf.length);
  if (!ebml || !info || !tracks || !clusters.length || clusters.some((c) => c.timecode < 0)) return null;
  return { ebml: ebml as Buffer, body: Buffer.concat([info as Buffer, tracks as Buffer]), clusters };
}

/**
 * Potong WebM hasil MediaRecorder menjadi beberapa WebM utuh di batas Cluster, tanpa encode ulang: tiap potongan
 * mendapat header sendiri (ukuran Segment benar, tanpa indeks & durasi rekaman utuh) dan waktunya dimulai dari nol.
 * Mengembalikan null bila bukan struktur itu (pemanggil memakai berkas utuh). Potongan tidak melebihi
 * `maxMs`/`maxBytes` kecuali satu Cluster sudah melebihinya.
 */
export function splitWebm(buf: Buffer, options: { maxMs: number; maxBytes: number }): WebmPiece[] | null {
  const parsed = scan(buf);
  if (!parsed) return null;
  const { ebml, body, clusters } = parsed;
  const overhead = ebml.length + 12 + body.length;

  const pieces: WebmPiece[] = [];
  const build = (from: number, to: number) => {
    const group = clusters.slice(from, to);
    const startMs = group[0].timecode;
    const segmentSize = body.length + group.reduce((sum, c) => sum + (c.end - c.start), 0);
    const parts = [ebml, idBytes(ID_SEGMENT), size8(segmentSize), body];
    const clustersAt = overhead;
    let offset = clustersAt;
    const patches: { at: number; value: number; len: number }[] = [];
    for (const cluster of group) {
      parts.push(buf.subarray(cluster.start, cluster.end));
      patches.push({
        at: offset + (cluster.timecodeAt - cluster.start),
        value: cluster.timecode - startMs,
        len: cluster.timecodeLen,
      });
      offset += cluster.end - cluster.start;
    }
    const data = Buffer.concat(parts);
    // Lebar kolom tetap; nilai hanya mengecil sehingga selalu muat
    for (const patch of patches) data.writeUIntBE(patch.value, patch.at, patch.len);
    pieces.push({ startMs, data });
  };

  let from = 0;
  for (let i = 1; i < clusters.length; i++) {
    const tooLong = clusters[i].timecode - clusters[from].timecode >= options.maxMs;
    const bytesWithNext = overhead + clusters[i].end - clusters[from].start;
    if (tooLong || bytesWithNext > options.maxBytes) {
      build(from, i);
      from = i;
    }
  }
  build(from, clusters.length);
  return pieces;
}
