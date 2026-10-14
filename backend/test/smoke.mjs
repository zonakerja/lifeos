// Smoke test API end-to-end terhadap server yang sedang berjalan.
// Pemakaian: npm run test:smoke
//   API_URL              default http://localhost:4000/api/v1
//   SMOKE_ADMIN_EMAIL    akun super_admin (default admin@lifeos.com — seed development)
//   SMOKE_ADMIN_PASSWORD (default 123)
//
// Tidak mengubah data asli: semua uji tulis memakai dua user member sementara
// yang dibuat di awal dan dihapus (cascade) di akhir.
const B = process.env.API_URL ?? "http://localhost:4000/api/v1";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? "admin@lifeos.com";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? "123";
let failed = 0;
const j = async (method, path, body, token, cookie) => {
  const isForm = body instanceof FormData;
  const r = await fetch(B + path, {
    method,
    headers: {
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: `lifeos_rt=${cookie}` } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const setCookie = r.headers.getSetCookie().find((c) => c.startsWith("lifeos_rt=")) ?? "";
  const rt = decodeURIComponent(setCookie.split(";")[0].slice("lifeos_rt=".length));
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { s: r.status, d: data, rt, setCookie };
};
const ok = (label, cond, extra = "") => {
  if (!cond) failed++;
  console.log(cond ? "PASS" : "FAIL", label, cond ? "" : JSON.stringify(extra).slice(0, 400));
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** PDF satu halaman minimal berlapis teks. */
const makePdf = (text) => {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((obj, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
};

/** DOCX minimal satu paragraf (jszip = devDependency backend). */
const makeDocx = async (text) => {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
};

// ---------------------------------------------------------------- auth (admin)
let r = await j("POST", "/auth/login", {
  email: ADMIN_EMAIL,
  password: "salah-total",
});
ok("login wrong pw 401", r.s === 401, r);
r = await j("POST", "/auth/login", {
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
});
ok("login 200", r.s === 200 && r.d.accessToken, r);
const admin = r.d.accessToken;
ok("no passwordHash", !("passwordHash" in r.d.user));

// User sementara untuk semua uji tulis
const email = `smoke-${Date.now()}@lifeos.test`;
r = await j("POST", "/users", { name: "Smoke Test", email, password: "rahasia", role: "member" }, admin);
ok("create temp user", r.s === 201 && r.d.id, r);
const tempUserId = r.d.id;
// Rekan untuk uji isolasi data & berbagi
const partnerEmail = `smoke-partner-${Date.now()}@lifeos.test`;
r = await j(
  "POST",
  "/users",
  { name: "Smoke Partner", email: partnerEmail, password: "rahasia", role: "member" },
  admin,
);
ok("create temp partner", r.s === 201 && r.d.id, r);
const tempPartnerId = r.d.id;
r = await j(
  "POST",
  "/users",
  { name: "x", email: `v-${Date.now()}@lifeos.test`, password: "rahasia", role: "viewer" },
  admin,
);
ok("role viewer removed 400", r.s === 400, r);
r = await j("POST", "/auth/login", { email, password: "rahasia" });
let at = r.d.accessToken;
const rt = r.rt;
ok(
  "refresh token only in httpOnly cookie",
  !("refreshToken" in r.d) &&
    /HttpOnly/i.test(r.setCookie) &&
    /SameSite=Strict/i.test(r.setCookie) &&
    /Path=\/api\/v1\/auth/i.test(r.setCookie),
  r.setCookie,
);

try {
  r = await j("GET", "/auth/me", null, at);
  ok("me", r.s === 200 && r.d.email === email, r);
  r = await j("PATCH", "/auth/me", { phone: "0811" }, at);
  ok("patch me", r.s === 200 && r.d.phone === "0811", r);
  r = await j("PATCH", "/auth/me", { apiKey: "k-test" }, at);
  ok("api key no longer on profile 400", r.s === 400, r);

  // ------------------------------------------------------------ AI (tanpa memanggil provider sungguhan)
  const aiForm = (files = []) => {
    const form = new FormData();
    form.append("prompt", "Halo");
    for (const [content, type, name] of files) form.append("files", new Blob([content], { type }), name);
    return form;
  };
  const fakeKey = "smoke-fake-key-ABCD1234";
  r = await j("GET", "/ai/settings", null, at);
  ok(
    "ai settings default",
    r.s === 200 &&
      r.d.activeProvider === null &&
      r.d.fallbackEnabled === true &&
      r.d.providers.length === 3 &&
      r.d.providers.every((p) => !p.configured),
    r,
  );
  r = await j("POST", "/ai/generate", aiForm(), at);
  ok("ai generate without provider 400", r.s === 400, r);
  r = await j("PUT", "/ai/settings/gemini", {}, at);
  ok("ai save without key 400", r.s === 400, r);
  r = await j("PUT", "/ai/settings/unknown", { apiKey: fakeKey }, at);
  ok("ai unknown provider 400", r.s === 400, r);
  r = await j("PUT", "/ai/settings/gemini", { apiKey: fakeKey, model: "gemini-smoke" }, at);
  const gemini = r.d.providers?.find((p) => p.id === "gemini");
  ok(
    "ai save key (first = active, key never returned)",
    r.s === 200 &&
      r.d.activeProvider === "gemini" &&
      gemini.configured &&
      gemini.keyHint === "1234" &&
      gemini.model === "gemini-smoke" &&
      !JSON.stringify(r.d).includes(fakeKey),
    r,
  );
  r = await j("GET", "/auth/me", null, at);
  ok("me has aiProvider, no key", r.d.aiProvider === "gemini" && !JSON.stringify(r.d).includes(fakeKey), r);
  r = await j("PUT", "/ai/settings/gemini", { model: null }, at);
  const geminiReset = r.d.providers?.find((p) => p.id === "gemini");
  ok("ai reset model keeps key", r.s === 200 && geminiReset.model === null && geminiReset.configured, r);
  r = await j("PUT", "/ai/settings/anthropic", { apiKey: fakeKey }, at);
  ok("ai second provider not auto-active", r.s === 200 && r.d.activeProvider === "gemini", r);
  r = await j("PATCH", "/ai/settings", { activeProvider: "openai" }, at);
  ok("ai activate unconfigured 400", r.s === 400, r);
  r = await j("PATCH", "/ai/settings", { activeProvider: "anthropic" }, at);
  ok("ai switch provider", r.s === 200 && r.d.activeProvider === "anthropic", r);
  // Cadangan dimatikan: audio tidak dialihkan ke Gemini (yang akan memanggil Google dengan key palsu)
  r = await j("PATCH", "/ai/settings", { fallbackEnabled: false }, at);
  ok("ai fallback off", r.s === 200 && r.d.fallbackEnabled === false && r.d.activeProvider === "anthropic", r);
  r = await j("POST", "/ai/generate", aiForm([["audio", "audio/webm", "rekaman.webm"]]), at);
  ok(
    "ai attachment unsupported, no fallback 400",
    r.s === 400 && /audio/.test(r.d.message) && /Cadangan/.test(r.d.message),
    r,
  );
  r = await j("PATCH", "/ai/settings", { fallbackEnabled: "ya" }, at);
  ok("ai fallback invalid value 400", r.s === 400, r);
  r = await j("POST", "/ai/generate", aiForm([["PK", "application/zip", "arsip.zip"]]), at);
  ok("ai unsupported file type 400", r.s === 400, r);
  r = await j("DELETE", "/ai/settings/anthropic", null, at);
  ok("ai remove active falls back", r.s === 200 && r.d.activeProvider === "gemini", r);
  // Hapus key Gemini palsu sebelum ada record/berkas, agar indeks, embedding, & OCR tidak memanggil Google
  r = await j("DELETE", "/ai/settings/gemini", null, at);
  ok("ai remove fake gemini key", r.s === 200 && r.d.activeProvider === null, r);

  // ------------------------------------------------------------ settings (tulis nilai yang sama)
  r = await j("GET", "/settings/app");
  ok("settings public", r.s === 200 && r.d.name, r);
  r = await j("PATCH", "/settings/app", { name: r.d.name }, admin);
  ok("patch settings", r.s === 200, r);
  r = await j("PATCH", "/settings/app", { id: "x" }, admin);
  ok("settings reject unknown 400", r.s === 400, r);

  // ------------------------------------------------------------ records (tabel terstruktur)
  r = await j("PUT", "/records/para_project/proj-1", { payload: { title: "Proyek A", deadline: "2026-12-01" } }, at);
  ok("upsert create", r.s === 200 && r.d.clientId === "proj-1" && r.d.payload.id === "proj-1", r);
  r = await j("PUT", "/records/para_project/proj-1", { payload: { title: "Proyek A2" } }, at);
  ok("upsert update", r.d.title === "Proyek A2" && !("deadline" in r.d.payload), r);
  r = await j("GET", "/records/para_project", null, at);
  ok("list 1", r.s === 200 && r.d.length === 1, r);
  r = await j("DELETE", "/records/para_project/proj-1", null, at);
  ok("delete", r.s === 200, r);
  r = await j("GET", "/records/para_project", null, at);
  ok("list 0", r.d.length === 0, r);
  r = await j("PUT", "/records/para_project/proj-1", { payload: { title: "Hidup lagi" } }, at);
  ok("undelete via upsert", r.s === 200, r);

  // Round-trip semua jenis kolom + nilai tidak valid tetap utuh (lossless)
  const task = {
    id: "task-1",
    projectId: "proj-1",
    title: "Uji tipe",
    dueDate: "2026-10-08",
    weight: 2.5,
    completed: true,
    completedAt: "2026-10-08T15:00:02.750Z",
    resources: [{ id: "r1", type: "link" }],
    priority: null,
    custom: { nested: [1, null, "x"] },
  };
  r = await j("PUT", "/records/para_task/task-1", { payload: task }, at);
  const { userId: _ignored, ...back } = r.d.payload;
  ok(
    "typed round-trip",
    r.s === 200 &&
      same(Object.keys(back).sort(), Object.keys(task).sort()) &&
      same(back.custom, task.custom) &&
      back.completedAt === task.completedAt &&
      back.dueDate === task.dueDate &&
      back.priority === null,
    r,
  );
  r = await j(
    "PUT",
    "/records/todo/numeric-5",
    {
      payload: { id: 5, title: "x", date: "Fri Oct 08 2026", completed: "yes" },
    },
    at,
  );
  ok(
    "invalid values preserved",
    r.d.payload.id === 5 && r.d.payload.date === "Fri Oct 08 2026" && r.d.payload.completed === "yes",
    r,
  );
  r = await j("PUT", "/records/todo/t-ok", { payload: { title: "ok", date: "Thu Oct 08 2026", completed: false } }, at);
  ok("dateKey date column", r.d.date === "2026-10-08T00:00:00.000Z" && r.d.payload.date === "Thu Oct 08 2026", r);

  r = await j("GET", "/records/nope", null, at);
  ok("unknown type 404", r.s === 404, r);

  // ------------------------------------------------------------ audit kearsipan
  const borrowing = {
    title: "x",
    borrowerName: "Budi",
    date: "2026-10-08",
    returnDate: "2026-10-20",
    items: [],
    status: "active",
  };
  await j("PUT", "/records/archive_borrowing/b-1", { payload: borrowing }, at);
  await j("PUT", "/records/archive_borrowing/b-1", { payload: { ...borrowing, status: "returned" } }, at);
  await j("PUT", "/records/archive_borrowing/b-1", { payload: { ...borrowing, status: "returned" } }, at); // tanpa perubahan
  await j("DELETE", "/records/archive_borrowing/b-1", null, at);
  r = await j("GET", "/archive-audit?entityType=archive_borrowing&entityId=b-1", null, at);
  const actions = Array.isArray(r.d) ? r.d.map((log) => log.action).reverse() : [];
  ok("audit created/updated/deleted", same(actions, ["created", "updated", "deleted"]), r);
  ok("audit diff", r.d?.[1]?.changes?.status?.from === "active" && r.d[1].changes.status.to === "returned", r.d?.[1]);
  await j("PUT", "/records/para_resource/plain", { payload: { title: "bukan arsip", type: "link" } }, at);
  r = await j("GET", "/archive-audit?entityType=para_resource", null, at);
  ok("non-archival resource not audited", Array.isArray(r.d) && r.d.length === 0, r);

  // ------------------------------------------------------------ uploads
  const fd = new FormData();
  fd.append("file", new Blob(["Halo arsip LifeOS"], { type: "text/plain" }), "catatan é.txt");
  fd.append("context", "resource");
  r = await j("POST", "/uploads", fd, at);
  ok("upload", r.s === 201 && r.d.id && r.d.originalName === "catatan é.txt", r);
  const assetId = r.d.id;
  await new Promise((res) => setTimeout(res, 2500));
  r = await j("GET", `/uploads/${assetId}/metadata`, null, at);
  ok(
    "extraction completed",
    r.d.extraction?.status === "completed" && r.d.extraction.extractedText.includes("Halo"),
    r,
  );
  r = await j("GET", `/uploads/${assetId}`, null, at);
  ok("stream w/ bearer", r.s === 200 && r.d === "Halo arsip LifeOS", r);
  r = await j("POST", `/uploads/${assetId}/link`, null, at);
  ok("link", r.s === 201, r);
  const link = r.d.url;
  const dlToken = decodeURIComponent(link.split("token=")[1]);
  r = await j("GET", link);
  ok("download via link", r.s === 200 && r.d === "Halo arsip LifeOS", r);
  r = await j("GET", "/auth/me", null, dlToken);
  ok("download token not usable as access 401", r.s === 401, r);
  r = await j("GET", `/uploads/${assetId}/download?token=bad`);
  ok("bad link 401", r.s === 401, r);
  r = await j("DELETE", `/uploads/${assetId}`, null, at);
  ok("delete upload", r.s === 200, r);

  // ------------------------------------------------------------ ekstraksi dokumen (PDF, DOCX, gambar)
  const uploadAndWait = async (content, type, name) => {
    const form = new FormData();
    form.append("file", new Blob([content], { type }), name);
    const up = await j("POST", "/uploads", form, at);
    for (let i = 0; i < 20; i++) {
      await new Promise((res) => setTimeout(res, 500));
      const meta = await j("GET", `/uploads/${up.d.id}/metadata`, null, at);
      if (!["pending", "extracting"].includes(meta.d.extraction?.status))
        return { id: up.d.id, extraction: meta.d.extraction };
    }
    return { id: up.d.id, extraction: null };
  };
  const pdf = await uploadAndWait(makePdf("Surat Keputusan Nomor 77 tentang Arsip Vital"), "application/pdf", "sk.pdf");
  ok(
    "extract pdf",
    pdf.extraction?.status === "completed" && pdf.extraction.extractedText.includes("Nomor 77"),
    pdf.extraction,
  );
  const docx = await uploadAndWait(
    await makeDocx("Notulen rapat penyusutan arsip"),
    "application/octet-stream",
    "notulen.docx",
  );
  ok(
    "extract docx (mime from extension)",
    docx.extraction?.status === "completed" && docx.extraction.extractedText.includes("penyusutan arsip"),
    docx.extraction,
  );
  // Gambar butuh OCR Gemini; user sementara tidak punya key Gemini → tidak didukung (berkas tetap tersimpan)
  const png = await uploadAndWait(Buffer.from("89504e470d0a1a0a", "hex"), "image/png", "scan.png");
  ok("image without gemini key unsupported", png.extraction?.status === "unsupported", png.extraction);
  for (const id of [pdf.id, docx.id, png.id]) await j("DELETE", `/uploads/${id}`, null, at);

  // ------------------------------------------------------------ indeks pengetahuan (RAG)
  r = await j("GET", "/ai/index", null, at);
  ok(
    "ai index status",
    r.s === 200 && r.d.enabled === true && r.d.model === "gemini-embedding-2" && typeof r.d.chunks === "number",
    r,
  );
  r = await j("PATCH", "/ai/settings", { indexEnabled: false }, at);
  ok("ai index disable", r.s === 200 && r.d.indexEnabled === false, r);
  r = await j("PATCH", "/ai/settings", { indexEnabled: true }, at);
  ok("ai index enable", r.s === 200 && r.d.indexEnabled === true, r);
  r = await j("POST", "/ai/index/rebuild", null, at);
  ok("ai index rebuild queued", r.s === 202 && r.d.queued === true, r);
  r = await j("GET", "/ai/index/search?q=arsip", null, at);
  ok("ai index search", r.s === 200 && Array.isArray(r.d), r);
  r = await j("GET", "/ai/index/search?q=", null, at);
  ok("ai index search empty 400", r.s === 400, r);
  // Tanpa key Gemini: record tetap terindeks untuk pencarian kata (tanpa embedding), lalu hilang saat dihapus
  const waitSearch = async (q, predicate) => {
    for (let i = 0; i < 30; i++) {
      const res = await j("GET", `/ai/index/search?q=${encodeURIComponent(q)}`, null, at);
      if (predicate(res.d)) return res.d;
      await new Promise((res2) => setTimeout(res2, 500));
    }
    return null;
  };
  r = await j(
    "PUT",
    "/records/free_note/rag-1",
    { payload: { title: "Rapat koordinasi", content: "Pembahasan arsip vital ZEBRA7781" } },
    at,
  );
  const hits = await waitSearch("ZEBRA7781", (d) => Array.isArray(d) && d.length > 0);
  ok(
    "ai index record keyword search",
    hits?.[0]?.sourceType === "free_note" &&
      hits[0].sourceId === "rag-1" &&
      hits[0].title === "Catatan: Rapat koordinasi",
    hits,
  );
  r = await j("DELETE", "/records/free_note/rag-1", null, at);
  ok("ai index record removed", !!(await waitSearch("ZEBRA7781", (d) => Array.isArray(d) && d.length === 0)));

  // ------------------------------------------------------------ refresh token (cookie httpOnly)
  r = await j("POST", "/auth/refresh");
  ok("refresh without cookie 401", r.s === 401, r);
  r = await j("POST", "/auth/refresh", null, null, rt);
  ok("refresh rotates cookie", r.s === 200 && r.d.accessToken && r.rt && r.rt !== rt, r);
  const rt2 = r.rt;
  r = await j("POST", "/auth/refresh", null, null, rt);
  ok("parallel refresh within grace window", r.s === 200, r);
  r = await j("POST", "/auth/logout", null, null, rt2);
  ok("logout clears cookie", r.s === 200 && /lifeos_rt=;/.test(r.setCookie), r.setCookie);
  r = await j("POST", "/auth/refresh", null, null, rt2);
  ok("refresh after logout 401", r.s === 401, r);

  // Ganti password: sesi lain dicabut, sesi saat ini tetap
  const sessionA = await j("POST", "/auth/login", { email, password: "rahasia" });
  const sessionB = await j("POST", "/auth/login", { email, password: "rahasia" });
  r = await j(
    "POST",
    "/auth/change-password",
    { currentPassword: "rahasia", newPassword: "rahasia2" },
    sessionA.d.accessToken,
    sessionA.rt,
  );
  ok("change password", r.s === 200, r);
  r = await j("POST", "/auth/refresh", null, null, sessionB.rt);
  ok("other sessions revoked after password change", r.s === 401, r);
  r = await j("POST", "/auth/refresh", null, null, sessionA.rt);
  ok("current session kept after password change", r.s === 200, r);

  // ------------------------------------------------------------ isolasi data & berbagi
  at = (await j("POST", "/auth/login", { email, password: "rahasia2" })).d.accessToken;
  r = await j("POST", "/auth/login", { email: partnerEmail, password: "rahasia" });
  const pt = r.d.accessToken;
  const shareFile = new FormData();
  shareFile.append("file", new Blob(["a;b\n1;2"], { type: "text/csv" }), "berbagi.csv");
  r = await j("POST", "/uploads", shareFile, at);
  const sharedAsset = r.d.id;
  await j("PUT", "/records/free_note/sh-n1", { payload: { title: "Catatan lampiran", content: "isi" } }, at);
  await j("PUT", "/records/free_note/sh-n2", { payload: { title: "Catatan pribadi", content: "rahasia" } }, at);
  r = await j(
    "PUT",
    "/records/para_project/sh-p1",
    {
      payload: {
        title: "Proyek Bersama",
        resources: [
          { id: "a1", type: "file", uploadId: sharedAsset },
          { id: "a2", type: "note", noteId: "free-sh-n1" },
        ],
      },
    },
    at,
  );
  ok("owner project with attachments", r.s === 200, r);
  await j("PUT", "/records/para_task/sh-t1", { payload: { title: "Action 1", projectId: "sh-p1" } }, at);

  // Admin tidak punya akses ke data user lain
  r = await j("GET", "/records/para_project", null, admin);
  ok("admin cannot list user data", r.s === 200 && !r.d.some((x) => x.clientId === "sh-p1"), r);
  r = await j("GET", `/records/para_project?userId=${tempUserId}`, null, admin);
  ok("admin userId filter rejected 400", r.s === 400, r);
  r = await j("PUT", "/records/para_project/sh-p1", { payload: { title: "x" }, userId: tempUserId }, admin);
  ok("admin write user data 403", r.s === 403, r);
  r = await j("DELETE", `/records/para_project/sh-p1?userId=${tempUserId}`, null, admin);
  ok("admin delete user data 404", r.s === 404, r);
  r = await j("GET", `/uploads/${sharedAsset}`, null, admin);
  ok("admin cannot read user file 403", r.s === 403, r);
  r = await j("GET", "/archive-audit", null, admin);
  ok("admin audit only own", r.s === 200 && !r.d.some((x) => x.userId === tempUserId), r);
  r = await j("GET", "/records/para_project", null, pt);
  ok("partner sees nothing before share", r.s === 200 && r.d.length === 0, r);
  r = await j("GET", `/uploads/${sharedAsset}`, null, pt);
  ok("partner file 403 before share", r.s === 403, r);

  // Membuat berbagi
  r = await j("POST", "/shares", { recordType: "para_project", recordId: "sh-p1", email, permission: "view" }, at);
  ok("share to self 400", r.s === 400, r);
  r = await j(
    "POST",
    "/shares",
    { recordType: "para_project", recordId: "sh-p1", email: "tidak-ada@lifeos.test", permission: "view" },
    at,
  );
  ok("share unknown email 404", r.s === 404, r);
  r = await j("POST", "/shares", { recordType: "todo", recordId: "x", email: partnerEmail, permission: "view" }, at);
  ok("share non-shareable type 400", r.s === 400, r);
  r = await j(
    "POST",
    "/shares",
    { recordType: "para_project", recordId: "sh-p1", email: partnerEmail, permission: "view" },
    pt,
  );
  ok("share someone else's item 404", r.s === 404, r);
  r = await j(
    "POST",
    "/shares",
    { recordType: "para_project", recordId: "sh-p1", email: partnerEmail.toUpperCase(), permission: "view" },
    at,
  );
  ok("share project (view)", r.s === 201 && r.d.recipient.email === partnerEmail, r);
  const shareId = r.d.id;
  r = await j("GET", "/shares?recordType=para_project&recordId=sh-p1", null, at);
  ok("owner lists recipients", r.s === 200 && r.d.length === 1, r);
  r = await j("GET", "/shares?recordType=para_project&recordId=sh-p1", null, pt);
  ok("recipient cannot list recipients 404", r.s === 404, r);

  // Penerima: root + turunan + rujukan + berkas
  r = await j("GET", "/records/para_project", null, pt);
  const sharedProject = r.d.find((x) => x.clientId === "sh-p1");
  ok(
    "recipient sees shared project",
    sharedProject?.share?.permission === "view" &&
      sharedProject.share.root &&
      sharedProject.share.ownerName === "Smoke Test",
    r,
  );
  r = await j("GET", "/records/para_task", null, pt);
  ok(
    "recipient sees descendant task",
    r.d.some((x) => x.clientId === "sh-t1" && x.share?.root === false),
    r,
  );
  r = await j("GET", "/records/free_note", null, pt);
  ok(
    "recipient sees referenced note only",
    r.d.length === 1 && r.d[0].clientId === "sh-n1" && r.d[0].share.permission === "view",
    r,
  );
  r = await j("GET", `/uploads/${sharedAsset}`, null, pt);
  ok("recipient reads attached file", r.s === 200, r);
  r = await j("DELETE", `/uploads/${sharedAsset}`, null, pt);
  ok("recipient cannot delete owner file 403", r.s === 403, r);
  r = await j(
    "PUT",
    "/records/para_task/sh-t1",
    { payload: { title: "Ubah", projectId: "sh-p1" }, userId: tempUserId },
    pt,
  );
  ok("view cannot write 403", r.s === 403, r);
  r = await j("GET", `/comments?recordType=para_project&recordId=sh-p1&ownerId=${tempUserId}`, null, pt);
  ok("view reads comments", r.s === 200 && r.d.length === 0, r);
  r = await j(
    "POST",
    "/comments",
    { recordType: "para_project", recordId: "sh-p1", ownerId: tempUserId, body: "Halo" },
    pt,
  );
  ok("view cannot comment 403", r.s === 403, r);

  // Izin komentar
  r = await j("PATCH", `/shares/${shareId}`, { permission: "comment" }, at);
  ok("change permission to comment", r.s === 200 && r.d.permission === "comment", r);
  r = await j(
    "POST",
    "/comments",
    { recordType: "para_project", recordId: "sh-p1", ownerId: tempUserId, body: "Siap" },
    pt,
  );
  ok("comment as recipient", r.s === 201 && r.d.author.name === "Smoke Partner", r);
  const commentId = r.d.id;
  r = await j("GET", "/comments?recordType=para_project&recordId=sh-p1", null, at);
  ok("owner sees comment", r.s === 200 && r.d.length === 1 && r.d[0].body === "Siap", r);
  r = await j("PATCH", `/comments/${commentId}`, { body: "Ubah" }, at);
  ok("only author edits comment 403", r.s === 403, r);
  r = await j(
    "POST",
    "/comments",
    { recordType: "para_project", recordId: "sh-p1", ownerId: tempUserId, body: "x" },
    admin,
  );
  ok("outsider comment 404", r.s === 404, r);

  // Izin edit: ubah item, tambah turunan (pemilik = pemilik induk), hapus turunan, unggah ke ruang pemilik
  r = await j("PATCH", `/shares/${shareId}`, { permission: "edit" }, at);
  r = await j(
    "PUT",
    "/records/para_task/sh-t1",
    { payload: { title: "Diubah rekan", projectId: "sh-p1" }, userId: tempUserId },
    pt,
  );
  ok("edit shared task", r.s === 200 && r.d.userId === tempUserId && r.d.title === "Diubah rekan", r);
  r = await j("PUT", "/records/para_task/sh-t2", { payload: { title: "Action rekan", projectId: "sh-p1" } }, pt);
  ok("new child owned by project owner", r.s === 200 && r.d.userId === tempUserId, r);
  r = await j("GET", "/records/para_task", null, at);
  ok(
    "owner sees collaborator task",
    r.d.some((x) => x.clientId === "sh-t2"),
    r,
  );
  r = await j("PUT", "/records/free_note/sh-n1", { payload: { title: "x" }, userId: tempUserId }, pt);
  ok("referenced note stays read-only 403", r.s === 403, r);
  r = await j("PUT", "/records/free_note/sh-n2", { payload: { title: "x" }, userId: tempUserId }, pt);
  ok("unshared item 403", r.s === 403, r);
  r = await j("DELETE", `/records/para_project/sh-p1?userId=${tempUserId}`, null, pt);
  ok("recipient cannot delete shared root 403", r.s === 403, r);
  r = await j("DELETE", `/records/para_task/sh-t2?userId=${tempUserId}`, null, pt);
  ok("recipient deletes child", r.s === 200, r);
  const collabFile = new FormData();
  collabFile.append("file", new Blob(["x;y"], { type: "text/csv" }), "rekan.csv");
  collabFile.append("ownerId", tempUserId);
  r = await j("POST", "/uploads", collabFile, pt);
  ok("collaborator upload into owner space", r.s === 201, r);
  const collabAsset = r.d.id;
  r = await j("GET", `/uploads/${collabAsset}/metadata`, null, at);
  ok("owner owns collaborator upload", r.s === 200 && r.d.userId === tempUserId, r);
  r = await j("DELETE", `/uploads/${collabAsset}`, null, pt);
  ok("uploader can discard own upload", r.s === 200, r);
  const strayFile = new FormData();
  strayFile.append("file", new Blob(["x"], { type: "text/csv" }), "x.csv");
  strayFile.append("ownerId", tempUserId);
  r = await j("POST", "/uploads", strayFile, admin);
  ok("upload to unshared owner 403", r.s === 403, r);

  // Ringkasan berbagi, direktori, statistik admin
  r = await j("GET", "/shares/incoming", null, pt);
  ok(
    "incoming shares",
    r.s === 200 && r.d.length === 1 && r.d[0].item?.title === "Proyek Bersama" && r.d[0].owner.email === email,
    r,
  );
  r = await j("GET", "/shares/outgoing", null, at);
  ok("outgoing shares", r.s === 200 && r.d.length === 1 && r.d[0].recipient.email === partnerEmail, r);
  r = await j("GET", "/users/directory?q=smoke-partner", null, at);
  ok("user directory", r.s === 200 && r.d.length === 1 && r.d[0].email === partnerEmail && !("role" in r.d[0]), r);
  r = await j("GET", "/users/directory?q=ab", null, at);
  ok("directory needs 3 chars", r.s === 200 && r.d.length === 0, r);
  r = await j("GET", "/users/stats", null, admin);
  const stat = r.d?.find?.((x) => x.userId === tempUserId);
  ok(
    "admin stats without content",
    r.s === 200 && stat?.records >= 4 && stat.files >= 1 && stat.sharesOut === 1 && !("title" in stat),
    r,
  );
  r = await j("GET", "/users/stats", null, pt);
  ok("member stats 403", r.s === 403, r);
  r = await j("GET", "/users", null, pt);
  ok("member users 403", r.s === 403, r);

  // Penerima keluar dari berbagi → akses hilang
  r = await j("DELETE", `/shares/${shareId}`, null, pt);
  ok("recipient leaves share", r.s === 200, r);
  r = await j("GET", "/records/para_project", null, pt);
  ok("no access after leaving", r.d.length === 0, r);
  r = await j("GET", `/uploads/${sharedAsset}`, null, pt);
  ok("file 403 after leaving", r.s === 403, r);

  // Berbagi seri agenda berulang (item virtual schedule_series = semua pertemuan dengan seriesId sama)
  const occ = (id, date) => ({ id, title: "Kuliah Seri", startDate: date, endDate: date, seriesId: "sm-ser" });
  await j("PUT", "/records/schedule/sm-o1", { payload: occ("sm-o1", "2026-10-20") }, at);
  await j("PUT", "/records/schedule/sm-o2", { payload: occ("sm-o2", "2026-10-27") }, at);
  r = await j(
    "POST",
    "/shares",
    { recordType: "schedule_series", recordId: "sm-ser", email: partnerEmail, permission: "edit" },
    at,
  );
  ok("share schedule series", r.s === 201, r);
  const seriesShareId = r.d?.id;
  r = await j("GET", "/records/schedule", null, pt);
  ok(
    "recipient sees all series meetings as roots",
    r.d.length === 2 && r.d.every((x) => x.payload.seriesId === "sm-ser" && x.share?.root),
    r,
  );
  r = await j("PUT", "/records/schedule/sm-o3", { payload: occ("sm-o3", "2026-11-03"), userId: tempUserId }, pt);
  ok("collaborator adds meeting to shared series", r.s === 200 && r.d.userId === tempUserId, r);
  r = await j("DELETE", `/records/schedule/sm-o1?userId=${tempUserId}`, null, pt);
  ok("collaborator cannot delete series meeting", r.s === 403, r);
  r = await j("GET", "/shares/outgoing", null, at);
  ok(
    "series share title",
    r.d.some((x) => x.recordType === "schedule_series" && /seri · 3 pertemuan/.test(x.item?.title ?? "")),
    r,
  );
  r = await j("DELETE", `/shares/${seriesShareId}`, null, at);
  ok("revoke series share", r.s === 200, r);
  // ---------------------------------------------------------------- My Notebook
  r = await j("POST", "/notebooks", { title: "Smoke Notebook", description: "uji" }, at);
  ok("notebook create", r.s === 201 && r.d.title === "Smoke Notebook", r);
  const nb = r.d.id;
  r = await j("POST", "/notebooks", { title: "" }, at);
  ok("notebook empty title 400", r.s === 400, r);
  r = await j("GET", `/notebooks/${nb}`, null, pt);
  ok("notebook isolated from other user 404", r.s === 404, r);
  r = await j(
    "POST",
    `/notebooks/${nb}/sources`,
    { kind: "text", title: "Notulen", content: "Keputusan rapat: anggaran kearsipan 2027 naik sepuluh persen." },
    at,
  );
  ok("notebook text source ready", r.s === 201 && r.d.status === "ready" && r.d.chars > 20, r);
  const nbText = r.d.id;
  r = await j("POST", `/notebooks/${nb}/sources`, { kind: "text", content: "pendek" }, at);
  ok("notebook text source too short 400", r.s === 400, r);
  await j(
    "PUT",
    "/records/free_note/sm-nb-note",
    { payload: { id: "sm-nb-note", title: "Catatan NB", content: "isi catatan notebook" } },
    at,
  );
  r = await j(
    "POST",
    `/notebooks/${nb}/sources`,
    { kind: "record", recordType: "free_note", recordId: "sm-nb-note" },
    at,
  );
  ok("notebook record source", r.s === 201 && r.d.title === "Catatan NB" && r.d.status === "ready", r);
  r = await j(
    "POST",
    `/notebooks/${nb}/sources`,
    { kind: "record", recordType: "free_note", recordId: "sm-nb-note" },
    at,
  );
  ok("notebook duplicate record source 400", r.s === 400, r);
  r = await j("POST", `/notebooks/${nb}/sources`, { kind: "record", recordType: "todo", recordId: "x" }, at);
  ok("notebook unsupported record type 400", r.s === 400, r);
  r = await j("POST", `/notebooks/${nb}/sources`, { kind: "web", url: "http://127.0.0.1:4000/api/v1/health" }, at);
  ok("notebook web source blocks local address 422", r.s === 422, r);
  r = await j("POST", `/notebooks/${nb}/sources`, { kind: "web", url: "http://169.254.169.254/latest/meta-data" }, at);
  ok("notebook web source blocks cloud metadata 422", r.s === 422, r);
  const nbForm = new FormData();
  nbForm.append(
    "file",
    new Blob(["Surat edaran: arsiparis ditunjuk sebelum 1 November 2026."], { type: "text/plain" }),
    "se.txt",
  );
  nbForm.append("context", "notebook");
  const nbAsset = await j("POST", "/uploads", nbForm, at);
  r = await j("POST", `/notebooks/${nb}/sources`, { kind: "upload", assetId: nbAsset.d.id }, at);
  ok("notebook upload source", r.s === 201 && ["processing", "ready"].includes(r.d.status) && r.d.ownedByNotebook, r);
  // Berkas yang sudah ada di LifeOS (mis. lampiran) dipakai sebagai sumber → tidak ikut terhapus bersama notebook
  const linkedForm = new FormData();
  linkedForm.append("file", new Blob(["Lampiran project: rencana kerja 2027."], { type: "text/plain" }), "rk.txt");
  linkedForm.append("context", "para_task");
  const linkedAsset = await j("POST", "/uploads", linkedForm, at);
  r = await j("POST", `/notebooks/${nb}/sources`, { kind: "upload", assetId: linkedAsset.d.id }, at);
  ok(
    "notebook linked LifeOS file source",
    r.s === 201 && r.d.ownedByNotebook === false && r.d.mimeType === "text/plain",
    r,
  );
  r = await j("PATCH", `/notebooks/${nb}/sources/${nbText}`, { enabled: false }, at);
  ok("notebook disable source", r.s === 200 && r.d.enabled === false, r);
  r = await j("GET", `/notebooks/${nb}`, null, at);
  ok("notebook detail lists sources", r.s === 200 && r.d.sources.length === 4 && r.d.summaryStale === false, r);
  r = await j("GET", "/ai/settings", null, at);
  if (r.d?.activeProvider) console.log("SKIP notebook chat tanpa AI (user uji punya provider aktif)");
  else {
    r = await j("POST", `/notebooks/${nb}/chat`, { message: "Berapa kenaikan anggaran?" }, at);
    ok("notebook chat without AI provider 400", r.s === 400, r);
  }
  // Gambar lampiran chat (divalidasi sebelum AI dipanggil)
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const imgForm = new FormData();
  imgForm.append("file", new Blob([pngBytes], { type: "image/png" }), "titik.png");
  imgForm.append("context", "notebook_chat");
  const chatImg = await j("POST", "/uploads", imgForm, at);
  r = await j("POST", `/notebooks/${nb}/chat`, { message: "", fileIds: [] }, at);
  ok("notebook chat empty message without attachment 400", r.s === 400, r);
  r = await j("POST", `/notebooks/${nb}/chat`, { message: "x", fileIds: ["a", "b", "c", "d", "e"] }, at);
  ok("notebook chat max 4 attachments 400", r.s === 400, r);
  r = await j("POST", `/notebooks/${nb}/chat`, { message: "x", fileIds: [chatImg.d.id] }, pt);
  ok("notebook chat other user's attachment 404", r.s === 404, r);
  // Berkas biner yang tidak bisa dibaca (bukan gambar/PDF/dokumen teks) ditolak sebelum AI dipanggil
  const binForm = new FormData();
  binForm.append("file", new Blob([Buffer.from([0, 1, 2, 3])], { type: "application/octet-stream" }), "data.bin");
  binForm.append("context", "notebook_chat");
  const binAsset = await j("POST", "/uploads", binForm, at);
  for (let i = 0; i < 20; i++) {
    const meta = await j("GET", `/uploads/${binAsset.d.id}/metadata`, null, at);
    if (!["pending", "extracting"].includes(meta.d?.extraction?.status)) break;
    await new Promise((res) => setTimeout(res, 300));
  }
  r = await j("POST", `/notebooks/${nb}/chat`, { message: "x", fileIds: [binAsset.d.id] }, at);
  ok("notebook chat unreadable attachment 400", r.s === 400 && /tidak bisa dibaca/.test(JSON.stringify(r.d)), r);
  await j("DELETE", `/uploads/${binAsset.d.id}`, null, at);
  r = await j("GET", "/ai/settings", null, at);
  if (!r.d?.activeProvider) {
    // Dokumen teks (diekstrak server) + gambar sama-sama diterima → sampai ke tahap AI
    r = await j("POST", `/notebooks/${nb}/chat`, { message: "", fileIds: [chatImg.d.id, nbAsset.d.id] }, at);
    ok(
      "notebook chat image + document reaches AI step (no provider 400)",
      r.s === 400 && /AI belum diatur/.test(JSON.stringify(r.d)),
      r,
    );
  }
  await j("DELETE", `/uploads/${chatImg.d.id}`, null, at);
  r = await j("POST", `/notebooks/${nb}/notes`, { title: "Catatan hasil", content: "**poin**", origin: "manual" }, at);
  ok("notebook note create", r.s === 201, r);
  r = await j("GET", `/notebooks/${nb}/notes`, null, at);
  ok("notebook notes list", r.s === 200 && r.d.length === 1, r);
  r = await j("GET", "/notebooks", null, at);
  ok(
    "notebook list counts",
    r.d.some((n) => n.id === nb && n._count.sources === 4 && n._count.notes === 1),
    r,
  );
  r = await j("DELETE", `/notebooks/${nb}`, null, pt);
  ok("notebook delete by other user 404", r.s === 404, r);
  r = await j("DELETE", `/notebooks/${nb}`, null, at);
  ok("notebook delete", r.s === 200, r);
  r = await j("GET", `/uploads/${nbAsset.d.id}/metadata`, null, at);
  ok("notebook upload removed with notebook", r.s === 404, r);
  r = await j("GET", `/uploads/${linkedAsset.d.id}/metadata`, null, at);
  ok("notebook keeps LifeOS file after notebook delete", r.s === 200, r);
  await j("DELETE", `/uploads/${linkedAsset.d.id}`, null, at);
  await j("DELETE", "/records/free_note/sm-nb-note", null, at);
  r = await j("POST", "/auth/change-password", { currentPassword: "salah", newPassword: "1234" }, pt);
  ok("change pw wrong 400", r.s === 400, r);
  r = await j("POST", "/auth/logout", null, null, "x".repeat(30));
  ok("logout idempotent", r.s === 200, r);
  const docs = await fetch(B.replace("/api/v1", "/api/docs-json"));
  if (docs.status === 404) console.log("SKIP swagger json (dinonaktifkan di production)");
  else ok("swagger json", docs.status === 200);
} finally {
  r = await j("DELETE", `/users/${tempUserId}`, null, admin);
  ok("delete temp user (cascade)", r.s === 200, r);
  r = await j("DELETE", `/users/${tempPartnerId}`, null, admin);
  ok("delete temp partner", r.s === 200, r);
}

console.log(failed ? `\n${failed} test GAGAL` : "\nSemua test lulus");
process.exit(failed ? 1 : 0);
