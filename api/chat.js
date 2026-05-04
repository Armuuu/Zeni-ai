export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model, systemPrompt } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Both agents use gemini-2.5-flash (free tier, works reliably)
  // Agent 2 uses thinking mode for deeper reasoning
  const AGENT1_MODEL = 'gemini-2.5-flash';
  const AGENT2_MODEL = 'gemini-2.5-pro';
  const isAgent2 = model === 'gemini-2.5-pro';
  const selectedModel = isAgent2 ? AGENT2_MODEL : AGENT1_MODEL;

  const currentDate = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Delhi',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  const systemContent = systemPrompt ||
    `You are Zeni, a highly capable AI assistant. Be helpful, clear, and concise. Today's date and time is ${currentDate}. Always answer based on the current year. When writing code, always wrap it in proper markdown code blocks with the language specified. If given a file or image, analyze it thoroughly. If a user asks you to generate, create, or make an image or picture, reply that you are a text-based assistant and cannot generate images at this time.`;

  // Map frontend messages → Gemini format
  const geminiContents = messages.map(m => {
    const role = (m.role === 'ai' || m.role === 'assistant') ? 'model' : 'user';
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

  // Agent 2 — thinking mode for deeper responses
  if (isAgent2) {
    requestBody.generationConfig = {
      thinkingConfig: { thinkingBudget: 8192 },
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
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: data.error?.message || 'Error from Gemini API',
      });
    }

    // Extract reply — filter out thought parts, keep only final answer
    const parts = data.candidates?.[0]?.content?.parts || [];
    const reply = parts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('')
      .trim() || '';

    if (!reply) {
      return res.status(500).json({ error: 'Empty response from model' });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
