export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model, systemPrompt, imageMode, prompt } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  // ── IMAGE GENERATION MODE ──────────────────────────────────
  if (imageMode) {
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt required for image mode' });
    }

    // Both agents use gemini-2.0-flash-exp for image generation (free tier)
    const imgModel = 'gemini-1.5-flash-image';
    const imgUrl = `https://generativelanguage.googleapis.com/v1beta/models/${imgModel}:generateContent?key=${API_KEY}`;

    const parts = [];

    // Reference image if provided
    if (req.body.refImage && typeof req.body.refImage === 'string' && req.body.refImage.includes(',')) {
      const b64 = req.body.refImage.split(',')[1];
      const mime = req.body.refImage.split(';')[0].split(':')[1];
      parts.push({ inline_data: { mime_type: mime, data: b64 } });
    }

    parts.push({ text: prompt });

    try {
      const imgRes = await fetch(imgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      });

      const imgData = await imgRes.json();

      if (!imgRes.ok) {
        console.error('Gemini image error:', JSON.stringify(imgData));
        return res.status(imgRes.status).json({ error: imgData.error?.message || 'Image generation failed' });
      }

      const resParts = imgData?.candidates?.[0]?.content?.parts || [];
      let imageBase64 = null, imageMime = 'image/png';

      for (const part of resParts) {
        if (part.inline_data) {
          imageBase64 = part.inline_data.data;
          imageMime = part.inline_data.mime_type || 'image/png';
          break;
        }
      }

      if (!imageBase64) {
        return res.status(500).json({ error: 'Model returned no image' });
      }

      return res.status(200).json({ imageUrl: `data:${imageMime};base64,${imageBase64}` });

    } catch (err) {
      console.error('Image API Error:', err?.message);
      return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  }

  // ── TEXT / CHAT MODE ───────────────────────────────────────
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const AGENT1_MODEL = 'gemini-2.5-flash';
  const AGENT2_MODEL = 'gemini-2.5-pro';
  const allowedModels = [AGENT1_MODEL, AGENT2_MODEL];
  const selectedModel = allowedModels.includes(model) ? model : AGENT1_MODEL;

  const currentDate = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'long'
  });
  const systemContent = systemPrompt ||
    `You are Zeni, a highly capable AI assistant. Be helpful, clear, and concise. Today's date and time is ${currentDate}. Always answer based on the current year. When writing code, always wrap it in proper markdown code blocks with the language specified. If given a file or image, analyze it thoroughly and answer the user's question about it.`;

  // Map frontend format → Gemini format
  const geminiContents = messages.map(m => {
    const role = (m.role === 'ai' || m.role === 'assistant') ? 'model' : 'user';
    const parts = [];

    if (Array.isArray(m.content)) {
      m.content.forEach(c => {
        if (c.type === 'text') parts.push({ text: c.text });
        if (c.type === 'image_url') {
          const b64 = c.image_url.url.split(',')[1];
          const mime = c.image_url.url.split(';')[0].split(':')[1];
          parts.push({ inlineData: { data: b64, mimeType: mime } });
        }
      });
    } else {
      parts.push({ text: m.content || '' });
    }
    return { role, parts };
  });

  const body = {
    systemInstruction: { parts: [{ text: systemContent }] },
    contents: geminiContents,
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini text error:', JSON.stringify(data));
      return res.status(response.status).json({ error: data.error?.message || 'Error from Gemini API' });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ reply });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
    }
            
