import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

export async function generateDailyTip({ weeklyAvg, lastColor }) {
  const prompt = `
You are a hydration coach.
Generate ONE short daily hydration tip (max 16 words).
Non-medical, friendly, practical.
Avoid fear. Avoid diagnosing. No disease talk.

Context:
- Urine color scale 1 (very pale) to 8 (very dark).
- Weekly average: ${weeklyAvg ?? "unknown"}
- Last logged color: ${lastColor ?? "unknown"}

Return only the tip sentence.
`;

  const res = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return (res.text || "").trim();
}
