export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, refImage } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt string required" });
  }

  try {
    // Dynamic import — works reliably on Vercel with ESM packages
    const { GoogleGenAI } = await import("@google/genai");

    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

    // Build parts array
    const parts = [];

    // Add reference image if provided
    if (refImage && typeof refImage === "string" && refImage.includes(",")) {
      const base64Data = refImage.split(",")[1];
      const mimeType = refImage.split(";")[0].split(":")[1];
      parts.push({
        inlineData: { mimeType, data: base64Data },
      });
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "imagen-3.0-generate-002",
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    // Extract image from response
    let imageBase64 = null;
    let imageMime = "image/png";

    const parts2 = response?.candidates?.[0]?.content?.parts || [];
    for (const part of parts2) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        imageMime = part.inlineData.mimeType || "image/png";
        break;
      }
    }

    if (!imageBase64) {
      console.error("No image in response:", JSON.stringify(response));
      return res.status(500).json({ error: "Model returned no image. Check your API key permissions." });
    }

    return res.status(200).json({
      imageUrl: `data:${imageMime};base64,${imageBase64}`,
    });

  } catch (err) {
    console.error("Image API Error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
