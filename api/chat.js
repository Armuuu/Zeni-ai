export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // ── Agent models ──────────────────────────────────────────
  const AGENT1_MODEL = 'qwen/qwen3-next-80b-a3b-instruct';
  const AGENT2_MODEL = 'qwen/qwen3-coder';

  // Frontend bhejta hai model string — validate karke use karo
  const allowedModels = [AGENT1_MODEL, AGENT2_MODEL];
  const selectedModel = allowedModels.includes(model) ? model : AGENT1_MODEL;

  const systemContent = systemPrompt ||
    'You are Zeni, a highly capable AI assistant. Be helpful, clear, and concise. When writing code, always wrap it in proper markdown code blocks with the language specified. Format responses cleanly. If given a file or image, analyze it thoroughly and answer the user\'s question about it.';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.referer || 'https://your-vercel-app.vercel.app',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemContent },
          ...messages
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    return res.status(200).json({ reply: data.choices[0].message.content });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
