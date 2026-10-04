// RareAtlas AI proxy (Cloudflare Worker).
// The OpenRouter API key is stored as an encrypted Worker secret named OPENROUTER_API_KEY.
// It is never in the frontend or in this repo.

const MODEL = "openai/gpt-6-luna";

const SYSTEM_PROMPT = `You are the assistant inside RareAtlas, a discovery and community platform for rare and poorly understood conditions.
Rules:
- You are NOT a doctor. Never diagnose, never say a person "has" a condition, never recommend treatments or doses.
- Explain things in plain language. Clearly separate: (1) general information, (2) possibly related terminology, (3) community/discovery suggestions.
- If you are unsure or have no evidence about a condition, say so honestly. Never invent facts, studies, or statistics.
- If a condition is not documented, encourage the user to start a new Atlas entry so others with the same experience can find it.
- When relevant, suggest speaking with a qualified healthcare professional. For urgent or severe symptoms, tell them to seek urgent medical care.
- Keep answers concise and well organized.`;

const DRAFT_PROMPT = `You help a person start a new Atlas entry in RareAtlas for a condition that has no existing entry. Use ONLY what the user wrote. Return a single JSON object and nothing else, with exactly these keys:
"possibleTerminology": array of up to 5 short strings (related medical terms or search phrases, only if genuinely relevant, otherwise an empty array),
"suggestedTitle": string,
"summary": string (2-3 neutral sentences restating what the user described),
"questionsToDescribe": array of up to 5 short questions that would help others recognise the same condition (onset, symptoms, duration, triggers, what helped),
"safetyNote": string (one sentence encouraging professional medical evaluation).
Never diagnose. Never claim this is a specific disease. Never invent facts. Output raw JSON only, no markdown, no code fences.`;

// Only accept requests from Lovable-hosted apps (and localhost for development).
function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return (
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") ||
      host === "localhost"
    );
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (!isAllowedOrigin(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST" }, 405, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, origin);
    }

    const mode = body.mode === "draft" ? "draft" : "answer";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const context = typeof body.context === "string" ? body.context.trim() : "";

    if (!query) return json({ error: "Missing 'query'" }, 400, origin);
    if (query.length > 1000 || context.length > 4000) {
      return json({ error: "Input too long" }, 400, origin);
    }

    if (!env.OPENROUTER_API_KEY) {
      return json({ error: "Server is not configured" }, 500, origin);
    }

    let userContent;
    if (mode === "draft") {
      userContent = `Condition name entered by the user: ${query}\n\nUser's description:\n${context || "(none yet)"}`;
    } else {
      userContent = context
        ? `User search: ${query}\n\nExisting Atlas data (may be empty):\n${context}`
        : `User search: ${query}`;
    }

    let upstream;
    try {
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "RareAtlas",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: mode === "draft" ? DRAFT_PROMPT : SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          max_tokens: 1500,
          reasoning: { effort: "low" },
        }),
      });
    } catch {
      return json({ error: "Could not reach AI service" }, 502, origin);
    }

    if (upstream.status === 402) {
      return json({ error: "AI credits ran out. Please add credit on OpenRouter." }, 402, origin);
    }
    if (upstream.status === 429) {
      return json({ error: "AI is busy. Please try again in a moment." }, 429, origin);
    }
    if (!upstream.ok) {
      return json({ error: "AI service error", status: upstream.status }, 502, origin);
    }

    const data = await upstream.json();
    const answer = data?.choices?.[0]?.message?.content;

    if (!answer) {
      return json({ error: "Empty response from AI. Please try again." }, 502, origin);
    }

    if (mode === "draft") {
      try {
        const cleaned = answer.replace(/```json|```/g, "").trim();
        return json({ draft: JSON.parse(cleaned) }, 200, origin);
      } catch {
        return json({ answer }, 200, origin);
      }
    }

    return json({ answer }, 200, origin);
  },
};
