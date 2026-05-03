export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  const { messages, model, systemPrompt, imageMode, prompt } = req.body;

  // ── IMAGE GENERATION MODE ──────────────────────────────────
  if (imageMode) {
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt required for image mode' });
    }

    // Use gemini-2.5-flash for image generation (same model that works for text)
    const imgModel = 'gemini-2.5-flash-preview-05-20';
    const imgUrl = `https://generativelanguage.googleapis.com/v1beta/models/${imgModel}:generateContent?key=${API_KEY}`;

    const parts = [];

    if (req.body.refImage && typeof req.body.refImage === 'string' && req.body.refImage.includes(',')) {
      const b64  = req.body.refImage.split(',')[1];
      const mime = req.body.refImage.split(';')[0].split(':')[1];
      parts.push({ inlineData: { mimeType: mime, data: b64 } });
    }

    parts.push({ text: prompt });

    try {
      const imgRes = await fetch(imgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        }),
      });

      const imgData = await imgRes.json();

      if (!imgRes.ok) {
        console.error('Gemini image error:', JSON.stringify(imgData));
        return res.status(imgRes.status).json({
          error: imgData.error?.message || 'Image generation failed',
        });
      }

      const resParts = imgData?.candidates?.[0]?.content?.parts || [];
      let imageBase64 = null;
      let imageMime   = 'image/png';

      for (const part of resParts) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data;
          imageMime   = part.inlineData.mimeType || 'image/png';
          break;
        }
      }

      if (!imageBase64) {
        console.error('No image in response:', JSON.stringify(imgData));
        return res.status(500).json({ error: 'Model returned no image' });
      }

      return res.status(200).json({
        imageUrl: `data:${imageMime};base64,${imageBase64}`,
      });

    } catch (err) {
      console.error('Image API Error:', err?.message);
      return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  }

  // ── TEXT / CHAT MODE ───────────────────────────────────────
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Both agents use gemini-2.5-flash — Agent 2 uses thinking mode for deeper reasoning
  const AGENT1_MODEL = 'gemini-2.5-flash-preview-05-20';
  const AGENT2_MODEL = 'gemini-2.5-flash-preview-05-20';
  const isAgent2     = model === 'gemini-2.5-pro'; // frontend sends pro for agent2
  const selectedModel = AGENT1_MODEL; // always flash, thinking config controls depth

  const currentDate = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'long',
  });

  const systemContent = systemPrompt ||
    `You are Zeni, a highly capable AI assistant. Be helpful, clear, and concise. Today's date and time is ${currentDate}. Always answer based on the current year. When writing code, always wrap it in proper markdown code blocks with the language specified. If given a file or image, analyze it thoroughly and answer the user's question about it.`;

  // Map frontend format → Gemini format
  const geminiContents = messages.map(m => {
    const role  = (m.role === 'ai' || m.role === 'assistant') ? 'model' : 'user';
    const parts = [];

    if (Array.isArray(m.content)) {
      m.content.forEach(c => {
        if (c.type === 'text') {
          parts.push({ text: c.text });
        }
        if (c.type === 'image_url') {
          const b64  = c.image_url.url.split(',')[1];
          const mime = c.image_url.url.split(';')[0].split(':')[1];
          parts.push({ inlineData: { data: b64, mimeType: mime } });
        }
      });
    } else {
      parts.push({ text: m.content || '' });
    }

    return { role, parts };
  });

  const requestBody = {
    systemInstruction: { parts: [{ text: systemContent }] },
    contents: geminiContents,
  };

  // Agent 2 — enable thinking for deeper, more thorough responses
  if (isAgent2) {
    requestBody.generationConfig = {
      thinkingConfig: {
        thinkingBudget: 8192,
      },
    };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini text error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: data.error?.message || 'Error from Gemini API',
      });
    }

    // Extract text — skip thought parts, get final answer
    const parts = data.candidates?.[0]?.content?.parts || [];
    const reply = parts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('') || '';

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
