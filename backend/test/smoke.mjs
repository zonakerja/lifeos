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
  const r0 = (r = await j("GET", "/settings/app"));
  ok("settings public", r.s === 200 && r.d.name, r);
  r = await j("PATCH", "/settings/app", { name: r.d.name }, admin);
  ok("patch settings", r.s === 200, r);
  r = await j("PATCH", "/settings/app", { id: "x" }, admin);
  ok("settings reject unknown 400", r.s === 400, r);
  ok("settings public tanpa data logo", !("appLogo" in r0.d) && "logoVersion" in r0.d, r0);
  r = await j("PATCH", "/settings/app", { appLogo: "data:text/html;base64,PGgxPg==" }, admin);
  ok("settings tolak logo bukan gambar 400", r.s === 400, r);
  if (r0.d.logoVersion === null) {
    // Logo uji 1×1 PNG lalu dihapus lagi (hanya bila belum ada logo, agar logo asli tidak hilang)
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    r = await j("PATCH", "/settings/app", { appLogo: `data:image/png;base64,${png}` }, admin);
    ok("settings set logo", r.s === 200 && r.d.logoVersion, r);
    const logo = await fetch(`${B}/settings/app/logo?v=${r.d.logoVersion}`);
    ok(
      "settings logo publik",
      logo.status === 200 &&
        logo.headers.get("content-type")?.startsWith("image/png") &&
        logo.headers.get("cache-control")?.includes("immutable"),
      logo.status,
    );
    r = await j("PATCH", "/settings/app", { appLogo: "" }, admin);
    ok("settings hapus logo", r.s === 200 && r.d.logoVersion === null, r);
    ok("settings logo 404 setelah dihapus", (await fetch(`${B}/settings/app/logo`)).status === 404);
  }

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
  // ---------------------------------------------------------------- Daftar ringan & penggabungan tulis (Notes)
  const heavyInk = {
    version: 1,
    height: 1800,
    paper: "plain",
    strokes: [
      { tool: "pen", color: "ink", size: 2, pressure: false, points: [10, 100, 0.5, 20, 110, 0.5] },
      { tool: "pen", color: "ink", size: 2, pressure: false, points: [10, 1500, 0.5, 20, 1510, 0.5] },
    ],
  };
  await j(
    "PUT",
    "/records/free_note/sm-light",
    { payload: { id: "sm-light", title: "Ringan", content: "teks", doc: { type: "doc" }, ink: heavyInk } },
    at,
  );
  r = await j("GET", "/records/free_note?light=1", null, at);
  const lightNote = r.d.find((x) => x.clientId === "sm-light");
  ok(
    "light list trims heavy note fields",
    r.s === 200 &&
      lightNote?.partial?.join() === "doc,ink" &&
      lightNote.payload.doc === undefined &&
      lightNote.payload.ink.strokes.length === 1,
    r,
  );
  r = await j("GET", "/records/free_note/sm-light", null, at);
  ok("single record is complete", r.s === 200 && r.d.payload.ink.strokes.length === 2 && !!r.d.payload.doc, r);
  r = await j("GET", "/records/free_note/sm-light", null, pt);
  ok("single record isolated from other user 404", r.s === 404, r);
  r = await j(
    "PUT",
    "/records/free_note/sm-light",
    { payload: { ...lightNote.payload, pinned: true }, preserve: ["doc", "ink"] },
    at,
  );
  r = await j("GET", "/records/free_note/sm-light", null, at);
  ok(
    "preserve keeps heavy fields when writing a light item",
    r.d.payload.pinned === true && r.d.payload.ink.strokes.length === 2 && !!r.d.payload.doc,
    r,
  );
  await j("DELETE", "/records/free_note/sm-light", null, at);
  const listBase = { id: "sm-merge", title: "Belanja", items: [{ id: 1, text: "Beras", checked: false }] };
  await j("PUT", "/records/list/sm-merge", { payload: listBase }, at);
  // Penulis lain menambah item; client yang masih memegang versi lama menambah item juga
  await j(
    "PUT",
    "/records/list/sm-merge",
    { payload: { ...listBase, items: [...listBase.items, { id: 2, text: "Teh", checked: false }] }, base: listBase },
    at,
  );
  r = await j(
    "PUT",
    "/records/list/sm-merge",
    { payload: { ...listBase, items: [...listBase.items, { id: 3, text: "Kopi", checked: false }] }, base: listBase },
    at,
  );
  ok("list write merges concurrent items", r.s === 200 && r.d.payload.items.map((i) => i.id).join() === "1,2,3", r);
  await j("DELETE", "/records/list/sm-merge", null, at);
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
  r = await j("POST", `/notebooks/${nb}/sources`, { kind: "upload", assetId: linkedAsset.d.id }, at);
  ok("notebook duplicate file source 400", r.s === 400, r);
  r = await j("GET", "/notebooks/usage", null, at);
  ok(
    "notebook usage lists record & file sources",
    r.s === 200 &&
      r.d.some((u) => u.recordType === "free_note" && u.recordId === "sm-nb-note" && u.notebookId === nb) &&
      r.d.some((u) => u.assetId === linkedAsset.d.id),
    r,
  );
  r = await j("DELETE", `/uploads/${linkedAsset.d.id}`, null, at);
  ok("file used as notebook source cannot be deleted 409", r.s === 409, r);
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
  r = await j("POST", `/notebooks/${nb}/chat`, { message: "x", fileIds: [nbAsset.d.id] }, at);
  ok("notebook chat rejects non-chat upload 400", r.s === 400 && /kotak chat/.test(JSON.stringify(r.d)), r);
  r = await j("GET", `/notebooks/${nb}/messages?take=5`, null, at);
  ok("notebook messages paged", r.s === 200 && Array.isArray(r.d.messages) && r.d.hasMore === false, r);
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
    const docForm = new FormData();
    docForm.append("file", new Blob(["Lampiran chat: jadwal rapat 3 November."], { type: "text/plain" }), "jadwal.txt");
    docForm.append("context", "notebook_chat");
    const chatDoc = await j("POST", "/uploads", docForm, at);
    for (let i = 0; i < 20; i++) {
      const meta = await j("GET", `/uploads/${chatDoc.d.id}/metadata`, null, at);
      if (!["pending", "extracting"].includes(meta.d?.extraction?.status)) break;
      await new Promise((res) => setTimeout(res, 300));
    }
    r = await j("POST", `/notebooks/${nb}/chat`, { message: "", fileIds: [chatImg.d.id, chatDoc.d.id] }, at);
    await j("DELETE", `/uploads/${chatDoc.d.id}`, null, at);
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
  // ---------------------------------------------------------------- ONLYOFFICE (Tools → ONLYOFFICE)
  r = await j("GET", "/office/status", null, at);
  ok("office status", r.s === 200 && typeof r.d.enabled === "boolean", r);
  const office = r.d;
  const dsUp =
    office.enabled &&
    (await fetch(`${office.documentServerUrl}/healthcheck`, { signal: AbortSignal.timeout(5000) })
      .then((res) => res.text())
      .then((t) => t.trim() === "true")
      .catch(() => false));
  // Secret JWT ONLYOFFICE untuk mensimulasikan callback (default = secret development di docker-compose.yml)
  const dsSecret =
    process.env.SMOKE_ONLYOFFICE_JWT_SECRET ??
    (B === "http://localhost:4000/api/v1" ? "lifeos-dev-onlyoffice-jwt-secret-0123456789abcdef" : null);
  if (!office.enabled) {
    r = await j("POST", "/office/documents", { format: "docx" }, at);
    ok("office disabled → 503", r.s === 503, r);
  } else {
    const { createHmac } = await import("node:crypto");
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const dsSign = (payload) => {
      const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
      return `${head}.${createHmac("sha256", dsSecret).update(head).digest("base64url")}`;
    };
    const decode = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    // Link berkas untuk ONLYOFFICE memakai alamat backend internal (produksi: http://backend:4000) → dari host diakses
    // lewat API_URL
    const hostUrl = (url) => url.replace(/^https?:\/\/[^/]+\/api\/v1/, B);

    r = await j("POST", "/office/documents", { format: "xlsx", title: "Anggaran: 2027?" }, at);
    ok("office new xlsx", r.s === 201 && r.d.originalName === "Anggaran 2027.xlsx" && r.d.size > 0, r);
    await j("DELETE", `/uploads/${r.d.id}`, null, at);
    r = await j("POST", "/office/documents", { format: "pptx", title: "Paparan", context: "task" }, at);
    ok("office new doc for attachment keeps context", r.s === 201 && r.d.context === "task", r);
    await j("DELETE", `/uploads/${r.d.id}`, null, at);
    r = await j("POST", "/office/documents", { format: "docx", ownerId: tempUserId }, pt);
    ok("office new doc into other user's space without share 403", r.s === 403, r);
    r = await j("GET", "/office/diagnostics", null, at);
    ok("office diagnostics member 403 (admin only)", r.s === 403, r);
    r = await j("GET", "/office/diagnostics", null, admin);
    ok("office diagnostics admin", r.s === 200 && typeof r.d.healthy === "boolean" && !!r.d.details, r);
    r = await j("POST", "/office/documents", { format: "exe" }, at);
    ok("office new invalid format 400", r.s === 400, r);
    r = await j("POST", "/office/documents", { format: "docx", title: "Notulen Smoke" }, at);
    ok("office new docx", r.s === 201 && r.d.originalName === "Notulen Smoke.docx", r);
    const docId = r.d.id;

    r = await j("POST", "/office/config", { uploadId: docId }, at);
    const cfg = r.d.config;
    ok(
      "office config owner → edit",
      r.s === 200 && r.d.access === "edit" && cfg.editorConfig.mode === "edit" && cfg.document.fileType === "docx",
      r,
    );
    ok("office config signed", !!cfg.token && decode(cfg.token).document.key === cfg.document.key, cfg);
    const fileRes = await fetch(hostUrl(cfg.document.url));
    ok("office file url (token) 200", fileRes.status === 200 && (await fileRes.arrayBuffer()).byteLength > 0);
    const badFile = await fetch(hostUrl(cfg.document.url).replace(/token=[^&]+/, "token=salah"));
    ok("office file url bad token 401", badFile.status === 401);
    r = await j("POST", "/office/config", { uploadId: docId, mode: "view" }, at);
    ok("office config view mode", r.d.access === "view" && r.d.config.editorConfig.mode === "view", r);
    r = await j("POST", "/office/config", { uploadId: docId }, pt);
    ok("office config other user 403", r.s === 403, r);
    r = await j("POST", `/office/files/${docId}/forcesave`, null, pt);
    ok("office forcesave other user 403", r.s === 403, r);
    if (dsUp) {
      r = await j("POST", `/office/files/${docId}/forcesave`, null, at);
      ok("office forcesave without open editor → no-session", r.s === 200 && r.d.status === "no-session", r);
    }

    // AI di editor (sakelar per user): tab AI ONLYOFFICE memakai AI LifeOS lewat proxy backend
    const AI_GUID = "asc.{9DC93CDB-B576-4F0C-B55E-FCC9C48DD007}";
    r = await j("GET", "/office/preferences", null, at);
    ok(
      "office AI default off (no provider)",
      r.s === 200 && r.d.ai === false && r.d.aiReady === false && r.d.provider === null,
      r,
    );
    ok(
      "office config AI off → no AI tab",
      cfg.editorConfig.customization.ai.disabled === true && !cfg.editorConfig.plugins,
      cfg.editorConfig,
    );
    r = await j("PATCH", "/office/preferences", { ai: "lifeos" }, at);
    ok("office AI preference invalid 400", r.s === 400, r);
    r = await j("PATCH", "/office/preferences", { ai: true }, at);
    ok("office AI preference → on", r.s === 200 && r.d.ai === true, r);
    r = await j("POST", "/office/config", { uploadId: docId, appOrigin: "https://jahat.example" }, at);
    const aiOptions = r.d.config?.editorConfig?.plugins?.options?.[AI_GUID]?.lifeos;
    ok(
      "office config AI on → AI tab + LifeOS settings for AI plugin (registered origin only)",
      r.d.ai === true &&
        r.d.config.editorConfig.customization.ai.disabled === false &&
        !!aiOptions?.token &&
        /\/api\/v1\/office\/ai\/proxy$/.test(aiOptions.proxy) &&
        !aiOptions.proxy.includes("jahat") &&
        !r.d.config.editorConfig.plugins.pluginsData,
      r.d.config?.editorConfig,
    );
    // Plugin mengirim JSON tanpa Content-Type (text/plain) → backend tetap membacanya
    const aiProxy = (token, data, target = `${aiOptions?.url}/chat/completions`) =>
      fetch(`${B}/office/ai/proxy`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8", Authorization: "Bearer editor-jwt" },
        body: JSON.stringify({
          target,
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          data: JSON.stringify(data),
        }),
      }).then(async (res) => ({ s: res.status, d: await res.json().catch(() => null) }));
    const chat = { model: "lifeos", messages: [{ role: "user", content: "Ringkas: rapat koordinasi." }] };
    r = await aiProxy(null, chat);
    ok("office AI proxy without session token 401 (OpenAI error format)", r.s === 401 && !!r.d?.error?.message, r);
    r = await aiProxy(at, chat);
    ok("office AI proxy with login token (not session token) 401", r.s === 401, r);
    r = await aiProxy(aiOptions?.token, chat, `${aiOptions?.url}/images/generations`);
    ok("office AI proxy unsupported endpoint 400", r.s === 400 && !!r.d?.error?.message, r);
    r = await aiProxy(aiOptions?.token, { model: "lifeos", messages: [] });
    ok("office AI proxy empty prompt 400", r.s === 400, r);
    r = await aiProxy(aiOptions?.token, chat, `${aiOptions?.url}/models`);
    ok("office AI proxy models list", r.s === 200 && r.d?.data?.[0]?.id === "lifeos", r);
    // User smoke tidak punya API key → ditolak sebelum memanggil provider (tidak ada biaya)
    r = await aiProxy(aiOptions?.token, chat);
    ok(
      "office AI proxy without provider key → AI belum diatur",
      r.s === 400 && /AI belum diatur/.test(r.d?.error?.message),
      r,
    );
    const preflight = await fetch(`${B}/office/ai/proxy`, {
      method: "OPTIONS",
      headers: { Origin: "http://onlyoffice.example", "Access-Control-Request-Method": "POST" },
    });
    ok(
      "office AI proxy CORS for editor origin (no credentials)",
      preflight.headers.get("access-control-allow-origin") === "http://onlyoffice.example" &&
        preflight.headers.get("access-control-allow-credentials") !== "true",
    );
    await j("PATCH", "/office/preferences", { ai: false }, at);
    r = await aiProxy(aiOptions?.token, chat);
    ok("office AI proxy after switching off 403", r.s === 403, r);

    // Templat milik user (Tools → ONLYOFFICE, context office-template) → daftar + dokumen baru; berkas user lain ditolak
    const tplForm = new FormData();
    tplForm.append(
      "file",
      new Blob([await (await fetch(hostUrl(cfg.document.url))).arrayBuffer()]),
      "Kop Surat Smoke.docx",
    );
    tplForm.append("context", "office-template");
    const tpl = await j("POST", "/uploads", tplForm, at);
    const pngForm = new FormData();
    pngForm.append("file", new Blob(["x"], { type: "image/png" }), "logo.png");
    pngForm.append("context", "office-template");
    const png = await j("POST", "/uploads", pngForm, at);
    r = await j("GET", "/office/templates", null, at);
    ok(
      "office templates list (own document templates only)",
      r.s === 200 &&
        r.d.some((t) => t.id === tpl.d.id && t.name === "Kop Surat Smoke" && t.target === "docx") &&
        !r.d.some((t) => t.id === png.d.id),
      r,
    );
    r = await j("GET", "/office/templates", null, pt);
    ok("office templates isolated per user", r.s === 200 && !r.d.some((t) => t.id === tpl.d.id), r);
    r = await j("POST", "/office/documents", { templateId: tpl.d.id }, at);
    ok(
      "office new doc from uploaded template (title = template name)",
      r.s === 201 && r.d.originalName === "Kop Surat Smoke.docx" && r.d.id !== tpl.d.id,
      r,
    );
    if (r.d?.id) await j("DELETE", `/uploads/${r.d.id}`, null, at);
    await j("DELETE", `/uploads/${tpl.d.id}`, null, at);
    await j("DELETE", `/uploads/${png.d.id}`, null, at);
    r = await j("POST", "/office/documents", { templateId: docId, title: "Dari Templat", context: "task" }, at);
    ok(
      "office new doc from template",
      r.s === 201 && r.d.originalName === "Dari Templat.docx" && r.d.id !== docId && r.d.context === "task",
      r,
    );
    if (r.d?.id) await j("DELETE", `/uploads/${r.d.id}`, null, at);
    r = await j("POST", "/office/documents", { templateId: docId }, pt);
    ok("office template of other user (not shared) rejected", r.s === 403 || r.s === 404, r);
    r = await j("POST", "/office/documents", {}, at);
    ok("office new doc without format/template 400", r.s === 400, r);
    r = await j("GET", "/office/fonts", null, at);
    ok("office fonts member 403 (admin only)", r.s === 403, r);
    r = await j("GET", "/office/fonts", null, admin);
    ok("office fonts admin", r.s === 200 && Array.isArray(r.d.files) && typeof r.d.uploadEnabled === "boolean", r.d);
    if (dsUp) ok("office fonts list", r.d.available && r.d.families.includes("Arial"), r.d?.families?.length);
    if (r.d?.uploadEnabled) {
      const fakeFont = new FormData();
      fakeFont.append("file", new Blob(["wOFF0000"]), "palsu.ttf");
      r = await j("POST", "/office/fonts", fakeFont, admin);
      ok("office font upload rejects non-font content", r.s === 400, r);
      const memberFont = new FormData();
      memberFont.append("file", new Blob([new Uint8Array([0, 1, 0, 0, 0, 0])]), "smoke.ttf");
      r = await j("POST", "/office/fonts", memberFont, at);
      ok("office font upload member 403", r.s === 403, r);
      r = await j("DELETE", "/office/fonts/..%2F..%2Fpackage.json", null, admin);
      ok("office font delete outside folder 404", r.s === 404, r);
    }

    // Konsep (dokumen ONLYOFFICE) ↔ dokumen final (PDF bertanda tangan): tautan dua arah
    const finalForm = new FormData();
    finalForm.append("file", new Blob(["%PDF-1.4 smoke final"], { type: "application/pdf" }), "Final TTD.pdf");
    finalForm.append("context", "office-final");
    const finalPdf = await j("POST", "/uploads", finalForm, at);
    r = await j("PUT", `/office/files/${finalPdf.d.id}/draft`, { draftId: docId }, at);
    ok("office link final → draft", r.s === 200 && r.d.draft?.id === docId && r.d.draftCapable === false, r);
    r = await j("GET", `/office/files/${docId}/links`, null, at);
    ok(
      "office draft lists its final",
      r.s === 200 && r.d.draftCapable && r.d.ownerId === tempUserId && r.d.finals.some((f) => f.id === finalPdf.d.id),
      r,
    );
    r = await j("GET", `/office/links?ids=${docId},${finalPdf.d.id}`, null, at);
    ok("office link badges", r.s === 200 && r.d[docId]?.finals === 1 && r.d[finalPdf.d.id]?.draftId === docId, r);
    r = await j("PUT", `/office/files/${docId}/draft`, { draftId: finalPdf.d.id }, at);
    ok("office PDF cannot be a draft 400", r.s === 400, r);
    r = await j("PUT", `/office/files/${docId}/draft`, { draftId: docId }, at);
    ok("office self link 400", r.s === 400, r);
    r = await j("PUT", `/office/files/${finalPdf.d.id}/draft`, { draftId: docId }, pt);
    ok("office link by user without access 403", r.s === 403, r);
    r = await j("GET", `/office/files/${docId}/links`, null, pt);
    ok("office links of other user's file 403", r.s === 403, r);
    r = await j("GET", "/office/link-candidates?role=draft", null, at);
    ok(
      "office draft candidates (documents only)",
      r.s === 200 && r.d.some((f) => f.id === docId) && !r.d.some((f) => f.id === finalPdf.d.id),
      r,
    );
    r = await j("GET", "/office/link-candidates?role=final&q=final%20ttd", null, at);
    ok(
      "office final candidates (search, linked file is not a draft)",
      r.s === 200 && r.d.some((f) => f.id === finalPdf.d.id),
      r,
    );
    r = await j("PUT", `/office/files/${finalPdf.d.id}/draft`, { draftId: null }, at);
    ok("office unlink final", r.s === 200 && r.d.draft === null, r);
    await j("PUT", `/office/files/${finalPdf.d.id}/draft`, { draftId: docId }, at);

    // Berbagi Lihat → partner hanya bisa melihat
    await j(
      "PUT",
      "/records/para_resource/sm-office",
      { payload: { title: "Notulen", type: "file", uploadId: docId } },
      at,
    );
    await j(
      "POST",
      "/shares",
      { recordType: "para_resource", recordId: "sm-office", email: partnerEmail, permission: "view" },
      at,
    );
    await new Promise((res) => setTimeout(res, 3100)); // cache akses baca 3 detik
    r = await j("POST", "/office/config", { uploadId: docId }, pt);
    ok("office config shared view → view", r.s === 200 && r.d.access === "view", r);

    const callbackUrl = (p) => p.replace(/^http:\/\/[^/]+\/api\/v1/, B);
    const cb = (body, token = dsSign({ payload: body })) =>
      fetch(callbackUrl(cfg.editorConfig.callbackUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", AuthorizationJwt: `Bearer ${token}` },
        body: JSON.stringify(body),
      }).then(async (res) => ({ s: res.status, d: await res.json().catch(() => null) }));
    if (!dsSecret) {
      console.log("SKIP simulasi callback ONLYOFFICE (SMOKE_ONLYOFFICE_JWT_SECRET tidak diisi)");
    } else {
      r = await cb({ key: cfg.document.key, status: 1, users: [tempUserId] }, "x.y.z");
      ok("office callback bad JWT 401", r.s === 401, r);
      r = await cb({ key: cfg.document.key, status: 1, users: [tempUserId] });
      ok("office callback editing → error 0", r.s === 200 && r.d.error === 0, r);
      r = await cb({
        key: cfg.document.key,
        status: 2,
        url: "http://169.254.169.254/latest/meta-data",
        users: [tempUserId],
      });
      ok("office callback foreign URL rejected (error 1)", r.s === 200 && r.d.error === 1, r);

      if (!dsUp) {
        console.log("SKIP simpan versi lewat ONLYOFFICE (container ONLYOFFICE tidak menyala)");
      } else {
        // Isi "hasil edit" dibuat ONLYOFFICE sendiri: konversi DOCX lain lewat /converter → link di host ONLYOFFICE
        const editedForm = new FormData();
        editedForm.append("file", new Blob([await makeDocx("Isi versi kedua")]), "v2.docx");
        const edited = await j("POST", "/uploads", editedForm, at);
        const editedCfg = (await j("POST", "/office/config", { uploadId: edited.d.id }, at)).d.config;
        const convert = async () => {
          const body = {
            async: false,
            filetype: "docx",
            outputtype: "docx",
            key: `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            url: editedCfg.document.url,
          };
          const res = await fetch(`${office.documentServerUrl}/converter`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ ...body, token: dsSign(body) }),
          });
          return (await res.json()).fileUrl;
        };
        const fileUrl = await convert();
        ok("office converter produced file", typeof fileUrl === "string", fileUrl);

        r = await cb({
          key: cfg.document.key,
          status: 6,
          url: fileUrl,
          filetype: "docx",
          users: [tempUserId],
          forcesavetype: 1,
        });
        ok("office force save → error 0", r.d?.error === 0, r);
        r = await j("GET", `/office/files/${docId}/versions`, null, at);
        ok(
          "office version 2 after save",
          r.d.versions?.length === 2 && r.d.versions[0].version === 2 && r.d.canRestore,
          r,
        );
        // Simpan lagi di sesi yang sama → tetap 2 versi (ditimpa)
        r = await cb({ key: cfg.document.key, status: 6, url: await convert(), filetype: "docx", users: [tempUserId] });
        r = await j("GET", `/office/files/${docId}/versions`, null, at);
        ok("office same session save keeps versions", r.d.versions?.length === 2, r);
        // Editor terakhir ditutup → kunci sesi berganti
        r = await cb({ key: cfg.document.key, status: 4, users: [] });
        r = await j("POST", "/office/config", { uploadId: docId }, at);
        ok("office key rotates after session end", r.d.config.document.key !== cfg.document.key, r.d.config?.document);

        r = await j("POST", `/office/files/${docId}/versions/1/restore`, null, pt);
        ok("office restore by viewer 403", r.s === 403, r);
        r = await j("POST", `/office/files/${docId}/versions/1/restore`, null, at);
        ok("office restore v1 → v3", r.s === 200 && r.d.versions[0].version === 3 && r.d.versions.length === 3, r);
        const v1 = await fetch(`${B}/office/files/${docId}/versions/1`, { headers: { Authorization: `Bearer ${at}` } });
        const cur = await fetch(`${B}/uploads/${docId}`, { headers: { Authorization: `Bearer ${at}` } });
        ok(
          "office restored content = v1",
          v1.status === 200 && Buffer.from(await v1.arrayBuffer()).equals(Buffer.from(await cur.arrayBuffer())),
        );
        // Format "lossy" (ODT) bisa disunting & teksnya dibaca lewat konversi ONLYOFFICE (ekstraktor bawaan tidak mendukung)
        const odtBody = {
          async: false,
          filetype: "docx",
          outputtype: "odt",
          key: `smoke-odt-${Date.now()}`,
          url: editedCfg.document.url,
        };
        const odtUrl = (
          await fetch(`${office.documentServerUrl}/converter`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ ...odtBody, token: dsSign(odtBody) }),
          }).then((res) => res.json())
        ).fileUrl;
        const odtForm = new FormData();
        odtForm.append(
          "file",
          new Blob([await (await fetch(odtUrl)).arrayBuffer()], { type: "application/vnd.oasis.opendocument.text" }),
          "uji.odt",
        );
        const odt = await j("POST", "/uploads", odtForm, at);
        let odtMeta;
        for (let i = 0; i < 40; i++) {
          odtMeta = await j("GET", `/uploads/${odt.d.id}/metadata`, null, at);
          if (!["pending", "extracting"].includes(odtMeta.d?.extraction?.status)) break;
          await new Promise((res) => setTimeout(res, 500));
        }
        ok(
          "office ODT text extracted via ONLYOFFICE",
          odtMeta.d.extraction?.status === "completed" &&
            /Isi versi kedua/.test(odtMeta.d.extraction.extractedText ?? ""),
          odtMeta.d.extraction,
        );
        r = await j("POST", "/office/config", { uploadId: odt.d.id }, at);
        ok("office ODT editable (lossy)", r.d.access === "edit" && r.d.lossy === true, r.d);
        r = await j("POST", "/office/documents", { templateId: odt.d.id }, at);
        ok("office ODT template → new DOCX (converted)", r.s === 201 && r.d.originalName === "uji.docx", r);
        if (r.d?.id) await j("DELETE", `/uploads/${r.d.id}`, null, at);
        await j("DELETE", `/uploads/${odt.d.id}`, null, at);
        await j("DELETE", `/uploads/${edited.d.id}`, null, at);
      }
    }
    await j("DELETE", "/records/para_resource/sm-office", null, at);
    r = await j("DELETE", `/uploads/${docId}`, null, at);
    ok("office doc delete (with versions)", r.s === 200, r);
    r = await j("GET", `/office/files/${finalPdf.d.id}/links`, null, at);
    ok("office final kept when draft deleted (link cleared)", r.s === 200 && r.d.draft === null, r);
    await j("DELETE", `/uploads/${finalPdf.d.id}`, null, at);
  }

  // ---------------------------------------------------------------- Basis pengetahuan & chat AI (tanpa provider AI)
  r = await j("GET", "/ai/profile", null, at);
  ok("ai profile empty", r.s === 200 && r.d.profile === null, r);
  r = await j("PUT", "/ai/profile", { profile: "  Analis BMN smoke.  " }, at);
  ok("ai profile save (trimmed)", r.s === 200 && r.d.profile === "Analis BMN smoke.", r);
  r = await j("PUT", "/ai/profile", { profile: "x".repeat(6001) }, at);
  ok("ai profile too long 400", r.s === 400, r);
  r = await j("GET", "/ai/profile", null, pt);
  ok("ai profile isolated per user", r.s === 200 && r.d.profile === null, r);
  r = await j("GET", "/ai/chat/conversations", null, at);
  ok("ai chat conversations empty", r.s === 200 && Array.isArray(r.d) && r.d.length === 0, r);
  r = await j("POST", "/ai/chat", { message: "Halo" }, at);
  ok("ai chat without provider → 400", r.s === 400, r);
  r = await j("GET", "/ai/chat/conversations", null, at);
  ok("ai chat failed call saves nothing", r.s === 200 && r.d.length === 0, r);
  r = await j("POST", "/ai/chat", { message: "" }, at);
  ok("ai chat empty message 400", r.s === 400, r);
  r = await j("GET", "/ai/chat/conversations/tidak-ada/messages", null, at);
  ok("ai chat foreign/unknown conversation 404", r.s === 404, r);
  r = await j("GET", "/knowledge/status", null, at);
  ok("knowledge status (no vault yet)", r.s === 200 && r.d.folder === null && r.d.notes === 0, r);
  if (r.d?.configured) {
    r = await j("PUT", "/knowledge/vault", { folder: "../rahasia" }, at);
    ok("knowledge unsafe folder 400", r.s === 400, r);
    r = await j("PUT", "/knowledge/vault", { folder: "folder-tidak-ada-smoke" }, at);
    ok("knowledge missing folder 400", r.s === 400, r);
    r = await j("POST", "/knowledge/inbox", { title: "x", content: "y" }, at);
    ok("knowledge inbox without vault 400", r.s === 400, r);
    // Satu folder uji tetap (dipakai ulang tiap smoke) agar folder tidak menumpuk di server
    const vaultFolder = "smoke-vault";
    r = await j("POST", "/knowledge/vault/create", { folder: vaultFolder }, at);
    if (r.s === 409) r = await j("PUT", "/knowledge/vault", { folder: vaultFolder }, at);
    ok("knowledge create/use vault from template", (r.s === 201 || r.s === 200) && r.d.folder === vaultFolder, r);
    r = await j("PUT", "/knowledge/vault", { folder: vaultFolder }, pt);
    ok("knowledge vault folder of another user 409", r.s === 409, r);
    r = await j("POST", "/knowledge/scan", null, at);
    ok("knowledge scan template vault", r.s === 200 && r.d.notes >= 8 && r.d.problems.length === 0, r.d);
    r = await j("GET", "/knowledge/notes", null, at);
    const start = r.d?.find?.((n) => n.path === "Mulai di sini.md");
    ok("knowledge notes list", r.s === 200 && !!start && start.jenis === "panduan", r);
    r = await j("GET", `/knowledge/notes/${start?.id}`, null, pt);
    ok("knowledge note isolated 404", r.s === 404, r);
    r = await j("POST", "/knowledge/inbox", { title: "Usulan smoke", content: "Isi usulan", question: "Tanya?" }, at);
    ok("knowledge inbox note written", r.s === 201 && r.d.path.startsWith("00-Inbox/"), r);
    r = await j("PUT", "/knowledge/vault", { folder: null }, at);
    ok("knowledge release vault clears notes", r.s === 200 && r.d.folder === null && r.d.notes === 0, r);
  } else {
    console.log("SKIP knowledge vault (KNOWLEDGE_VAULTS_DIR tidak diatur)");
  }

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
