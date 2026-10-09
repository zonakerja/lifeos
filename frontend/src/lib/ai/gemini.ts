/**
 * Klien Gemini langsung dari browser memakai API key user.
 * Sementara: akan dipindah ke backend (multi-provider Gemini/Claude/OpenAI) di thread fitur AI.
 */
const GEMINI_MODEL = "gemini-2.5-flash";

interface InlinePart {
  inlineData: { data: string; mimeType: string };
}

export const fileToGenerativePart = (file: Blob): Promise<InlinePart> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve({ inlineData: { data: String(reader.result).split(",")[1] ?? "", mimeType: file.type } });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export async function callGemini(apiKey: string, prompt: string, parts: InlinePart[] = []) {
  if (!apiKey) throw new Error("API Key Gemini belum disetting di menu Pengaturan → API Key AI.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }] }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message || "Gagal menghubungi Gemini AI.");
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, AI tidak memberikan respons.";
}
