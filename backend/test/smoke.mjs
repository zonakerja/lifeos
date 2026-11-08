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
  // Jalur lewat router: hanya https publik / format sah; ganti jalur wajib key baru (key lama tidak dikirim ke alamat lain)
  r = await j("PUT", "/ai/settings/anthropic", { baseUrl: "ftp://router.example.com" }, at);
  ok("ai router url not https 400", r.s === 400, r);
  r = await j("PUT", "/ai/settings/anthropic", { baseUrl: "https://router.example.com/v1/" }, at);
  ok("ai router change without new key 400", r.s === 400 && /key/i.test(r.d.message), r);
  r = await j(
    "PUT",
    "/ai/settings/openai",
    { apiKey: fakeKey, baseUrl: "https://router.example.com/v1", apiFormat: "anthropic" },
    at,
  );
  ok("ai router format not allowed 400", r.s === 400, r);
  r = await j(
    "PUT",
    "/ai/settings/anthropic",
    { apiKey: fakeKey, baseUrl: "https://router.example.com/v1/", model: "claude-opus-5.5" },
    at,
  );
  const viaRouter = r.d.providers?.find((p) => p.id === "anthropic");
  ok(
    "ai router saved (normalized, anthropic format, label host)",
    r.s === 200 &&
      viaRouter.baseUrl === "https://router.example.com/v1" &&
      viaRouter.apiFormat === "anthropic" &&
      viaRouter.via === "router.example.com",
    r,
  );
  r = await j("PUT", "/ai/settings/anthropic", { apiKey: fakeKey, baseUrl: null }, at);
  ok("ai router back to direct", r.s === 200 && r.d.providers?.find((p) => p.id === "anthropic").baseUrl === null, r);
  r = await j("PATCH", "/ai/settings", { activeProvider: "openai" }, at);
  ok("ai activate unconfigured 400", r.s === 400, r);
  r = await j("PATCH", "/ai/settings", { activeProvider: "anthropic" }, at);
  ok("ai switch provider", r.s === 200 && r.d.activeProvider === "anthropic", r);
  // Cadangan per tugas: hanya provider yang punya key; efektif = cadangan yang benar-benar dipakai
  r = await j("PATCH", "/ai/settings", { routing: { agentBackup: "openai" } }, at);
  ok("ai task backup without key 400", r.s === 400, r);
  r = await j("PATCH", "/ai/settings", { routing: { agent: "anthropic", agentBackup: "gemini" } }, at);
  ok(
    "ai task backup saved",
    r.s === 200 &&
      r.d.routing.agentBackup === "gemini" &&
      r.d.effective.agent === "anthropic" &&
      r.d.effective.agentBackup === "gemini" &&
      r.d.effective.chatBackup === "gemini",
    r,
  );
  r = await j("PATCH", "/ai/settings", { routing: { agent: null, agentBackup: null } }, at);
  ok("ai task backup reset", r.s === 200 && r.d.routing.agentBackup === undefined, r);
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
  // Register Naskah Keluar SRIKANDI: kolom bertipe + isian formulir di `extra` kembali utuh, lalu dihapus
  const register = {
    id: "smoke-reg-1",
    formType: "keluar",
    subject: "Smoke register",
    number: "1/SMOKE/X/2026",
    status: "submitted",
    submittedAt: "2026-10-31T02:00:00.000Z",
    file: { uploadId: "u-smoke", name: "konsep.docx", owned: true },
    recipients: [{ id: "sr-1", label: "Kepala Biro" }],
    signer: { id: "sr-2", label: "Sesditjen" },
    visualTte: "qr",
  };
  r = await j("PUT", "/records/srikandi_outgoing/smoke-reg-1", { payload: register }, at);
  ok(
    "srikandi_outgoing round-trip",
    r.s === 200 &&
      r.d.payload.status === "submitted" &&
      r.d.payload.submittedAt === register.submittedAt &&
      same(r.d.payload.recipients, register.recipients) &&
      r.d.payload.file?.uploadId === "u-smoke" &&
      r.d.payload.file?.owned === true &&
      r.d.payload.signer?.label === "Sesditjen",
    r,
  );
  r = await j("DELETE", "/records/srikandi_outgoing/smoke-reg-1", null, at);
  ok("srikandi_outgoing delete", r.s === 200, r);
  // Entri terhapus / tanpa sesi SRIKANDI tidak pernah sampai ke robot
  r = await j("POST", "/robot/srikandi/register/smoke-reg-1", { dryRun: true }, at);
  ok("srikandi register deleted entry rejected", r.s === 404 || r.s === 400, r);
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
    // User baru tanpa key Gemini/OpenAI: tanpa provider & model embedding (pencarian kata saja)
    r.s === 200 &&
      r.d.enabled === true &&
      r.d.embeddingAvailable === false &&
      r.d.embeddingProvider === null &&
      r.d.model === null &&
      typeof r.d.chunks === "number",
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
    // Menu Pengetahuan: pohon, buat, properti (cek hash), cari, graf, ganti nama + tautan, hapus ke .trash, isolasi
    r = await j("GET", "/knowledge/tree", null, at);
    ok("knowledge tree", r.s === 200 && r.d.folders.includes("00-Inbox") && r.d.notes.length >= 8, r.d?.folders);
    const smokeTitle = `Smoke Catatan ${Date.now()}`;
    r = await j("POST", "/knowledge/notes", { folder: "20-Topik", title: smokeTitle, content: "status: uji\n" }, at);
    const smokeNote = r.d?.id;
    ok("knowledge create note", r.s === 201 && !!smokeNote, r);
    r = await j("POST", "/knowledge/notes", { title: "Rujukan smoke", content: `Lihat [[${smokeTitle}]].\n` }, at);
    const smokeRef = r.d?.id;
    r = await j("GET", `/knowledge/notes/${smokeNote}/source`, null, at);
    const smokeHash = r.d?.hash;
    ok("knowledge note source", r.s === 200 && smokeHash?.length === 64, r);
    r = await j(
      "PATCH",
      `/knowledge/notes/${smokeNote}/properties`,
      { set: { status: "berlaku" }, baseHash: smokeHash },
      at,
    );
    ok("knowledge set properties", r.s === 200 && r.d.raw.startsWith("---\nstatus: berlaku"), r);
    r = await j("PUT", `/knowledge/notes/${smokeNote}`, { content: "menimpa", baseHash: smokeHash }, at);
    ok("knowledge stale hash 409", r.s === 409, r);
    r = await j("GET", `/knowledge/search?q=${encodeURIComponent(`status:berlaku "${smokeTitle}"`)}`, null, at);
    ok("knowledge search operators", r.s === 200 && r.d[0]?.id === smokeNote, r.d);
    r = await j("GET", "/knowledge/graph", null, at);
    ok(
      "knowledge graph edge",
      r.s === 200 && r.d.edges.some((e) => e.source === smokeRef && e.target === smokeNote),
      r.d?.edges?.length,
    );
    r = await j("DELETE", `/knowledge/notes/${smokeNote}`, null, pt);
    ok("knowledge delete other user 404", r.s === 404 || r.s === 400, r);
    r = await j("POST", `/knowledge/notes/${smokeNote}/move`, { path: `20-Topik/${smokeTitle} baru` }, at);
    ok("knowledge rename updates links", r.s === 200 && r.d.updatedLinks === 1, r);
    const smokeRenamed = r.d?.id;
    r = await j("GET", `/knowledge/notes/${smokeRef}/source`, null, at);
    ok("knowledge link renamed", r.d?.raw?.includes(`[[${smokeTitle} baru]]`), r.d);
    for (const id of [smokeRenamed, smokeRef]) r = await j("DELETE", `/knowledge/notes/${id}`, null, at);
    ok("knowledge delete to trash", r.s === 200 && r.d.trash.startsWith(".trash/"), r);
    r = await j("GET", `/knowledge/attachment?path=${encodeURIComponent("Mulai di sini.md")}`, null, at);
    ok("knowledge attachment only images 400", r.s === 400, r);
    r = await j("GET", `/knowledge/attachment?path=${encodeURIComponent("tidak-ada.png")}`, null, at);
    ok("knowledge attachment missing image 404", r.s === 404, r);
    // Catatan harian (K1) & catatan serupa (K4)
    r = await j("POST", "/knowledge/daily", { date: "2026-11-06" }, at);
    const dailyId = r.d?.id;
    ok("knowledge daily note created", r.s === 201 && r.d.created === true && r.d.path === "Harian/2026-11-06.md", r);
    r = await j("POST", "/knowledge/daily", { date: "2026-11-06" }, at);
    ok("knowledge daily note reused", r.s === 201 && r.d.created === false && r.d.id === dailyId, r);
    r = await j("GET", `/knowledge/notes/${dailyId}/source`, null, at);
    ok(
      "knowledge daily note content",
      r.s === 200 && r.d.raw.includes("## Agenda") && r.d.raw.includes("jenis: harian"),
      r.d,
    );
    r = await j("POST", "/knowledge/daily", { date: "2026-02-30" }, at);
    ok("knowledge daily invalid date 400", r.s === 400, r);
    // Catatan berkala (lanjutan K1): mingguan (minggu ISO) & bulanan, dibuat sekali
    r = await j("POST", "/knowledge/daily", { date: "2026-11-06", period: "week" }, at);
    const weeklyId = r.d?.id;
    ok("knowledge weekly note created", r.s === 201 && r.d.created === true && r.d.path === "Mingguan/2026-W45.md", r);
    r = await j("GET", `/knowledge/notes/${weeklyId}/source`, null, at);
    ok(
      "knowledge weekly note content",
      r.s === 200 && r.d.raw.includes("[[Harian/2026-11-06|Jum 6]]") && r.d.raw.includes("jenis: mingguan"),
      r.d,
    );
    r = await j("POST", "/knowledge/daily", { date: "2026-11-02", period: "week" }, at);
    ok("knowledge weekly note reused", r.s === 201 && r.d.created === false && r.d.id === weeklyId, r);
    r = await j("POST", "/knowledge/daily", { date: "2026-11-06", period: "month" }, at);
    const monthlyId = r.d?.id;
    ok("knowledge monthly note created", r.s === 201 && r.d.path === "Bulanan/2026-11.md", r);
    r = await j("POST", "/knowledge/daily", { date: "2026-11-06", period: "year" }, at);
    ok("knowledge periodic invalid period 400", r.s === 400, r);
    for (const id of [weeklyId, monthlyId]) if (id) await j("DELETE", `/knowledge/notes/${id}`, null, at);
    r = await j("GET", `/knowledge/notes/${dailyId}/similar`, null, at);
    ok("knowledge similar", r.s === 200 && typeof r.d.available === "boolean" && Array.isArray(r.d.items), r);
    r = await j("GET", `/knowledge/notes/${dailyId}/similar`, null, pt);
    ok("knowledge similar isolated 404", r.s === 404, r);
    // Tugas lintas vault (K3): ringkasan LifeOS di catatan harian tidak ikut, centang ditulis balik ke berkas
    r = await j(
      "POST",
      "/knowledge/notes",
      { title: "Smoke tugas", content: "- [ ] Smoke tugas A 📅 2026-11-10\n- [x] Smoke tugas B ✅ 2026-11-01\n" },
      at,
    );
    const taskNoteId = r.d?.id;
    r = await j("GET", "/knowledge/tasks", null, at);
    const smokeTasks = (r.d?.tasks ?? []).filter((t) => t.noteId === taskNoteId);
    ok(
      "knowledge tasks list",
      r.s === 200 &&
        smokeTasks.length === 2 &&
        smokeTasks[0].due === "2026-11-10" &&
        !(r.d.tasks ?? []).some((t) => t.noteId === dailyId),
      r.d,
    );
    r = await j(
      "POST",
      "/knowledge/tasks/toggle",
      { noteId: taskNoteId, index: 0, raw: smokeTasks[0]?.raw, done: true, today: "2026-11-07" },
      at,
    );
    ok("knowledge task toggle", r.s === 200, r);
    r = await j("GET", `/knowledge/notes/${taskNoteId}/source`, null, at);
    ok("knowledge task written back", r.d?.raw?.startsWith("- [x] Smoke tugas A 📅 2026-11-10 ✅ 2026-11-07"), r.d);
    r = await j(
      "POST",
      "/knowledge/tasks/toggle",
      { noteId: taskNoteId, index: 0, raw: "- [ ] sudah berubah", done: true, today: "2026-11-07" },
      at,
    );
    ok("knowledge task changed elsewhere 409", r.s === 409, r);
    r = await j(
      "POST",
      "/knowledge/tasks/toggle",
      { noteId: taskNoteId, index: 0, raw: smokeTasks[0]?.raw, done: true, today: "2026-11-07" },
      pt,
    );
    ok("knowledge task toggle isolated 404", r.s === 404, r);
    await j("DELETE", `/knowledge/notes/${taskNoteId}`, null, at);
    // Riwayat versi (K7): isi sebelum ditimpa LifeOS tersimpan & bisa dipulihkan
    r = await j("POST", "/knowledge/notes", { title: "Smoke versi", content: "Isi pertama" }, at);
    const versionNoteId = r.d?.id;
    r = await j("GET", `/knowledge/notes/${versionNoteId}/source`, null, at);
    r = await j("PUT", `/knowledge/notes/${versionNoteId}`, { content: "Isi kedua", baseHash: r.d.hash }, at);
    const afterSaveHash = r.d?.hash;
    r = await j("GET", `/knowledge/notes/${versionNoteId}/versions`, null, at);
    const firstVersion = (r.d ?? []).find((v) => v.reason === "before_save");
    ok("knowledge versions recorded", r.s === 200 && !!firstVersion && !firstVersion.current, r.d);
    r = await j("GET", `/knowledge/notes/${versionNoteId}/versions/${firstVersion?.id}`, null, at);
    ok("knowledge version content", r.s === 200 && r.d.content === "Isi pertama", r.d);
    r = await j("GET", `/knowledge/notes/${versionNoteId}/versions/${firstVersion?.id}`, null, pt);
    ok("knowledge version isolated 404", r.s === 404, r);
    r = await j(
      "POST",
      `/knowledge/notes/${versionNoteId}/versions/${firstVersion?.id}/restore`,
      { baseHash: "0".repeat(64) },
      at,
    );
    ok("knowledge version restore stale 409", r.s === 409, r);
    r = await j(
      "POST",
      `/knowledge/notes/${versionNoteId}/versions/${firstVersion?.id}/restore`,
      { baseHash: afterSaveHash },
      at,
    );
    ok("knowledge version restored", r.s === 200 && r.d.raw === "Isi pertama", r.d);
    r = await j("GET", `/knowledge/notes/${versionNoteId}/versions`, null, at);
    ok(
      "knowledge version before restore kept",
      (r.d ?? []).some((v) => v.reason === "before_restore"),
      r.d,
    );
    await j("DELETE", `/knowledge/notes/${versionNoteId}`, null, at);
    // Canvas (K8): berkas .canvas (JSON Canvas) dibaca/ditulis utuh, bentuk diperiksa, berubah di disk → 409
    r = await j("POST", "/knowledge/canvases", { name: "Smoke canvas" }, at);
    const canvasPath = r.d?.path;
    ok("knowledge canvas created", r.s === 201 && canvasPath?.endsWith(".canvas") && r.d.data.nodes.length === 1, r);
    const canvasHash = r.d?.hash;
    const canvasData = {
      nodes: [
        { id: "a", type: "text", text: "Alur ORCA4417 pengajuan", x: 0, y: 0, width: 200, height: 100 },
        { id: "b", type: "file", file: "Mulai di sini.md", x: 300, y: 0, width: 300, height: 200 },
      ],
      edges: [{ id: "e", fromNode: "a", toNode: "b" }],
    };
    r = await j("PUT", "/knowledge/canvases/file", { path: canvasPath, baseHash: canvasHash, data: canvasData }, at);
    ok("knowledge canvas saved", r.s === 200 && r.d.data.edges.length === 1 && r.d.hash !== canvasHash, r.d);
    r = await j("PUT", "/knowledge/canvases/file", { path: canvasPath, baseHash: canvasHash, data: canvasData }, at);
    ok("knowledge canvas stale hash 409", r.s === 409, r);
    r = await j("GET", `/knowledge/canvases/file?path=${encodeURIComponent(canvasPath)}`, null, at);
    r = await j(
      "PUT",
      "/knowledge/canvases/file",
      {
        path: canvasPath,
        baseHash: r.d.hash,
        data: { nodes: canvasData.nodes, edges: [{ id: "x", fromNode: "a", toNode: "z" }] },
      },
      at,
    );
    ok("knowledge canvas invalid edge 400", r.s === 400, r);
    r = await j("GET", "/knowledge/canvases", null, at);
    ok("knowledge canvases list", r.s === 200 && r.d.some((c) => c.path === canvasPath), r.d);
    r = await j("GET", `/knowledge/canvases/file?path=${encodeURIComponent(canvasPath)}`, null, pt);
    ok("knowledge canvas isolated", r.s !== 200, r);
    // Isi canvas ikut indeks RAG (koleksi knowledge, sourceId = path) dan hilang saat canvas dihapus
    const canvasHits = async (present) => {
      for (let i = 0; i < 30; i++) {
        const res = await j("GET", "/ai/index/search?q=ORCA4417", null, at);
        const found = (res.d ?? []).some((h) => h.sourceType === "obsidian_canvas" && h.sourceId === canvasPath);
        if (found === present) return true;
        await new Promise((done) => setTimeout(done, 500));
      }
      return false;
    };
    ok("knowledge canvas indexed", await canvasHits(true));
    r = await j("DELETE", `/knowledge/canvases/file?path=${encodeURIComponent(canvasPath)}`, null, at);
    ok("knowledge canvas to trash", r.s === 200 && r.d.trash.startsWith(".trash/"), r);
    ok("knowledge canvas unindexed after delete", await canvasHits(false));
    // Note composer (K9): gabung & ekstrak; perujuk + canvas ikut, sumber ke .trash, hash basi → 409
    const stamp = Date.now();
    const srcName = `Komposer Sumber ${stamp}`;
    const dstName = `Komposer Tujuan ${stamp}`;
    const refName = `Komposer Rujukan ${stamp}`;
    const mk = async (title, content) => (await j("POST", "/knowledge/notes", { title, content }, at)).d;
    const srcNote = await mk(srcName, `---\njenis: topik\ntags:\n  - sumber\n---\n# ${srcName}\n\nIsi sumber ^b1\n`);
    const dstNote = await mk(dstName, "---\nstatus: berlaku\n---\nIsi tujuan ^b1\n");
    const refNote = await mk(refName, `Lihat [[${srcName}]] dan [[${srcName}#^b1|blok]].\n`);
    r = await j("POST", "/knowledge/canvases", { name: `Komposer ${stamp}` }, at);
    const composeCanvas = r.d?.path;
    await j(
      "PUT",
      "/knowledge/canvases/file",
      {
        path: composeCanvas,
        baseHash: r.d?.hash,
        data: {
          nodes: [{ id: "n", type: "file", file: srcNote.path, x: 0, y: 0, width: 200, height: 100 }],
          edges: [],
        },
      },
      at,
    );
    const hashOf = async (id, token = at) => (await j("GET", `/knowledge/notes/${id}/source`, null, token)).d;
    let srcSource = await hashOf(srcNote.id);
    let dstSource = await hashOf(dstNote.id);
    const mergeBody = { targetId: dstNote.id, targetHash: dstSource.hash, baseHash: srcSource.hash };
    r = await j("POST", `/knowledge/notes/${srcNote.id}/merge`, { ...mergeBody, baseHash: "basi" }, at);
    ok("knowledge merge stale hash 409", r.s === 409, r);
    r = await j("POST", `/knowledge/notes/${srcNote.id}/merge`, { ...mergeBody, targetId: srcNote.id }, at);
    ok("knowledge merge into itself 400", r.s === 400, r);
    r = await j("POST", `/knowledge/notes/${srcNote.id}/merge`, mergeBody, pt);
    ok("knowledge merge isolated", r.s !== 200, r);
    r = await j("POST", `/knowledge/notes/${srcNote.id}/merge`, mergeBody, at);
    ok("knowledge merge ok", r.s === 200 && r.d.path === dstNote.path && r.d.trash?.startsWith(".trash/"), r);
    ok("knowledge merge counts", r.d?.updatedLinks === 2 && r.d?.updatedCanvases === 1, r.d);
    const mergedId = r.d?.id;
    dstSource = await hashOf(mergedId);
    ok(
      "knowledge merge content",
      dstSource.raw.includes(`## ${srcName}`) &&
        dstSource.raw.includes("Isi sumber ^b1-2") &&
        dstSource.raw.includes("jenis: topik") &&
        dstSource.raw.includes("status: berlaku") &&
        dstSource.raw.includes(srcName),
      dstSource.raw,
    );
    r = await hashOf(refNote.id);
    ok(
      "knowledge merge referrers",
      r.raw.includes(`[[${dstName}#${srcName}|${srcName}]]`) && r.raw.includes(`[[${dstName}#^b1-2|blok]]`),
      r.raw,
    );
    r = await j("GET", `/knowledge/canvases/file?path=${encodeURIComponent(composeCanvas)}`, null, at);
    ok(
      "knowledge merge canvas retargeted",
      r.d?.data?.nodes?.[0]?.file === dstNote.path && r.d?.data?.nodes?.[0]?.subpath === `#${srcName}`,
      r.d,
    );
    r = await j("GET", `/knowledge/notes/${srcNote.id}`, null, at);
    ok("knowledge merge source gone", r.s === 404, r);
    // Ekstrak: posisi + teks dicocokkan, sisa di asal = tautan
    const selected = "Isi tujuan ^b1";
    const from = dstSource.raw.indexOf(selected);
    const extractBody = { from, to: from + selected.length, text: selected, baseHash: dstSource.hash };
    r = await j(
      "POST",
      `/knowledge/notes/${mergedId}/extract`,
      { ...extractBody, newTitle: `Komposer Hasil ${stamp}`, text: "bukan" },
      at,
    );
    ok("knowledge extract stale selection 409", r.s === 409, r);
    r = await j(
      "POST",
      `/knowledge/notes/${mergedId}/extract`,
      { ...extractBody, newTitle: `Komposer Hasil ${stamp}` },
      at,
    );
    ok("knowledge extract ok", r.s === 200 && r.d.path === `Komposer Hasil ${stamp}.md`, r);
    const extractedId = r.d?.id;
    dstSource = await hashOf(mergedId);
    srcSource = await hashOf(extractedId);
    ok(
      "knowledge extract both sides",
      dstSource.raw.includes(`[[Komposer Hasil ${stamp}]]`) &&
        !dstSource.raw.includes(selected) &&
        srcSource.raw.includes(selected),
      dstSource.raw,
    );
    r = await j("GET", `/knowledge/notes/${mergedId}/versions`, null, at);
    ok(
      "knowledge compose versions recorded",
      (r.d ?? []).some((v) => v.reason === "before_extract"),
      r.d,
    );
    // Ganti nama catatan: canvas ikut (celah lama)
    r = await j("POST", `/knowledge/notes/${mergedId}/move`, { path: `Komposer Pindah ${stamp}.md` }, at);
    const movedComposeId = r.d?.id;
    r = await j("GET", `/knowledge/canvases/file?path=${encodeURIComponent(composeCanvas)}`, null, at);
    ok("knowledge rename updates canvas", r.d?.data?.nodes?.[0]?.file === `Komposer Pindah ${stamp}.md`, r.d);
    for (const id of [movedComposeId, refNote.id, extractedId]) await j("DELETE", `/knowledge/notes/${id}`, null, at);
    await j("DELETE", `/knowledge/canvases/file?path=${encodeURIComponent(composeCanvas)}`, null, at);
    // Bases (K2): berkas .base dibaca/ditulis sebagai YAML, berubah di disk → 409
    r = await j("POST", "/knowledge/bases", { name: "Smoke base" }, at);
    const basePath = r.d?.path;
    ok("knowledge base created", r.s === 201 && basePath?.endsWith(".base") && r.d.data.views?.length === 1, r);
    r = await j("GET", "/knowledge/bases", null, at);
    ok("knowledge bases list", r.s === 200 && r.d.some((b) => b.path === basePath), r.d);
    r = await j("GET", `/knowledge/bases/file?path=${encodeURIComponent(basePath)}`, null, at);
    const baseHash = r.d?.hash;
    r = await j(
      "PUT",
      "/knowledge/bases/file",
      {
        path: basePath,
        baseHash,
        data: { filters: { and: ['status == "berlaku"'] }, views: [{ type: "cards", name: "Kartu" }] },
      },
      at,
    );
    ok("knowledge base saved", r.s === 200 && r.d.data.views[0].type === "cards" && r.d.data.filters, r.d);
    r = await j("PUT", "/knowledge/bases/file", { path: basePath, baseHash, data: { views: [] } }, at);
    ok("knowledge base stale hash 409", r.s === 409, r);
    r = await j("GET", `/knowledge/bases/file?path=${encodeURIComponent("Mulai di sini.md")}`, null, at);
    ok("knowledge base only .base 400", r.s === 400, r);
    r = await j("GET", `/knowledge/bases/file?path=${encodeURIComponent(basePath)}`, null, pt);
    ok("knowledge base isolated", r.s !== 200, r);
    r = await j("DELETE", `/knowledge/bases/file?path=${encodeURIComponent(basePath)}`, null, at);
    ok("knowledge base to trash", r.s === 200 && r.d.trash.startsWith(".trash/"), r);
    await j("DELETE", `/knowledge/notes/${dailyId}`, null, at);
    await j("DELETE", "/knowledge/folders?path=Harian", null, at);
    // Cermin hasil kerja LifeOS → 80-LifeOS (satu arah, baca saja di menu Pengetahuan)
    r = await j("GET", "/knowledge/export", null, at);
    ok("knowledge export default off", r.s === 200 && r.d.enabled === false && r.d.vaultReady === true, r);
    const mirrorId = `smoke-mirror-${Date.now()}`;
    await j("PUT", `/records/free_note/${mirrorId}`, { payload: { title: "Cermin smoke", content: "isi cermin" } }, at);
    r = await j("PUT", "/knowledge/export", { enabled: true, kinds: { productivity: false } }, at);
    ok("knowledge export enable", r.s === 200 && r.d.enabled && r.d.kinds.productivity === false, r);
    r = await j("POST", "/knowledge/export/run", null, at);
    ok("knowledge export run", r.s === 200 && r.d.files >= 2 && !r.d.lastError, r.d);
    r = await j("GET", "/knowledge/tree", null, at);
    const mirrorNote = r.d?.notes?.find?.((n) => n.path === "80-LifeOS/Catatan Bebas/Cermin smoke.md");
    ok(
      "knowledge export file in vault",
      !!mirrorNote && mirrorNote.properties?.sumber === "lifeos",
      r.d?.notes?.length,
    );
    r = await j("GET", `/knowledge/notes/${mirrorNote?.id}/source`, null, at);
    r = await j("PUT", `/knowledge/notes/${mirrorNote?.id}`, { content: "ubah", baseHash: r.d?.hash }, at);
    ok("knowledge mirror note read-only 400", r.s === 400, r);
    r = await j("DELETE", "/knowledge/export/files", null, at);
    ok("knowledge export clear", r.s === 200 && r.d.removed >= 2, r.d);
    r = await j("PUT", "/knowledge/export", { enabled: false }, at);
    await j("DELETE", `/records/free_note/${mirrorId}`, null, at);
    ok("knowledge export disable", r.s === 200 && r.d.enabled === false, r);
    r = await j("PUT", "/knowledge/vault", { folder: null }, at);
    ok("knowledge release vault clears notes", r.s === 200 && r.d.folder === null && r.d.notes === 0, r);
  } else {
    console.log("SKIP knowledge vault (KNOWLEDGE_VAULTS_DIR tidak diatur)");
  }

  // ---------------------------------------------------------------- Integrasi agen: token akses + MCP
  const mcp = async (token, method, params = {}) => {
    const res = await fetch(`${B}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return { s: res.status, d: await res.json().catch(() => null) };
  };
  r = await j("GET", "/integrations/scopes", null, at);
  ok("integrations scopes", r.s === 200 && r.d.length === 8, r);
  r = await j("POST", "/integrations/tokens", { name: "x", scopes: [] }, at);
  ok("token without scopes 400", r.s === 400, r);
  r = await j("POST", "/integrations/tokens", { name: "x", scopes: ["admin:all"] }, at);
  ok("token unknown scope 400", r.s === 400, r);
  r = await j(
    "POST",
    "/integrations/tokens",
    { name: "Smoke agen", scopes: ["workspace:read", "workspace:write"], expiresInDays: 1 },
    at,
  );
  ok("token create (plain token once)", r.s === 201 && r.d.token?.startsWith("lifeos_pat_") && r.d.expiresAt, r);
  const pat = r.d.token;
  const patId = r.d.id;
  r = await j("GET", "/integrations/tokens", null, at);
  // Akun admin dev bisa punya token "Agen Hermes (otomatis)" dari Siapkan agen → cek token smoke saja
  ok(
    "token list hides plain token",
    r.s === 200 && r.d.some((t) => t.id === patId) && r.d.every((t) => !("token" in t)),
    r,
  );
  r = await j("GET", "/integrations/tokens", null, pt);
  ok("token list isolated per user", r.s === 200 && r.d.length === 0, r);
  r = await j("DELETE", `/integrations/tokens/${patId}`, null, pt);
  ok("revoke other user's token 404", r.s === 404, r);

  // Proxy model agen Hermes (OpenAI-compatible): hanya token berizin ai:model; tanpa memanggil provider sungguhan
  r = await j("GET", "/agent/llm/v1/models");
  ok("agent llm without token 401", r.s === 401, r);
  r = await j("GET", "/agent/llm/v1/models", null, at);
  ok("agent llm rejects login JWT", r.s === 401, r);
  r = await j("POST", "/agent/llm/v1/chat/completions", { messages: [{ role: "user", content: "x" }] }, pat);
  ok("agent llm needs ai:model scope", r.s === 403 && !!r.d?.error?.message, r);
  {
    const modelPat = await j("POST", "/integrations/tokens", { name: "Smoke model", scopes: ["ai:model"] }, at);
    r = await j("GET", "/agent/llm/v1/models", null, modelPat.d.token);
    ok("agent llm models list", r.s === 200 && r.d.data?.[0]?.id === "lifeos-agent", r);
    r = await j("POST", "/agent/llm/v1/chat/completions", { model: "lifeos-agent", messages: [] }, modelPat.d.token);
    ok("agent llm empty messages 400", r.s === 400 && !!r.d?.error?.message, r);
    await j("DELETE", `/integrations/tokens/${modelPat.d.id}`, null, at);
  }
  r = await mcp(pat, "tools/list");
  const toolNames = (r.d?.result?.tools ?? [])
    .map((t) => t.name)
    .sort()
    .join(",");
  ok(
    "mcp tools/list filtered by scopes",
    r.s === 200 && toolNames === "create_todo,list_agenda,list_open_tasks,search_workspace",
    toolNames,
  );
  r = await mcp(pat, "tools/call", { name: "create_todo", arguments: { title: "Smoke MCP todo", date: "2026-10-25" } });
  const mcpTodo = r.d?.result && !r.d.result.isError ? JSON.parse(r.d.result.content[0].text) : null;
  ok("mcp create_todo", r.s === 200 && mcpTodo?.created === true, r.d);
  r = await j("GET", "/records/todo", null, at);
  ok(
    "mcp todo stored as owner's record",
    r.d?.some?.((t) => t.clientId === mcpTodo?.id && t.payload.date === "Sun Oct 25 2026"),
    r.d?.length,
  );
  r = await j("GET", "/records/todo", null, pt);
  ok("mcp todo not visible to other user", !r.d?.some?.((t) => t.clientId === mcpTodo?.id), r.d?.length);
  r = await mcp(pat, "tools/call", { name: "search_knowledge", arguments: { query: "x" } });
  ok("mcp tool outside scope rejected", r.s === 200 && (r.d?.error || r.d?.result?.isError), r.d);
  r = await mcp(pat, "tools/call", { name: "list_agenda", arguments: { from: "bukan-tanggal" } });
  ok("mcp invalid date → tool error", r.d?.result?.isError === true, r.d);
  r = await j("GET", "/integrations/activity", null, at);
  ok(
    "agent activity logged",
    r.s === 200 &&
      r.d.some((a) => a.tool === "create_todo" && a.status === "ok") &&
      r.d.some((a) => a.status === "error"),
    r.d,
  );
  r = await mcp("lifeos_pat_" + "x".repeat(43), "tools/list");
  ok("mcp unknown token 401", r.s === 401, r);
  r = await mcp(at, "tools/list");
  ok("mcp login JWT rejected 401", r.s === 401, r);
  r = await j("DELETE", `/integrations/tokens/${patId}`, null, at);
  ok("token revoke", r.s === 200, r);
  r = await mcp(pat, "tools/list");
  ok("mcp revoked token 401", r.s === 401, r);
  if (mcpTodo?.id) await j("DELETE", `/records/todo/${mcpTodo.id}`, null, at);

  // ---- Pengajuan & Antrian Verifikasi (tahap 4 docs/AI-AGENT.md)
  {
    const { default: Zip } = await import("pizzip");
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const tplZip = new Zip();
    tplZip.file(
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    tplZip.file(
      "_rels/.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    tplZip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:t>Nomor: \${nomor_naskah}</w:t></w:r></w:p><w:p><w:r><w:t>Hal: \${hal}</w:t></w:r></w:p><w:p><w:r><w:t>[Paragraf pembuka]</w:t></w:r></w:p></w:body></w:document>`,
    );
    const reqTplForm = new FormData();
    reqTplForm.append("file", new Blob([tplZip.generate({ type: "uint8array" })]), "Nota Smoke.docx");
    reqTplForm.append("context", "office-template");
    const reqTpl = await j("POST", "/uploads", reqTplForm, at);
    const letterForm = new FormData();
    letterForm.append("file", new Blob(["Mohon PSP 3 unit laptop Satker Smoke."], { type: "text/plain" }), "surat.txt");
    letterForm.append("context", "request");
    const letter = await j("POST", "/uploads", letterForm, at);
    const strangerForm = new FormData();
    strangerForm.append("file", new Blob(["x"], { type: "text/plain" }), "asing.txt");
    const stranger = await j("POST", "/uploads", strangerForm, pt);

    r = await j("POST", "/requests", { kind: "asing", title: "x" }, at);
    ok("request invalid kind 400", r.s === 400, r);
    r = await j("POST", "/requests", { kind: "psp", title: "x", uploadIds: [stranger.d.id] }, at);
    ok("request with other user's file 400", r.s === 400, r);
    r = await j(
      "POST",
      "/requests",
      {
        kind: "psp",
        title: "PSP laptop Smoke",
        applicant: "Satker Smoke",
        letterDate: "2026-10-20",
        uploadIds: [letter.d.id],
      },
      at,
    );
    const reqId = r.d?.id;
    ok(
      "request create (attachments + history baru)",
      r.s === 201 &&
        r.d.status === "baru" &&
        r.d.source === "manual" &&
        r.d.attachments[0]?.name === "surat.txt" &&
        r.d.files[0]?.uploadId === letter.d.id &&
        r.d.history.length === 1,
      r,
    );
    r = await j("GET", `/requests/${reqId}`, null, pt);
    ok("request isolated per user 404", r.s === 404, r);
    r = await j("GET", "/requests?status=baru", null, at);
    ok("request list filtered by status", r.s === 200 && r.d.some((x) => x.id === reqId), r);
    r = await j("GET", "/requests?status=dikirim", null, at);
    ok("request list other status excludes", r.s === 200 && !r.d.some((x) => x.id === reqId), r);
    r = await j("POST", `/requests/${reqId}/analyze`, null, at);
    ok("request analyze without AI key 4xx", r.s >= 400 && r.s < 500, r);

    r = await j("GET", `/requests/templates/${reqTpl.d.id}/fields`, null, at);
    ok(
      "request template fields (SRIKANDI tag flagged, instruction slot)",
      r.s === 200 &&
        r.d.tags.some((t) => t.name === "hal" && !t.srikandi) &&
        r.d.tags.some((t) => t.name === "nomor_naskah" && t.srikandi) &&
        r.d.slots[0]?.instruction === "Paragraf pembuka",
      r,
    );
    r = await j("GET", `/requests/templates/${letter.d.id}/fields`, null, at);
    ok("request template must be office-template 404", r.s === 404, r);
    r = await j("GET", `/requests/templates/${reqTpl.d.id}/fields`, null, pt);
    ok("request template of other user 404", r.s === 404, r);
    r = await j(
      "POST",
      `/requests/${reqId}/documents`,
      { templateId: reqTpl.d.id, values: { hal: "PSP Laptop", __petunjuk_1: "Menindaklanjuti surat Saudara." } },
      at,
    );
    const generated = r.d?.document;
    ok(
      "request document from template → menunggu verifikasi",
      r.s === 201 && generated?.name.endsWith(".docx") && r.d.request.status === "menunggu_verifikasi",
      r,
    );
    const genRes = await fetch(`${B}/uploads/${generated?.uploadId}`, { headers: { Authorization: `Bearer ${at}` } });
    const genXml = new Zip(Buffer.from(await genRes.arrayBuffer())).file("word/document.xml")?.asText() ?? "";
    ok(
      "request document filled (SRIKANDI tag kept)",
      genRes.status === 200 &&
        genXml.includes("Hal: PSP Laptop") &&
        genXml.includes("Menindaklanjuti surat Saudara.") &&
        genXml.includes("${nomor_naskah}"),
      genXml.slice(0, 300),
    );
    r = await j("PATCH", `/requests/${reqId}`, { status: "disetujui", statusNote: "Sudah diperiksa" }, at);
    ok(
      "request approve by user (history note)",
      r.s === 200 &&
        r.d.status === "disetujui" &&
        r.d.history.at(-1)?.note === "Sudah diperiksa" &&
        r.d.history.at(-1)?.by === "user",
      r,
    );
    r = await j("PATCH", `/requests/${reqId}`, { status: "asing" }, at);
    ok("request invalid status 400", r.s === 400, r);

    // MCP: agen mencatat pengajuan (status Baru, sumber mcp) — persetujuan tetap di tangan pemilik
    r = await j(
      "POST",
      "/integrations/tokens",
      { name: "Smoke pengajuan", scopes: ["requests:read", "requests:write"], expiresInDays: 1 },
      at,
    );
    const reqPat = r.d.token;
    r = await mcp(reqPat, "tools/list");
    ok(
      "mcp request tools by scope",
      [
        "analyze_request",
        "create_request",
        "get_request",
        "list_requests",
        "list_templates",
        "get_template_fields",
        "read_request_files",
        "update_request",
        "create_request_document",
      ].every((n) => (r.d?.result?.tools ?? []).some((t) => t.name === n)) &&
        !(r.d?.result?.tools ?? []).some((t) => t.name === "create_todo"),
      r.d,
    );
    r = await mcp(reqPat, "tools/call", {
      name: "create_request",
      arguments: { kind: "surat", title: "Surat Satker via agen", message: "Mohon penjelasan." },
    });
    const mcpReq = r.d?.result && !r.d.result.isError ? JSON.parse(r.d.result.content[0].text) : null;
    ok("mcp create_request", mcpReq?.created === true, r.d);
    r = await j("GET", `/requests/${mcpReq?.id}`, null, at);
    ok(
      "mcp request stored (source mcp, by agen)",
      r.s === 200 && r.d.source === "mcp" && r.d.history[0].by === "agen",
      r,
    );
    r = await mcp(reqPat, "tools/call", { name: "list_requests", arguments: {} });
    ok(
      "mcp list_requests",
      !r.d?.result?.isError && r.d?.result?.content[0].text.includes("Surat Satker via agen"),
      r.d,
    );
    // Alat skill agen (docs/AI-AGENT.md §22): templat, berkas, simpan telaah, dokumen dari templat — tanpa persetujuan
    const call = async (name, args) => {
      const res = await mcp(reqPat, "tools/call", { name, arguments: args });
      return { error: !!res.d?.result?.isError, text: res.d?.result?.content?.[0]?.text ?? "", raw: res.d };
    };
    let t = await call("list_templates", { query: "nota smoke" });
    ok("mcp list_templates", !t.error && t.text.includes(reqTpl.d.id), t.raw);
    t = await call("get_template_fields", { templateId: reqTpl.d.id });
    ok("mcp get_template_fields", !t.error && t.text.includes("nomor_naskah") && t.text.includes("hal"), t.raw);
    t = await call("read_request_files", { requestId: mcpReq?.id });
    ok("mcp read_request_files (no files)", !t.error && t.text.includes("belum punya berkas"), t.raw);
    t = await call("update_request", {
      requestId: mcpReq?.id,
      review: "## Telaah\nUji agen.",
      notes: "Kelengkapan: surat permohonan ada.",
      submitForReview: true,
      note: "Telaah disusun agen",
    });
    ok("mcp update_request → menunggu verifikasi", !t.error && t.text.includes("Menunggu verifikasi"), t.raw);
    t = await call("create_request_document", {
      requestId: mcpReq?.id,
      templateId: reqTpl.d.id,
      values: { hal: "Uji agen" },
    });
    ok("mcp create_request_document", !t.error && t.text.includes('"created": true'), t.raw);
    // Verifikasi aset (Kebijakan Otomatis): skor dihitung server; aset tak dikenal → cabang telaah (dengan / tanpa master)
    t = await call("submit_asset_check", {
      requestId: mcpReq?.id,
      assets: [{ nup: "999999", kodeBarang: "0000000000", nama: "Aset smoke", nilai: "Rp1.000" }],
    });
    ok(
      "mcp submit_asset_check → telaah",
      !t.error && t.text.includes('"branch": "telaah"') && t.text.includes('"matched": 0'),
      t.raw,
    );
    r = await j("GET", `/requests/${mcpReq?.id}`, null, at);
    ok(
      "agent work stored (review, document, history by agen)",
      r.s === 200 &&
        r.d.status === "menunggu_verifikasi" &&
        r.d.review?.includes("Uji agen") &&
        r.d.documents?.length === 1 &&
        r.d.history.at(-1)?.by === "agen",
      r,
    );
    t = await call("update_request", { requestId: reqId, notes: "x", submitForReview: true });
    ok("mcp update_request rejects decided request", t.error, t.raw);

    r = await j("GET", "/integrations/tokens", null, at);
    const reqPatRow = r.d.find?.((t) => t.name === "Smoke pengajuan");
    if (reqPatRow) await j("DELETE", `/integrations/tokens/${reqPatRow.id}`, null, at);
    if (mcpReq?.id) await j("DELETE", `/requests/${mcpReq.id}`, null, at);

    // Asisten Agen (Hermes): hanya pemilik agen (HERMES_OWNER_EMAIL); tanpa Hermes/konfigurasi → 422, bukan 5xx
    r = await j("GET", "/agent/status", null, pt);
    ok("agent status for non-owner", r.s === 200 && r.d.owner === false && r.d.reachable === false, r);
    r = await j("GET", "/agent/skills", null, pt);
    ok("agent skills non-owner rejected", r.s === 403 || r.s === 422, r);
    r = await j("POST", "/agent/setup", {}, pt);
    ok("agent setup non-owner rejected", r.s === 403 || r.s === 422, r);
    r = await j("POST", `/agent/requests/${reqId}/run`, { skill: "telaah-pengajuan" }, pt);
    ok("agent run by non-owner rejected", r.s === 403 || r.s === 422, r);
    r = await j("POST", `/agent/requests/${reqId}/run`, { skill: "../x" }, at);
    ok("agent run invalid skill 400", r.s === 400, r);
    // Kebijakan Otomatis: hanya pemilik agen; validasi isian sebelum layanan
    r = await j("GET", "/agent/policies", null, pt);
    ok("agent policies non-owner rejected", r.s === 403 || r.s === 422, r);
    r = await j("POST", "/agent/policies/pause", { paused: true }, pt);
    ok("agent policies pause non-owner rejected", r.s === 403 || r.s === 422, r);
    r = await j("POST", `/agent/requests/${reqId}/auto/cancel`, null, pt);
    ok("agent auto cancel non-owner rejected", r.s === 403 || r.s === 422, r);
    r = await j(
      "POST",
      "/agent/policies",
      { name: "x", skill: "Bad", requestKind: "psp", groupCodes: [], mode: "selalu" },
      at,
    );
    ok("agent policy invalid input 400", r.s === 400, r);

    r = await j("DELETE", `/requests/${reqId}`, null, at);
    ok("request delete", r.s === 200, r);
    const goneLetter = await j("GET", `/uploads/${letter.d.id}/metadata`, null, at);
    const goneDoc = await j("GET", `/uploads/${generated?.uploadId}/metadata`, null, at);
    ok("request delete removes its files", goneLetter.s === 404 && goneDoc.s === 404, [goneLetter.s, goneDoc.s]);
    await j("DELETE", `/uploads/${reqTpl.d.id}`, null, at);
    await j("DELETE", `/uploads/${stranger.d.id}`, null, pt);
  }

  // ---- Bot WhatsApp (tahap 5 docs/AI-AGENT.md): grup, kontak, profil, simulator, pengajuan, status, kabar
  {
    const waitFor = async (fn, ms = 20_000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const value = await fn();
        if (value) return value;
        await new Promise((res) => setTimeout(res, 500));
      }
      return null;
    };
    const thread = async (phone, token = at) => (await j("GET", `/whatsapp/conversations/${phone}`, null, token)).d;
    const replyAfter = (phone, count) =>
      waitFor(async () => {
        const rows = await thread(phone);
        const outs = Array.isArray(rows) ? rows.filter((m) => m.direction === "out") : [];
        return outs.length >= count ? outs : null;
      });

    r = await fetch(`${B}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`);
    if (r.status === 404) {
      ok("wa webhook off without Meta credentials (404)", true);
      const post = await fetch(`${B}/whatsapp/webhook`, { method: "POST", body: "{}" });
      ok("wa webhook POST off (404)", post.status === 404, post.status);
    } else {
      ok("wa webhook rejects wrong verify token (403)", r.status === 403, r.status);
      const post = await fetch(`${B}/whatsapp/webhook`, {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=00" },
        body: "{}",
      });
      ok("wa webhook rejects bad signature (403)", post.status === 403, post.status);
    }
    r = await j("GET", "/whatsapp/status", null, at);
    ok("wa status (simulator mode for non-owner)", r.s === 200 && r.d.isOwner === false && r.d.contacts === 0, r);

    r = await j("GET", "/whatsapp/profile", null, at);
    ok("wa bot profile default", r.s === 200 && r.d.serviceName === "Layanan Informasi" && /BMN/.test(r.d.topic), r);
    r = await j("PUT", "/whatsapp/profile", { serviceName: "Layanan Smoke" }, at);
    ok(
      "wa bot profile update (topic kept)",
      r.s === 200 && r.d.serviceName === "Layanan Smoke" && /BMN/.test(r.d.topic),
      r,
    );
    r = await j(
      "POST",
      "/whatsapp/groups",
      { code: "SMK.01", name: "KSOP Smoke", kind: "satker", shareRequests: true },
      at,
    );
    const groupId = r.d?.id;
    ok(
      "wa group create (kind satker, share requests)",
      r.s === 201 && r.d.code === "SMK.01" && r.d.shareRequests === true && r.d.allowRequests === true,
      r,
    );
    r = await j("POST", "/whatsapp/groups", { code: "SMK.01", name: "Ganda" }, at);
    ok("wa group duplicate code 409", r.s === 409, r);
    r = await j("POST", "/whatsapp/groups", { code: "salah kode!", name: "x" }, at);
    ok("wa group invalid code 400", r.s === 400, r);
    r = await j("POST", "/whatsapp/groups", { code: "X1", name: "x", kind: "asing" }, at);
    ok("wa group invalid kind 400", r.s === 400, r);
    r = await j("POST", "/whatsapp/contacts", { phone: "abc", name: "x" }, at);
    ok("wa contact invalid phone 400", r.s === 400, r);
    r = await j(
      "POST",
      "/whatsapp/contacts",
      { phone: "0812-9000-0001", name: "Budi Smoke", position: "Operator BMN", groupId, verified: true },
      at,
    );
    const contactId = r.d?.id;
    ok(
      "wa contact create (phone normalized)",
      r.s === 201 && r.d.phone === "6281290000001" && r.d.group?.code === "SMK.01",
      r,
    );
    r = await j("GET", "/whatsapp/contacts", null, pt);
    ok("wa contacts isolated per user", r.s === 200 && r.d.length === 0, r);
    r = await j("PATCH", `/whatsapp/contacts/${contactId}`, { name: "x" }, pt);
    ok("wa contact of other user 404", r.s === 404, r);
    r = await j("POST", "/whatsapp/groups", { code: "SMK.02", name: "Satker Lain", kind: "satker" }, at);
    const otherGroup = r.d?.code;

    // Nomor tak terdaftar → balasan "belum terdaftar" (sekali per 24 jam)
    r = await j("POST", "/whatsapp/simulate", { phone: "081290000999", text: "Halo" }, at);
    ok("wa simulate accepted", r.s === 201 && r.d.simulated === true, r);
    let outs = await replyAfter("6281290000999", 1);
    ok(
      "wa unregistered number gets polite refusal",
      outs?.[0]?.intent === "unregistered" && outs[0].status === "simulated",
      outs,
    );
    await j("POST", "/whatsapp/simulate", { phone: "081290000999", text: "Halo lagi" }, at);
    await new Promise((res) => setTimeout(res, 2500));
    ok(
      "wa refusal not repeated within 24h",
      (await thread("6281290000999")).filter((m) => m.direction === "out").length === 1,
    );
    r = await j("POST", "/whatsapp/simulate", { phone: "081290000001" }, at);
    ok("wa simulate empty 400", r.s === 400, r);

    // Pengajuan berkas: grup diambil dari kontak; berkas susulan digabung
    const waFile = new FormData();
    waFile.append("file", new Blob(["Permohonan PSP 2 unit printer"], { type: "text/plain" }), "psp-printer.txt");
    waFile.append("context", "request");
    const waUpload = await j("POST", "/uploads", waFile, at);
    r = await j(
      "POST",
      "/whatsapp/simulate",
      { phone: "081290000001", text: "PSP printer", uploadIds: [waUpload.d.id] },
      at,
    );
    outs = await replyAfter("6281290000001", 1);
    const intakeMsg = (await thread("6281290000001")).find((m) => m.direction === "in" && m.requestId);
    ok(
      "wa file → request acknowledged",
      outs?.[0]?.intent === "request" && /terima dengan nomor/.test(outs[0].text),
      outs,
    );
    r = await j("GET", `/requests/${intakeMsg?.requestId}`, null, at);
    const waRequestId = r.d?.id;
    ok(
      "wa request from contact (source whatsapp, group from contact, kind guessed)",
      r.s === 200 &&
        r.d.source === "whatsapp" &&
        r.d.groupCode === "SMK.01" &&
        /KSOP Smoke — Budi Smoke/.test(r.d.applicant) &&
        r.d.kind === "psp" &&
        r.d.attachments.length === 1,
      r,
    );
    const waFile2 = new FormData();
    waFile2.append("file", new Blob(["KIB printer"], { type: "text/plain" }), "kib.txt");
    waFile2.append("context", "request");
    const waUpload2 = await j("POST", "/uploads", waFile2, at);
    await j("POST", "/whatsapp/simulate", { phone: "081290000001", uploadIds: [waUpload2.d.id] }, at);
    outs = await replyAfter("6281290000001", 2);
    r = await j("GET", `/requests/${waRequestId}`, null, at);
    ok(
      "wa follow-up file appended to same request",
      r.d?.attachments?.length === 2 && /ditambahkan/.test(outs?.[1]?.text ?? ""),
      [r.d?.attachments, outs],
    );

    // Pengajuan grup lain tidak terlihat lewat #status (AG-20); grup berbagi → semua pengajuan grup
    await j("POST", "/requests", { kind: "psp", title: "Milik satker lain", groupCode: otherGroup }, at);
    await j("POST", "/requests", { kind: "psp", title: "Rekan satu grup", groupCode: "SMK.01" }, at);
    await j("POST", "/whatsapp/simulate", { phone: "081290000001", text: "#status" }, at);
    outs = await replyAfter("6281290000001", 3);
    ok(
      "wa #status lists whole group (share) but never other groups",
      /KSOP Smoke/.test(outs?.[2]?.text ?? "") &&
        /PSP printer/.test(outs[2].text) &&
        /Rekan satu grup/.test(outs[2].text) &&
        !/satker lain/.test(outs[2].text),
      outs?.[2],
    );

    // Perubahan status oleh user → kabar ke pemohon
    await j("PATCH", `/requests/${waRequestId}`, { status: "ditolak", statusNote: "KIB belum ditandatangani" }, at);
    outs = await replyAfter("6281290000001", 4);
    ok(
      "wa status notice to requester",
      outs?.[3]?.intent === "notice" && /KIB belum ditandatangani/.test(outs[3].text),
      outs?.[3],
    );

    // Pertanyaan tanpa AI/basis pengetahuan → diteruskan ke petugas, dibalas manual
    await j("POST", "/whatsapp/simulate", { phone: "081290000001", text: "Berapa lama proses PSP?" }, at);
    outs = await replyAfter("6281290000001", 5);
    ok("wa question without knowledge → forwarded", /diteruskan ke petugas/.test(outs?.[4]?.text ?? ""), outs?.[4]);
    r = await j("GET", "/whatsapp/conversations", null, at);
    ok(
      "wa conversations list with needs-reply count",
      r.s === 200 &&
        r.d.find((c) => c.phone === "6281290000001")?.needsReply === 1 &&
        r.d.some((c) => c.contact === null),
      r,
    );
    r = await j("POST", "/whatsapp/conversations/6281290000001/reply", { text: "Proses PSP ± 14 hari kerja." }, at);
    ok("wa manual reply (simulated) resolves follow-up", r.s === 201 && r.d[0]?.status === "simulated", r);
    r = await j("GET", "/whatsapp/status", null, at);
    ok("wa status counts", r.d?.contacts === 1 && r.d.verified === 1 && r.d.needsReply === 0, r);
    r = await j("GET", "/whatsapp/conversations/6281290000001", null, pt);
    ok("wa conversation isolated per user", r.s === 200 && r.d.length === 0, r);

    // Grup masyarakat umum: tidak berbagi pengajuan & pengiriman berkas ditutup
    r = await j(
      "POST",
      "/whatsapp/groups",
      { code: "UMUM", name: "Masyarakat Umum", kind: "masyarakat", allowRequests: false },
      at,
    );
    const publicGroupId = r.d?.id;
    r = await j(
      "POST",
      "/whatsapp/contacts",
      { phone: "081290000002", name: "Warga Smoke", groupId: publicGroupId, verified: true },
      at,
    );
    const publicContactId = r.d?.id;
    await j("POST", "/requests", { kind: "surat", title: "Milik warga lain", groupCode: "UMUM" }, at);
    await j("POST", "/whatsapp/simulate", { phone: "081290000002", text: "#status" }, at);
    outs = await replyAfter("6281290000002", 1);
    ok(
      "wa #status in non-sharing group shows only own requests",
      /Belum ada pengajuan dari Anda/.test(outs?.[0]?.text ?? "") && !/warga lain/.test(outs?.[0]?.text ?? ""),
      outs?.[0],
    );
    const wargaFile = new FormData();
    wargaFile.append("file", new Blob(["izin"], { type: "text/plain" }), "izin.txt");
    wargaFile.append("context", "request");
    const wargaUpload = await j("POST", "/uploads", wargaFile, at);
    await j(
      "POST",
      "/whatsapp/simulate",
      { phone: "081290000002", text: "permohonan", uploadIds: [wargaUpload.d.id] },
      at,
    );
    outs = await replyAfter("6281290000002", 2);
    ok(
      "wa group without request permission refuses files (bot name from profile)",
      /Pengiriman berkas pengajuan belum dibuka/.test(outs?.[1]?.text ?? "") && /Layanan Smoke/.test(outs[1].text),
      outs?.[1],
    );
    await j("DELETE", `/uploads/${wargaUpload.d.id}`, null, at);
    await j("DELETE", `/whatsapp/contacts/${publicContactId}`, null, at);
    await j("DELETE", `/whatsapp/groups/${publicGroupId}`, null, at);

    await j("DELETE", `/requests/${waRequestId}`, null, at);
    r = await j("DELETE", `/whatsapp/groups/${groupId}`, null, at);
    ok("wa group delete (contact kept, group cleared)", r.s === 200, r);
    r = await j("GET", "/whatsapp/contacts", null, at);
    ok("wa contact group set null", r.d?.[0]?.group === null, r);
    await j("DELETE", `/whatsapp/contacts/${contactId}`, null, at);
  }

  // ---- Tautan publik berkas (link dokumen e-Kinerja) & konektor robot (tahap 6 docs/AI-AGENT.md)
  {
    const pubForm = new FormData();
    pubForm.append("file", new Blob(["Bukti kinerja Oktober"], { type: "text/plain" }), "bukti.txt");
    const pubFile = await j("POST", "/uploads", pubForm, at);
    r = await j("POST", `/uploads/${pubFile.d.id}/public-links`, { days: 30, label: "e-Kinerja Okt" }, at);
    const pubPath = r.d?.path;
    ok(
      "public link create (token shown once, expiry)",
      r.s === 201 && /^\/api\/v1\/public\/files\/lp_/.test(pubPath) && r.d.expiresAt && r.d.label === "e-Kinerja Okt",
      r,
    );
    const origin = B.replace(/\/api\/v1$/, "");
    let pub = await fetch(origin + pubPath);
    ok(
      "public link opens without login (safe headers)",
      pub.status === 200 &&
        (await pub.text()) === "Bukti kinerja Oktober" &&
        /sandbox/.test(pub.headers.get("content-security-policy") ?? "") &&
        pub.headers.get("x-robots-tag")?.includes("noindex"),
      pub.status,
    );
    r = await j("POST", `/uploads/${pubFile.d.id}/public-links`, {}, pt);
    ok("public link only by file owner (403)", r.s === 403, r);
    r = await j("GET", `/uploads/${pubFile.d.id}/public-links`, null, at);
    ok(
      "public link list (no token, access counted)",
      r.s === 200 && r.d[0]?.accessCount === 1 && !("path" in r.d[0]),
      r,
    );
    const linkId = r.d?.[0]?.id;
    pub = await fetch(`${origin}/api/v1/public/files/lp_${"x".repeat(43)}`);
    ok("public link unknown token 404", pub.status === 404, pub.status);
    r = await j("DELETE", `/public-links/${linkId}`, null, pt);
    ok("public link revoke by other user 404", r.s === 404, r);
    r = await j("DELETE", `/public-links/${linkId}`, null, at);
    pub = await fetch(origin + pubPath);
    ok("public link revoked → 404", r.s === 200 && pub.status === 404, pub.status);

    // Brankas digital: beberapa berkas di balik satu tautan, berkas di luar brankas tidak terjangkau, setiap akses dicatat
    const vForm = new FormData();
    vForm.append("file", new Blob(["Bukti kedua"], { type: "text/plain" }), "bukti-2.txt");
    const vFile2 = await j("POST", "/uploads", vForm, at);
    const oForm = new FormData();
    oForm.append("file", new Blob(["Rahasia"], { type: "text/plain" }), "lain.txt");
    const otherFile = await j("POST", "/uploads", oForm, at);
    r = await j(
      "POST",
      "/vaults",
      { title: "Renaksi Okt", assetIds: [pubFile.d.id, vFile2.d.id], entryId: "smoke-e" },
      at,
    );
    const vaultId = r.d?.id;
    const vaultToken = r.d?.path?.replace("/brankas/", "");
    ok(
      "vault create (2 files, path shown once)",
      r.s === 201 && /^bv_/.test(vaultToken ?? "") && r.d.files.length === 2,
      r,
    );
    r = await j("POST", "/vaults", { title: "x", assetIds: [otherFile.d.id] }, pt);
    ok("vault only with own files (403)", r.s === 403, r);
    let pv = await fetch(`${origin}/api/v1/public/vaults/${vaultToken}`);
    let pvBody = await pv.json();
    ok(
      "vault opens without login + visitor notice (ip, location)",
      pv.status === 200 &&
        pvBody.files.length === 2 &&
        pvBody.visitor.ip &&
        pvBody.visitor.location &&
        pv.headers.get("x-robots-tag")?.includes("noindex"),
      pvBody,
    );
    pv = await fetch(`${origin}/api/v1/public/vaults/${vaultToken}/files/${vFile2.d.id}?download=1`);
    ok(
      "vault file download (attachment, sandbox)",
      pv.status === 200 &&
        (await pv.text()) === "Bukti kedua" &&
        /attachment/.test(pv.headers.get("content-disposition") ?? "") &&
        /sandbox/.test(pv.headers.get("content-security-policy") ?? ""),
      pv.status,
    );
    pv = await fetch(`${origin}/api/v1/public/vaults/${vaultToken}/files/${otherFile.d.id}`);
    ok("vault isolates files (outside file 404)", pv.status === 404, pv.status);
    r = await j("GET", `/vaults/${vaultId}/accesses`, null, at);
    ok(
      "vault access log (open + download, ip, location)",
      r.s === 200 &&
        r.d.length === 2 &&
        r.d.some((a) => a.action === "download" && a.fileName === "bukti-2.txt") &&
        r.d.every((a) => a.ip && a.location),
      r,
    );
    r = await j("GET", `/vaults/${vaultId}/accesses`, null, pt);
    ok("vault log only for owner (404)", r.s === 404, r);
    r = await j("DELETE", `/uploads/${vFile2.d.id}`, null, at);
    ok("vault file protected from delete (409)", r.s === 409, r);
    r = await j("PATCH", `/vaults/${vaultId}`, { assetIds: [pubFile.d.id] }, at);
    ok("vault update files (link unchanged)", r.s === 200 && r.d.files.length === 1, r);
    r = await j("POST", `/vaults/${vaultId}/rotate`, null, at);
    const newToken = r.d?.path?.replace("/brankas/", "");
    pv = await fetch(`${origin}/api/v1/public/vaults/${vaultToken}`);
    const pvNew = await fetch(`${origin}/api/v1/public/vaults/${newToken}`);
    ok("vault rotate (old link 404, new works)", pv.status === 404 && pvNew.status === 200, [pv.status, pvNew.status]);
    r = await j("DELETE", `/vaults/${vaultId}`, null, at);
    pv = await fetch(`${origin}/api/v1/public/vaults/${newToken}`);
    ok("vault delete → 404", r.s === 200 && pv.status === 404, pv.status);
    await j("DELETE", `/uploads/${vFile2.d.id}`, null, at);
    await j("DELETE", `/uploads/${otherFile.d.id}`, null, at);
    await j("DELETE", `/uploads/${pubFile.d.id}`, null, at);

    r = await j("GET", "/robot/connectors", null, at);
    ok(
      "robot connectors (srikandi default url, no session)",
      r.s === 200 &&
        r.d.length === 2 &&
        r.d.find((c) => c.system === "srikandi")?.baseUrl === "https://srikandi.arsip.go.id" &&
        r.d.every((c) => c.status === "none" && c.hasSession === false && !("sessionEnc" in c)),
      r,
    );
    r = await j("PATCH", "/robot/connectors/ekinerja", { baseUrl: "http://ekin.contoh.go.id" }, at);
    ok("robot connector rejects non-https url", r.s === 400, r);
    r = await j("PATCH", "/robot/connectors/siman", { baseUrl: "https://x.go.id" }, at);
    ok("robot unknown system 404", r.s === 404, r);
    r = await j("POST", "/robot/connectors/srikandi/check", null, at);
    ok("robot check without session 400", r.s === 400, r);
    r = await j("GET", "/robot/status", null, at);
    if (!r.d?.reachable) {
      console.log("SKIP robot browser (service robot tidak aktif: docker compose --profile robot up -d robot)");
    } else {
      // Situs uji publik tanpa login: robot menilai "sudah login" → alur sesi lengkap tanpa menyentuh sistem pemerintah
      r = await j("PATCH", "/robot/connectors/ekinerja", { baseUrl: "https://example.com" }, at);
      ok("robot connector url set", r.s === 200 && r.d.baseUrl === "https://example.com", r);
      r = await j("POST", "/robot/connectors/ekinerja/login", null, at);
      const sessionId = r.d?.sessionId;
      ok("robot remote login session opened", r.s === 201 && sessionId && r.d.url.startsWith("https://example.com"), r);
      const frame = await fetch(`${B}/robot/sessions/${sessionId}/frame`, {
        headers: { Authorization: `Bearer ${at}` },
      });
      ok(
        "robot frame jpeg + page info",
        frame.status === 200 &&
          frame.headers.get("content-type") === "image/jpeg" &&
          (await frame.arrayBuffer()).byteLength > 1000 &&
          frame.headers.get("x-robot-logged-in") === "true",
        frame.status,
      );
      r = await j("GET", `/robot/sessions/${sessionId}/frame`, null, pt);
      ok("robot session of other user 403", r.s === 403, r);
      r = await j("POST", `/robot/sessions/${sessionId}/input`, { type: "goto", url: "https://google.com" }, at);
      ok("robot goto outside connector 400", r.s === 400, r);
      r = await j("POST", `/robot/sessions/${sessionId}/input`, { type: "key", key: "F12" }, at);
      ok("robot disallowed key rejected", r.s === 422 || r.s === 400, r);
      r = await j("POST", `/robot/sessions/${sessionId}/input`, { type: "click", x: 100, y: 100 }, at);
      ok("robot click input", r.s === 200 && typeof r.d.url === "string", r);
      r = await j("POST", `/robot/sessions/${sessionId}/capture`, null, pt);
      ok("robot capture live session of other user 403", r.s === 403, r);
      r = await j("POST", `/robot/sessions/${sessionId}/capture`, null, at);
      ok(
        "robot capture live session page",
        r.s === 200 &&
          r.d.kind === "capture" &&
          r.d.title === "Example Domain" &&
          /- (heading|paragraph)/.test(r.d.aria ?? ""),
        r,
      );
      r = await j("POST", `/robot/sessions/${sessionId}/finish`, null, at);
      ok("robot finish login → session saved (encrypted)", r.s === 200 && r.d.status === "active" && r.d.hasSession, r);
      r = await j("POST", "/robot/connectors/ekinerja/check", null, at);
      ok("robot check session active", r.s === 200 && r.d.status === "active" && r.d.lastCheckAt, r);
      r = await j("POST", "/robot/connectors/ekinerja/capture", { url: "https://google.com" }, at);
      ok("robot capture outside connector 400", r.s === 400, r);
      r = await j("POST", "/robot/connectors/ekinerja/capture", { url: "https://example.com/" }, at);
      const runId = r.d?.id;
      ok(
        "robot capture page (screenshot + aria snapshot)",
        r.s === 200 && r.d.kind === "capture" && r.d.hasScreenshot && /- (heading|paragraph)/.test(r.d.aria ?? ""),
        r.d?.aria?.slice?.(0, 200) ?? r,
      );
      const shot = await fetch(`${B}/robot/runs/${runId}/screenshot`, { headers: { Authorization: `Bearer ${at}` } });
      ok("robot run screenshot", shot.status === 200 && shot.headers.get("content-type") === "image/jpeg", shot.status);
      r = await j("GET", "/robot/runs?system=ekinerja", null, at);
      ok(
        "robot run log (login, check, capture)",
        r.s === 200 && ["login", "check", "capture"].every((k) => r.d.some((x) => x.kind === k)) && !("aria" in r.d[0]),
        r,
      );
      r = await j("GET", `/robot/runs/${runId}`, null, pt);
      ok("robot run isolated per user", r.s === 404, r);
      r = await j("DELETE", `/robot/runs/${runId}`, null, at);
      ok("robot run delete", r.s === 200, r);
      r = await j("DELETE", "/robot/connectors/ekinerja/session", null, at);
      ok("robot forget session", r.s === 200 && r.d.status === "none" && !r.d.hasSession, r);
      r = await j("POST", "/robot/connectors/ekinerja/login", null, at);
      if (r.d?.sessionId) {
        r = await j("DELETE", `/robot/sessions/${r.d.sessionId}`, null, at);
        ok("robot cancel login session", r.s === 200 && r.d.closed, r);
      }
    }
  }

  // ---- Brankas kredensial konektor robot (nilai uji palsu; tidak ada login ke sistem pemerintah)
  {
    r = await j("GET", "/robot/status", null, at);
    const vaultOn = r.d?.vault === true;
    if (!vaultOn) {
      console.log("SKIP robot vault (CREDENTIAL_ENCRYPTION_KEY kosong)");
    } else {
      r = await j(
        "POST",
        "/robot/connectors/ekinerja/credentials",
        { username: "nip-uji-001", password: "sandi-uji", accountPassword: "salah" },
        at,
      );
      ok("robot credentials need LifeOS password (403)", r.s === 403, r);
      r = await j(
        "POST",
        "/robot/connectors/ekinerja/credentials",
        { username: "nip-uji-001", password: "sandi-uji", accountPassword: "rahasia2" },
        at,
      );
      ok(
        "robot credentials stored (masked hint only)",
        r.s === 200 &&
          r.d.hasCredentials &&
          r.d.credentialHint === "ni•••01" &&
          !JSON.stringify(r.d).includes("sandi-uji"),
        r,
      );
      r = await j("GET", "/robot/connectors", null, at);
      ok(
        "robot connectors never return credentials",
        r.s === 200 && !JSON.stringify(r.d).includes("sandi-uji") && !JSON.stringify(r.d).includes("nip-uji-001"),
        r,
      );
      r = await j("GET", "/robot/connectors", null, pt);
      ok(
        "robot credentials isolated per user",
        r.d?.every?.((c) => !c.hasCredentials),
        r,
      );
      r = await j("POST", "/robot/sessions/tidak-ada/answer", { kind: "otp", value: "123456" }, at);
      ok("robot answer unknown session 404", r.s === 404, r);
      r = await j("POST", "/robot/sessions/x/answer", { kind: "otp", value: "12 34" }, at);
      ok("robot answer invalid value 400", r.s === 400, r);
      r = await j("GET", "/robot/status", null, at);
      if (r.d?.reachable) {
        // Situs uji tanpa formulir login → robot langsung "sudah masuk", sesi disimpan tanpa memakai kredensial
        await j("PATCH", "/robot/connectors/ekinerja", { baseUrl: "https://example.com" }, at);
        r = await j("POST", "/robot/connectors/ekinerja/auto-login", null, at);
        ok(
          "robot auto-login (done → session saved)",
          r.s === 201 && r.d.stage === "done" && r.d.connector?.status === "active",
          r,
        );
        await j("DELETE", "/robot/connectors/ekinerja/session", null, at);
      }
      r = await j("DELETE", "/robot/connectors/ekinerja/credentials", null, at);
      ok("robot credentials deleted", r.s === 200 && !r.d.hasCredentials && r.d.credentialHint === null, r);
      r = await j("POST", "/robot/connectors/ekinerja/auto-login", null, at);
      ok("robot auto-login without credentials 400", r.s === 400, r);
    }
  }

  // ---- Otomasi terjadwal (tab Connector). User sementara tanpa sesi robot → tugas gagal sebelum sampai ke robot.
  r = await j("GET", "/automation/jobs", null, at);
  ok(
    "automation jobs default (7, nonaktif, jadwal bawaan)",
    r.s === 200 &&
      r.d.length === 7 &&
      r.d.find((x) => x.kind === "srikandi_session")?.cron === "30 7-17 * * 1,2,3,4,5" &&
      r.d.every((x) => !x.enabled) &&
      r.d.find((x) => x.kind === "srikandi_letters")?.cron === "0 7-17 * * 1,2,3,4,5" &&
      r.d.find((x) => x.kind === "srikandi_classifications")?.cron === "0 7 * * 1",
    r,
  );
  r = await j("PATCH", "/automation/jobs/srikandi_letters", { enabled: true }, at);
  ok("automation enable → next run", r.s === 200 && r.d.enabled && !!r.d.nextRunAt, r);
  r = await j("GET", "/automation/alerts", null, at);
  ok(
    "automation alert: jadwal aktif tanpa sesi",
    r.s === 200 &&
      r.d.some((a) => a.kind === "session_missing" && a.system === "srikandi" && a.path === "/srikandi/connector"),
    r,
  );
  r = await j(
    "PATCH",
    "/automation/jobs/ekinerja_skp",
    { schedule: { mode: "daily", time: "06:30", days: [1, 2, 3, 4, 5] } },
    at,
  );
  ok("automation schedule updated", r.s === 200 && r.d.cron === "30 6 * * 1,2,3,4,5", r);
  r = await j("PATCH", "/automation/jobs/ekinerja_skp", { schedule: { mode: "cron", pattern: "*/5 * * * *" } }, at);
  ok("automation too frequent cron 400", r.s === 400, r);
  r = await j("PATCH", "/automation/jobs/siman_aset", { enabled: true }, at);
  ok("automation unknown kind 404", r.s === 404, r);
  r = await j("POST", "/automation/jobs/srikandi_letters/run", null, at);
  const autoRunId = r.d?.id;
  ok("automation run now queued", r.s === 202 && r.d.status === "queued" && r.d.trigger === "manual", r);
  let autoRun;
  for (let i = 0; i < 40; i++) {
    r = await j("GET", "/automation/runs?kind=srikandi_letters", null, at);
    autoRun = r.d?.find?.((x) => x.id === autoRunId);
    if (autoRun && !["queued", "running"].includes(autoRun.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  ok(
    "automation run without session → dilewati (robot tidak dipanggil)",
    autoRun?.status === "skipped" && /sesi/i.test(autoRun.message ?? ""),
    autoRun,
  );
  r = await j("GET", "/automation/jobs", null, at);
  ok("automation last status recorded", r.d?.find((x) => x.kind === "srikandi_letters")?.lastStatus === "skipped", r);
  r = await j("POST", "/robot/srikandi/classifications/sync", null, at);
  r = await j("GET", "/automation/runs?kind=srikandi_classifications", null, at);
  ok("automation records button sync", r.s === 200 && r.d[0]?.trigger === "button", r);
  r = await j("GET", "/automation/runs?kind=srikandi_letters", null, pt);
  ok("automation runs isolated per user", r.s === 200 && !r.d.some((x) => x.id === autoRunId), r);
  r = await j("PATCH", "/automation/jobs/srikandi_letters", { enabled: false }, at);
  ok("automation disable → no next run", r.s === 200 && !r.d.enabled && r.d.nextRunAt === null, r);
  r = await j("GET", "/automation/alerts", null, at);
  ok("automation alerts cleared when no job active", r.s === 200 && !r.d.some((a) => a.system === "srikandi"), r);
  r = await j("GET", "/automation/alerts", null, pt);
  ok("automation alerts per user", r.s === 200 && Array.isArray(r.d) && r.d.length === 0, r);

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
