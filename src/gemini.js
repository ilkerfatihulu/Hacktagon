import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

export async function generateWeeklyTip({ last7Avg, trend }) {
  const prompt = `
You are a hydration coach.

Generate ONE short weekly hydration tip (max 18 words).
Non-medical, friendly, practical.
Avoid fear. Avoid diagnosing. No disease talk.
No numbers unless very simple.

Context:
- Urine color scale 1 (very pale) to 8 (very dark).
- Last 7 days average: ${last7Avg ?? "unknown"}
- Trend: ${trend ?? "unknown"} (improving / getting darker / stable)

Return only the tip sentence.
`;

  // gemini.js içinde değiştir
const res = await ai.models.generateContent({
  model: "gemini-1.0-flash", // Daha stabil olan bu modeli deneyin
  contents: [{ role: "user", parts: [{ text: prompt }] }], // Yapıyı bu şekilde güncelleyin
});

  return (res.text || "").trim();
}
export async function runChat(message) {
  const prompt = `
    You are 'Peki', a friendly hydration and kidney health assistant. 
    Keep your answers short, helpful, and focused on hydration.
    If the user asks about medical diagnosis, remind them you are an AI and not a doctor.
    User says: ${message}
  `;

  const res = await ai.models.generateContent({
    model: "gemini-3-flash-preview", // Mevcut modelini kullandım
    contents: prompt,
  });

  return (res.text || "").trim();
}