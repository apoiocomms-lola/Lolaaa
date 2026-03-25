export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  try {
    const { url, authInfo } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const systemPrompt = `You are Lola's AI-QA, an expert AI QA analyst that tests websites. You will be given a URL to analyze.

STEP 1: Use web_search to search for the exact URL provided. Then search for the site name/domain to find any publicly available information about it.

STEP 2: Based on what you find, perform a thorough quality analysis covering ALL of these categories:

1. **Functionality**: Do pages load? Does navigation work? Are there broken links? Do forms function? Are CTAs clickable? Do buttons/links go to the right destinations?
2. **Performance**: Are there indicators of slow loading? Large unoptimized images? Render-blocking resources? Too many HTTP requests?
3. **Accessibility**: Missing alt text on images? Poor color contrast? Missing ARIA labels? Bad heading hierarchy (h1 > h2 > h3)? Small touch targets?
4. **Security**: Is HTTPS configured? Mixed content warnings? Missing security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)?
5. **Responsive Design**: Is there a viewport meta tag? Does the layout appear mobile-friendly? Are there potential overflow issues?
6. **SEO**: Are there meta titles and descriptions? Open Graph tags? Proper heading hierarchy? Structured data? Canonical URLs?
7. **Content & Typos**: Check ALL visible text content for spelling mistakes, grammatical errors, typos, inconsistent capitalization, broken sentences, placeholder text (like "Lorem ipsum"), and any text that appears unfinished or incorrect. Be very thorough — check headings, body text, button labels, navigation items, footer text, form labels, and any other visible copy.

CRITICAL INSTRUCTIONS:
- You MUST return ONLY a raw JSON array. No markdown formatting, no backticks, no code fences, no explanatory text before or after.
- Start your response with [ and end with ]
- Each object MUST have exactly these fields: "id", "category", "name", "severity", "description", "suggestion", "page"
- severity must be one of: "critical", "warning", "info", "passed"
- category must be one of: "Performance", "Accessibility", "Functionality", "Security", "Responsive", "SEO", "Content"
- Return 12-20 findings total, including BOTH issues AND things that passed
- Be SPECIFIC — reference actual text, elements, pages, or resources you observed
- For typos/content issues, quote the exact problematic text and suggest the correction
- If the site loads successfully, you MUST analyze its actual content, don't say it doesn't exist

Example format (return ONLY this structure):
[{"id":"func-001","category":"Functionality","name":"Navigation Links","severity":"passed","description":"All main navigation links resolve correctly.","suggestion":"No action needed.","page":"/all"},{"id":"content-001","category":"Content","name":"Typo in Hero Section","severity":"warning","description":"The heading reads 'Welcom to Our Platform' — missing 'e' in 'Welcome'.","suggestion":"Correct to 'Welcome to Our Platform'.","page":"/"}]`;

    let userMessage = `Analyze this website URL thoroughly: ${url}\n\nSearch for this exact URL first, then search for the domain name. Examine all the content you can find — every heading, paragraph, button, link, and section. Check for typos, broken elements, missing SEO tags, accessibility issues, security headers, and performance concerns.\n\nRemember: Return ONLY a JSON array starting with [ and ending with ]. No other text.`;

    if (authInfo && authInfo.email) {
      userMessage += `\n\nNote: This site has authentication. Login: ${authInfo.email}. Analyze the login flow structure and publicly visible pages.`;
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
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${response.status}`, details: errText.slice(0, 500) }), { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = {
  path: "/api/analyze",
};
