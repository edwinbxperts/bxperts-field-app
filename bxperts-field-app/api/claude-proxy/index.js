const { app } = require('@azure/functions');

app.http('claude-proxy', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {

    // ── CORS headers ──────────────────────────────────────────────────────────
    const corsHeaders = {
      'Access-Control-Allow-Origin':  process.env.ALLOWED_ORIGIN || 'https://bxperts.app',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders };
    }

    try {
      const body = await request.json();

      // ── Forward to Anthropic API ───────────────────────────────────────────
      // ANTHROPIC_API_KEY is stored securely in Azure Function App Settings
      // — never in code or GitHub
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':         'application/json',
          'x-api-key':            process.env.ANTHROPIC_API_KEY,
          'anthropic-version':    '2023-06-01',
          'anthropic-beta':       'mcp-client-2025-04-04',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      return {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify(data),
      };

    } catch (err) {
      context.error('Claude proxy error:', err);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ error: 'Proxy error', message: err.message }),
      };
    }
  },
});
