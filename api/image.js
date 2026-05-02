export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, refImage } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt string required" });
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");

    // v1alpha required for image generation
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_AI_API_KEY,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const parts = [];

    if (refImage && typeof refImage === "string" && refImage.includes(",")) {
      const base64Data = refImage.split(",")[1];
      const mimeType = refImage.split(";")[0].split(":")[1];
      parts.push({ inlineData: { mimeType, data: base64Data } });
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    let imageBase64 = null;
    let imageMime = "image/png";

    const resParts = response?.candidates?.[0]?.content?.parts || [];
    for (const part of resParts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        imageMime = part.inlineData.mimeType || "image/png";
        break;
      }
    }

    if (!imageBase64) {
      console.error("No image in response:", JSON.stringify(response));
      return res.status(500).json({ error: "Model returned no image" });
    }

    return res.status(200).json({
      imageUrl: `data:${imageMime};base64,${imageBase64}`,
    });

  } catch (err) {
    console.error("Image API Error:", JSON.stringify(err?.message || err));
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
