/**
 * Jembatan LifeOS untuk plugin AI resmi ONLYOFFICE (dipasang saat build image, infra/onlyoffice/Dockerfile).
 *
 * Plugin AI punya mode "pengaturan dari server" (`Asc.plugin.info.aiPluginSettings` → `AI.serverSettings`): provider,
 * model, dan aksi ditetapkan dari luar, tombol Settings disembunyikan, dan semua permintaan dikirim ke satu alamat proxy.
 * Server ONLYOFFICE hanya bisa mengisi mode ini untuk seluruh server, jadi jembatan ini mengisinya per user dari opsi
 * plugin di config editor bertanda tangan LifeOS (`editorConfig.plugins.options[GUID].lifeos`): provider "AI LifeOS"
 * dengan key = token sesi AI pendek, proxy = backend LifeOS (`/api/v1/office/ai/proxy`). Backend memakai provider & API
 * key user di Pengaturan → AI — tidak ada key yang diisi di editor. Tanpa opsi LifeOS, plugin berjalan seperti aslinya.
 */
(function () {
  "use strict";

  var PROVIDER = "AI LifeOS";

  window.lifeosApplyAiSettings = function () {
    var plugin = window.Asc && window.Asc.plugin;
    var info = plugin && plugin.info;
    var lifeos = info && info.options && info.options.lifeos;
    var AI = window.AI;
    if (!lifeos || !lifeos.token || !lifeos.proxy || !lifeos.url || !AI) return;

    var model = {
      id: lifeos.modelId,
      object: "model",
      created: 0,
      owned_by: "lifeos",
      name: lifeos.modelName,
      endpoints: [AI.Endpoints.Types.v1.Chat_Completions],
      options: { max_input_tokens: AI.InputMaxTokens["128k"] },
    };
    var providers = {};
    providers[PROVIDER] = { name: PROVIDER, url: lifeos.url, key: lifeos.token, models: [model] };

    // Semua aksi teks & gambar-masukan memakai AI LifeOS; pembuatan gambar belum didukung backend
    var actions = {};
    var keys = AI.ActionsGetKeys ? AI.ActionsGetKeys() : ["Chat", "Summarization", "Translation", "TextAnalyze", "OCR", "Vision"];
    for (var i = 0; i < keys.length; i++) {
      actions[keys[i]] = { model: keys[i] === "ImageGeneration" ? "" : lifeos.modelId };
    }

    info.aiPluginSettings = JSON.stringify({
      version: AI.Storage.Version,
      proxy: lifeos.proxy,
      providers: providers,
      models: [
        {
          id: lifeos.modelId,
          name: lifeos.modelName,
          provider: PROVIDER,
          capabilities: AI.CapabilitiesUI.Chat | AI.CapabilitiesUI.Vision,
        },
      ],
      actions: actions,
      customProviders: {},
    });
  };
})();
