export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const AGENT1_MODEL = 'gemini-2.0-flash';
  const AGENT2_MODEL = 'gemini-2.5-flash';

  const allowedModels = [AGENT1_MODEL, AGENT2_MODEL];
  const selectedModel = allowedModels.includes(model) ? model : AGENT1_MODEL;

  const currentDate = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'long'
  });

  const systemContent = systemPrompt ||
    `You are Zeni, a highly capable AI assistant. Be helpful, clear, and concise. Today's date and time is ${currentDate}. Always answer based on the current year. When writing code, always wrap it in proper markdown code blocks with the language specified. If given a file or image, analyze it thoroughly and answer the user's question about it. If a user asks you to generate or create an image, politely tell them you are a text-based assistant and cannot generate images.`;

  const geminiContents = messages.map(m => {
    const role = (m.role === 'ai' || m.role === 'assistant') ? 'model' : 'user';
    const parts = [];

    if (Array.isArray(m.content)) {
      m.content.forEach(c => {
        if (c.type === 'text') parts.push({ text: c.text });
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

  const body = {
    systemInstruction: { parts: [{ text: systemContent }] },
    contents: geminiContents,
  };

  try {
    const API_KEY = process.env.GEMINI_API_KEY;
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
    return res.status(200).json({ reply });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
