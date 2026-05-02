export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, refImage } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt string required" });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  const model  = "gemini-2.5-flash-image";
  const url    = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build parts array
  const parts = [];

  if (refImage && typeof refImage === "string" && refImage.includes(",")) {
    const base64Data = refImage.split(",")[1];
    const mimeType   = refImage.split(";")[0].split(":")[1];
    parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
  }

  parts.push({ text: prompt });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", JSON.stringify(data));
      return res.status(response.status).json({ error: JSON.stringify(data.error || data) });
    }

    // Extract image from response
    let imageBase64 = null;
    let imageMime   = "image/png";

    const resParts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of resParts) {
      if (part.inline_data) {
        imageBase64 = part.inline_data.data;
        imageMime   = part.inline_data.mime_type || "image/png";
        break;
      }
    }

    if (!imageBase64) {
      console.error("No image in response:", JSON.stringify(data));
      return res.status(500).json({ error: "Model returned no image" });
    }

    return res.status(200).json({
      imageUrl: `data:${imageMime};base64,${imageBase64}`,
    });

  } catch (err) {
    console.error("Image API Error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
