export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model, systemPrompt, isImageGen } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // ── Image Generation Flow ──────────────────────────────────
  if (isImageGen) {
    const lastMsg = messages[messages.length - 1];
    let promptText = "A beautiful landscape";
    
    if (Array.isArray(lastMsg.content)) {
      const textPart = lastMsg.content.find(c => c.type === 'text');
      if (textPart) promptText = textPart.text;
    } else {
      promptText = lastMsg.content || promptText;
    }

    const body = {
      instances: [{ prompt: promptText }],
      parameters: { sampleCount: 1 }
    };

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || 'Error generating image' });
      }

      const b64 = data.predictions[0].bytesBase64Encoded;
      const mime = data.predictions[0].mimeType || 'image/jpeg';
      const imgSrc = `data:${mime};base64,${b64}`;

      return res.status(200).json({ reply: imgSrc, isGeneratedImage: true });

    } catch (err) {
      console.error('Image API Error:', err);
      return res.status(500).json({ error: 'Internal server error during image generation' });
    }
  }

  // ── Gemini Text Models (Fix for Agent 2) ───────────────────
  const AGENT1_MODEL = 'gemini-1.5-flash';
  const AGENT2_MODEL = 'gemini-1.5-pro';

  // Fallback compatibility with frontend variables
  const allowedModels = [AGENT1_MODEL, AGENT2_MODEL, 'gemini-2.5-flash', 'gemini-2.5-pro'];
  let selectedModel = allowedModels.includes(model) ? model : AGENT1_MODEL;
  
  // Reroute old faulty names to working ones
  if (selectedModel === 'gemini-2.5-flash') selectedModel = AGENT1_MODEL;
  if (selectedModel === 'gemini-2.5-pro') selectedModel = AGENT2_MODEL;

  const currentDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'long' });
  const systemContent = systemPrompt || 
    `You are Zeni, a highly capable AI assistant. Be helpful, clear, and concise. Today's date and time is ${currentDate}. Always answer based on the current year. When writing code, always wrap it in proper markdown code blocks with the language specified. If given a file or image, analyze it thoroughly and answer the user's question about it.`;

  const geminiContents = messages.map(m => {
    let role = (m.role === 'ai' || m.role === 'assistant') ? 'model' : 'user';
    let parts = [];
    
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
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Error from Gemini API' });
    }

    const reply = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ reply, isGeneratedImage: false });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
