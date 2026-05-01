import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, refImage } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt string required" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

    // Build contents array
    const parts = [];

    // If user sent a reference image, include it
    if (refImage && typeof refImage === "string" && refImage.includes(",")) {
      const base64Data = refImage.split(",")[1];
      const mimeType = refImage.split(";")[0].split(":")[1];
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    // Extract image from response
    let imageBase64 = null;
    let imageMime = "image/png";

    const candidates = response.candidates || [];
    if (candidates.length > 0) {
      const contentParts = candidates[0].content?.parts || [];
      for (const part of contentParts) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data;
          imageMime = part.inlineData.mimeType || "image/png";
          break;
        }
      }
    }

    if (!imageBase64) {
      console.error("Full response:", JSON.stringify(response, null, 2));
      return res.status(500).json({ error: "No image returned from model" });
    }

    const imageUrl = `data:${imageMime};base64,${imageBase64}`;
    return res.status(200).json({ imageUrl });

  } catch (err) {
    console.error("Image API Error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
