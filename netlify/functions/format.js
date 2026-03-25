export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: "Convert the following website scan findings into a JSON array. Return ONLY the JSON array, starting with [ and ending with ]. Each object must have: id, category, name, severity (critical/warning/info/passed), description, suggestion, page.",
        messages: [{ role: "user", content: `Convert these findings to JSON:\n\n${text}` }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Anthropic API error: ${response.status}` }), { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = {
  path: "/api/format",
};
