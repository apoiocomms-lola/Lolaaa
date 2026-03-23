import { useState, useEffect, useRef } from "react";

const COLORS = {
  bg: "#0a0b0f",
  surface: "#12131a",
  surfaceHover: "#1a1b24",
  border: "#1e2030",
  borderActive: "#2a2d45",
  text: "#e2e4f0",
  textMuted: "#6b6f8a",
  textDim: "#454862",
  accent: "#00d4aa",
  accentDim: "#00d4aa22",
  accentGlow: "#00d4aa44",
  critical: "#ff4d6a",
  criticalDim: "#ff4d6a22",
  warning: "#ffb347",
  warningDim: "#ffb34722",
  info: "#4dabff",
  infoDim: "#4dabff22",
  passed: "#00d4aa",
  passedDim: "#00d4aa22",
};

const fonts = {
  display: "'JetBrains Mono', 'Fira Code', monospace",
  body: "'DM Sans', 'Segoe UI', sans-serif",
};

const severityConfig = {
  critical: { color: COLORS.critical, bg: COLORS.criticalDim, label: "Critical", icon: "⊘" },
  warning: { color: COLORS.warning, bg: COLORS.warningDim, label: "Warning", icon: "△" },
  info: { color: COLORS.info, bg: COLORS.infoDim, label: "Info", icon: "○" },
  passed: { color: COLORS.passed, bg: COLORS.passedDim, label: "Passed", icon: "✓" },
};

async function analyzeWithClaude(url, authInfo) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, authInfo }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `API returned ${response.status}`);
  }

  const data = await response.json();

  if (!data.content || !Array.isArray(data.content)) {
    throw new Error("Unexpected API response format.");
  }

  // Collect ALL text blocks
  const textParts = [];
  for (const block of data.content) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text.trim());
    }
  }

  const fullText = textParts.join("\n");

  if (!fullText) {
    throw new Error("The AI did not return any text results. The site may have limited public information. Try again.");
  }

  // Strategy 1: Try parsing each text block individually
  for (const part of textParts) {
    try {
      const cleaned = part.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }

  // Strategy 2: Find JSON array in combined text
  const arrayMatches = fullText.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
  if (arrayMatches) {
    // Try longest match first (most likely the full result)
    const sorted = arrayMatches.sort((a, b) => b.length - a.length);
    for (const match of sorted) {
      try {
        const parsed = JSON.parse(match);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
  }

  // Strategy 3: Try to extract from first [ to last ]
  const firstBracket = fullText.indexOf("[");
  const lastBracket = fullText.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const jsonCandidate = fullText.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      // Try fixing common issues: trailing commas
      const fixed = jsonCandidate.replace(/,\s*\]/g, "]").replace(/,\s*\}/g, "}");
      try {
        const parsed = JSON.parse(fixed);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e2) {}
    }
  }

  // If we got text but couldn't parse JSON, the AI probably described findings in prose
  // Let's make a second call asking it to format as JSON
  const retryResponse = await fetch("/api/format", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: fullText.slice(0, 3000) }),
  });

  if (retryResponse.ok) {
    const retryData = await retryResponse.json();
    const retryText = retryData.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n") || "";

    const retryClean = retryText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    try {
      const parsed = JSON.parse(retryClean);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      const m = retryClean.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (m) {
        try {
          const parsed = JSON.parse(m[0]);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e2) {}
      }
    }
  }

  throw new Error("Could not parse scan results. The AI returned findings but not in the expected format. Please try again.");
}

// ── UI Components ──

function ScanDots() {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const iv = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
    return () => clearInterval(iv);
  }, []);
  return <span style={{ color: COLORS.accent, fontFamily: fonts.display }}>{dots || "."}</span>;
}

function ProgressBar({ progress, label }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: fonts.body }}>{label}</span>
        <span style={{ fontSize: 12, color: COLORS.accent, fontFamily: fonts.display }}>{progress}%</span>
      </div>
      <div style={{ height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${progress}%`,
          background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.info})`,
          borderRadius: 2, transition: "width 0.4s ease",
          boxShadow: `0 0 12px ${COLORS.accentGlow}`,
        }} />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const c = severityConfig[severity] || severityConfig.info;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
      borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: fonts.display,
      color: c.color, background: c.bg, border: `1px solid ${c.color}33`,
      letterSpacing: "0.03em", textTransform: "uppercase",
    }}>
      <span style={{ fontSize: 10 }}>{c.icon}</span> {c.label}
    </span>
  );
}

function IssueCard({ issue, index }) {
  const [open, setOpen] = useState(false);
  const c = severityConfig[issue.severity] || severityConfig.info;
  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${c.color}`, borderRadius: 6, padding: "14px 18px",
        cursor: "pointer", transition: "all 0.2s ease",
        animation: `fadeSlideIn 0.3s ease ${index * 0.04}s both`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceHover; e.currentTarget.style.borderColor = COLORS.borderActive; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.surface; e.currentTarget.style.borderColor = COLORS.border; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <SeverityBadge severity={issue.severity} />
          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, fontFamily: fonts.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{issue.name}</span>
          <span style={{ fontSize: 11, color: COLORS.textDim, fontFamily: fonts.display, flexShrink: 0 }}>{issue.id}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: fonts.display, background: COLORS.border + "88", padding: "2px 8px", borderRadius: 3 }}>{issue.category}</span>
          <span style={{ color: COLORS.textDim, fontSize: 16, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textDim, fontFamily: fonts.display, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Issue</div>
            <div style={{ fontSize: 13, color: COLORS.text, fontFamily: fonts.body, lineHeight: 1.6 }}>{issue.description}</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textDim, fontFamily: fonts.display, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Suggested Fix</div>
            <div style={{ fontSize: 13, color: COLORS.accent, fontFamily: fonts.body, lineHeight: 1.6, background: COLORS.accentDim, padding: "8px 12px", borderRadius: 4, border: `1px solid ${COLORS.accent}22` }}>{issue.suggestion}</div>
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: fonts.display }}>Page: {issue.page}</div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "18px 20px", flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: fonts.display, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{icon} {label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || COLORS.text, fontFamily: fonts.display }}>{value}</div>
    </div>
  );
}

// ── Main App ──
export default function LolasAIQA() {
  const [view, setView] = useState("home");
  const [url, setUrl] = useState("");
  const [authMode, setAuthMode] = useState("none");
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPhase, setScanPhase] = useState("");
  const [scanError, setScanError] = useState(null);
  const [results, setResults] = useState(null);
  const [currentScanUrl, setCurrentScanUrl] = useState("");
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [history, setHistory] = useState([]);
  const progressInterval = useRef(null);
  const abortRef = useRef(false);

  const phases = [
    { at: 0, label: "Initializing Lola's AI-QA" },
    { at: 8, label: "Searching for site content" },
    { at: 18, label: "Crawling visible pages" },
    { at: 30, label: "Analyzing page structure & content" },
    { at: 42, label: "Checking for typos & content issues" },
    { at: 52, label: "Running accessibility checks" },
    { at: 62, label: "Testing security configuration" },
    { at: 72, label: "Evaluating performance" },
    { at: 82, label: "Reviewing SEO metadata" },
    { at: 90, label: "Compiling report" },
    { at: 100, label: "Scan complete" },
  ];

  function startProgressSimulation() {
    let prog = 0;
    progressInterval.current = setInterval(() => {
      const increment = prog < 40 ? Math.random() * 2.5 + 0.8 : prog < 70 ? Math.random() * 1.2 + 0.3 : Math.random() * 0.3 + 0.05;
      prog = Math.min(prog + increment, 91);
      setScanProgress(Math.round(prog));
      const phase = [...phases].reverse().find((p) => prog >= p.at);
      if (phase) setScanPhase(phase.label);
    }, 250);
  }

  async function startScan() {
    if (!url.trim()) return;
    let scanUrl = url.trim();
    if (!scanUrl.startsWith("http")) scanUrl = `https://${scanUrl}`;
    setCurrentScanUrl(scanUrl);
    setView("scanning");
    setScanProgress(0);
    setScanPhase(phases[0].label);
    setScanError(null);
    abortRef.current = false;

    startProgressSimulation();

    try {
      const authInfo = authMode !== "none" ? credentials : null;
      const findings = await analyzeWithClaude(scanUrl, authInfo);
      if (abortRef.current) return;

      clearInterval(progressInterval.current);
      setScanProgress(95);
      setScanPhase("Compiling report");
      await new Promise((r) => setTimeout(r, 500));
      setScanProgress(100);
      setScanPhase("Scan complete");
      await new Promise((r) => setTimeout(r, 700));

      const normalized = findings.map((f, i) => ({
        id: f.id || `find-${String(i + 1).padStart(3, "0")}`,
        category: f.category || "General",
        name: f.name || "Finding",
        severity: ["critical", "warning", "info", "passed"].includes(f.severity) ? f.severity : "info",
        description: f.description || "No description.",
        suggestion: f.suggestion || "No suggestion.",
        page: f.page || "/",
      }));

      setResults(normalized);
      setFilter("all");
      setCategoryFilter("all");
      setView("results");
      setHistory((h) => [{
        id: Date.now(), url: scanUrl, date: new Date().toISOString().slice(0, 10),
        issues: normalized.filter((t) => t.severity !== "passed").length,
        critical: normalized.filter((t) => t.severity === "critical").length,
        total: normalized.length, results: normalized,
      }, ...h]);
    } catch (err) {
      clearInterval(progressInterval.current);
      if (!abortRef.current) setScanError(err.message || "An unexpected error occurred.");
    }
  }

  function cancelScan() {
    abortRef.current = true;
    clearInterval(progressInterval.current);
    setView("home");
  }

  useEffect(() => () => clearInterval(progressInterval.current), []);

  const categories = results ? [...new Set(results.map((r) => r.category))] : [];
  const filtered = results ? results.filter((r) => {
    if (filter !== "all" && r.severity !== filter) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    return true;
  }) : [];

  const counts = results ? {
    critical: results.filter((r) => r.severity === "critical").length,
    warning: results.filter((r) => r.severity === "warning").length,
    info: results.filter((r) => r.severity === "info").length,
    passed: results.filter((r) => r.severity === "passed").length,
    total: results.length,
  } : {};

  const navItems = [{ key: "home", label: "New Scan", icon: "⊕" }, { key: "history", label: "History", icon: "☰" }];
  if (results) navItems.splice(1, 0, { key: "results", label: "Results", icon: "◈" });

  const btn = {
    border: "none", cursor: "pointer", fontFamily: fonts.display,
    fontSize: 12, borderRadius: 6, transition: "all 0.2s ease",
    fontWeight: 600, letterSpacing: "0.03em",
  };

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: fonts.body }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: ${COLORS.accent}33; color: ${COLORS.accent}; }
        input::placeholder { color: ${COLORS.textDim}; }
        input:focus { outline: none; border-color: ${COLORS.accent} !important; box-shadow: 0 0 0 3px ${COLORS.accentDim}; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 32px", borderBottom: `1px solid ${COLORS.border}`,
        background: `${COLORS.surface}cc`, backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.info})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 700, color: COLORS.bg,
          }}>L</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: fonts.display, letterSpacing: "-0.02em" }}>
              Lola's <span style={{ color: COLORS.accent }}>AI-QA</span>
            </div>
            <div style={{ fontSize: 10, color: COLORS.textDim, fontFamily: fonts.display, letterSpacing: "0.1em", textTransform: "uppercase" }}>AI-Powered Quality Assurance</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {navItems.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)} style={{
              ...btn, padding: "8px 16px",
              background: view === n.key ? COLORS.accentDim : "transparent",
              color: view === n.key ? COLORS.accent : COLORS.textMuted,
              border: `1px solid ${view === n.key ? COLORS.accent + "44" : "transparent"}`,
            }}
              onMouseEnter={(e) => { if (view !== n.key) e.currentTarget.style.color = COLORS.text; }}
              onMouseLeave={(e) => { if (view !== n.key) e.currentTarget.style.color = COLORS.textMuted; }}
            >{n.icon} {n.label}</button>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>

        {/* HOME */}
        {view === "home" && (
          <div style={{ animation: "fadeSlideIn 0.4s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h1 style={{ fontSize: 32, fontWeight: 700, fontFamily: fonts.display, letterSpacing: "-0.03em", marginBottom: 12 }}>
                Test your app<span style={{ color: COLORS.accent }}>.</span>
              </h1>
              <p style={{ fontSize: 15, color: COLORS.textMuted, maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
                Paste a URL and Lola's AI will analyze every aspect of your site — functionality, accessibility, security, performance, SEO, and even typos.
              </p>
            </div>

            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 32, maxWidth: 560, margin: "0 auto" }}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.textDim, fontFamily: fonts.display, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Target URL</label>
                <input type="url" placeholder="https://your-app.com" value={url} onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startScan()}
                  style={{ width: "100%", padding: "12px 16px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.text, fontSize: 14, fontFamily: fonts.display }} />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.textDim, fontFamily: fonts.display, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Authentication</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ key: "none", label: "None" }, { key: "credentials", label: "Login Credentials" }, { key: "otp", label: "OTP — Coming Soon", disabled: true }].map((a) => (
                    <button key={a.key} onClick={() => !a.disabled && setAuthMode(a.key)} style={{
                      ...btn, padding: "8px 14px", flex: 1,
                      background: a.disabled ? COLORS.bg : authMode === a.key ? COLORS.accentDim : COLORS.bg,
                      color: a.disabled ? COLORS.textDim : authMode === a.key ? COLORS.accent : COLORS.textMuted,
                      border: `1px solid ${a.disabled ? COLORS.border : authMode === a.key ? COLORS.accent + "44" : COLORS.border}`,
                      cursor: a.disabled ? "not-allowed" : "pointer",
                      opacity: a.disabled ? 0.5 : 1,
                    }}>{a.label}</button>
                  ))}
                </div>
              </div>

              {authMode === "credentials" && (
                <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                  <input type="email" placeholder="Email / Username" value={credentials.email}
                    onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                    style={{ width: "100%", padding: "10px 14px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.text, fontSize: 13, fontFamily: fonts.display }} />
                  <input type="password" placeholder="Password" value={credentials.password}
                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                    style={{ width: "100%", padding: "10px 14px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.text, fontSize: 13, fontFamily: fonts.display }} />
                </div>
              )}

              <div style={{ marginBottom: 28 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.textDim, fontFamily: fonts.display, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Test Suite</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["Performance", "Accessibility", "Functionality", "Security", "Responsive", "SEO", "Content & Typos"].map((cat) => (
                    <span key={cat} style={{ padding: "6px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: fonts.display, background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}33`, cursor: "default" }}>✓ {cat}</span>
                  ))}
                </div>
              </div>

              <button onClick={startScan} style={{
                ...btn, width: "100%", padding: "14px 24px", fontSize: 14,
                background: url.trim() ? `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.info})` : COLORS.border,
                color: url.trim() ? COLORS.bg : COLORS.textDim,
                opacity: url.trim() ? 1 : 0.6,
                boxShadow: url.trim() ? `0 4px 24px ${COLORS.accentGlow}` : "none",
              }}>▶ Start Scan</button>
            </div>
          </div>
        )}

        {/* SCANNING */}
        {view === "scanning" && (
          <div style={{ animation: "fadeSlideIn 0.4s ease", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
            <div style={{
              width: 80, height: 80, borderRadius: 12, margin: "0 auto 32px",
              background: scanError ? COLORS.criticalDim : COLORS.accentDim,
              border: `2px solid ${scanError ? COLORS.critical + "44" : COLORS.accent + "44"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, animation: scanError ? "none" : "pulse 2s ease infinite",
              boxShadow: `0 0 40px ${scanError ? COLORS.criticalDim : COLORS.accentGlow}`,
            }}>{scanError ? "✕" : "◎"}</div>

            {!scanError ? (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.display, marginBottom: 8 }}>Analyzing<ScanDots /></h2>
                <p style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8, fontFamily: fonts.display }}>{currentScanUrl}</p>
                <p style={{ fontSize: 14, color: COLORS.accent, marginBottom: 32, fontFamily: fonts.body }}>{scanPhase}</p>

                <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24 }}>
                  <ProgressBar progress={scanProgress} label="Overall Progress" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                    {phases.slice(1, -1).map((p, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8, fontSize: 11,
                        fontFamily: fonts.display,
                        color: scanProgress >= p.at ? COLORS.accent : COLORS.textDim,
                        transition: "color 0.3s",
                      }}>
                        <span style={{ fontSize: 8 }}>{scanProgress >= p.at ? "●" : "○"}</span>
                        {p.label}
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={cancelScan} style={{ ...btn, marginTop: 20, padding: "10px 24px", background: "transparent", color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>Cancel</button>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.display, marginBottom: 12, color: COLORS.critical }}>Scan Failed</h2>
                <div style={{
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10,
                  padding: 20, marginBottom: 24, textAlign: "left",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textDim, fontFamily: fonts.display, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Error Details</div>
                  <div style={{ fontSize: 13, color: COLORS.text, fontFamily: fonts.body, lineHeight: 1.6 }}>{scanError}</div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button onClick={() => { setScanError(null); startScan(); }} style={{ ...btn, padding: "10px 24px", background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}44` }}>↻ Retry Scan</button>
                  <button onClick={() => setView("home")} style={{ ...btn, padding: "10px 24px", background: "transparent", color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>← Back</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* RESULTS */}
        {view === "results" && results && (
          <div style={{ animation: "fadeSlideIn 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.display, marginBottom: 4 }}>Scan Report</h2>
                <p style={{ fontSize: 13, color: COLORS.textMuted, fontFamily: fonts.display }}>{currentScanUrl} · {new Date().toLocaleDateString()}</p>
              </div>
              <button onClick={() => { setView("home"); setUrl(""); setResults(null); setFilter("all"); setCategoryFilter("all"); }} style={{
                ...btn, padding: "10px 20px", background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`,
              }}>⊕ New Scan</button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
              <StatCard label="Total Checks" value={counts.total} icon="◈" />
              <StatCard label="Critical" value={counts.critical} color={COLORS.critical} icon="⊘" />
              <StatCard label="Warnings" value={counts.warning} color={COLORS.warning} icon="△" />
              <StatCard label="Passed" value={counts.passed} color={COLORS.passed} icon="✓" />
            </div>

            {/* Health Score */}
            <div style={{
              background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10,
              padding: "20px 24px", marginBottom: 28, display: "flex", alignItems: "center", gap: 20,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
                background: `conic-gradient(${COLORS.accent} ${counts.total > 0 ? Math.round((counts.passed / counts.total) * 360) : 0}deg, ${COLORS.border} 0deg)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", background: COLORS.surface,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700, fontFamily: fonts.display, color: COLORS.accent,
                }}>{counts.total > 0 ? Math.round((counts.passed / counts.total) * 100) : 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: fonts.display }}>Health Score</div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                  {counts.passed} of {counts.total} checks passed{counts.critical > 0 ? ` · ${counts.critical} critical issues need immediate attention` : " · Looking good!"}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: COLORS.textDim, fontFamily: fonts.display, marginRight: 4 }}>SEVERITY</span>
              {["all", "critical", "warning", "info", "passed"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  ...btn, padding: "6px 12px",
                  background: filter === f ? (f === "all" ? COLORS.accentDim : severityConfig[f]?.bg || COLORS.accentDim) : "transparent",
                  color: filter === f ? (f === "all" ? COLORS.accent : severityConfig[f]?.color || COLORS.accent) : COLORS.textMuted,
                  border: `1px solid ${filter === f ? (f === "all" ? COLORS.accent : severityConfig[f]?.color || COLORS.accent) + "44" : "transparent"}`,
                  textTransform: "capitalize",
                }}>{f === "all" ? `All (${counts.total})` : `${f} (${counts[f] || 0})`}</button>
              ))}
              {categories.length > 1 && (
                <>
                  <span style={{ width: 1, height: 20, background: COLORS.border, margin: "0 6px" }} />
                  <span style={{ fontSize: 11, color: COLORS.textDim, fontFamily: fonts.display, marginRight: 4 }}>CATEGORY</span>
                  <button onClick={() => setCategoryFilter("all")} style={{
                    ...btn, padding: "6px 12px",
                    background: categoryFilter === "all" ? COLORS.accentDim : "transparent",
                    color: categoryFilter === "all" ? COLORS.accent : COLORS.textMuted,
                    border: `1px solid ${categoryFilter === "all" ? COLORS.accent + "44" : "transparent"}`,
                  }}>All</button>
                  {categories.map((c) => (
                    <button key={c} onClick={() => setCategoryFilter(c)} style={{
                      ...btn, padding: "6px 12px",
                      background: categoryFilter === c ? COLORS.accentDim : "transparent",
                      color: categoryFilter === c ? COLORS.accent : COLORS.textMuted,
                      border: `1px solid ${categoryFilter === c ? COLORS.accent + "44" : "transparent"}`,
                    }}>{c}</button>
                  ))}
                </>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((issue, i) => <IssueCard key={issue.id + i} issue={issue} index={i} />)}
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: COLORS.textDim, fontFamily: fonts.display }}>No issues match the current filters.</div>
              )}
            </div>
          </div>
        )}

        {/* HISTORY */}
        {view === "history" && (
          <div style={{ animation: "fadeSlideIn 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.display }}>Scan History</h2>
              <button onClick={() => setView("home")} style={{ ...btn, padding: "10px 20px", background: COLORS.accentDim, color: COLORS.accent, border: `1px solid ${COLORS.accent}44` }}>⊕ New Scan</button>
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: COLORS.textDim, fontFamily: fonts.display, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
                <div style={{ fontSize: 14 }}>No scans yet</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Start your first scan to see results here</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map((h, i) => (
                  <div key={h.id} onClick={() => { setResults(h.results); setCurrentScanUrl(h.url); setFilter("all"); setCategoryFilter("all"); setView("results"); }} style={{
                    background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8,
                    padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
                    animation: `fadeSlideIn 0.3s ease ${i * 0.05}s both`, cursor: "pointer",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceHover; e.currentTarget.style.borderColor = COLORS.borderActive; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.surface; e.currentTarget.style.borderColor = COLORS.border; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 6,
                        background: h.critical > 0 ? COLORS.criticalDim : COLORS.passedDim,
                        border: `1px solid ${h.critical > 0 ? COLORS.critical : COLORS.passed}33`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, color: h.critical > 0 ? COLORS.critical : COLORS.passed,
                      }}>{h.critical > 0 ? "⊘" : "✓"}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.display, color: COLORS.text }}>{h.url}</div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: fonts.display, marginTop: 2 }}>{h.date} · {h.total} checks</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontFamily: fonts.display, color: COLORS.textMuted }}>{h.issues} issues</span>
                      {h.critical > 0 && <span style={{ fontSize: 12, fontFamily: fonts.display, color: COLORS.critical }}>{h.critical} critical</span>}
                      <span style={{
                        padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                        fontFamily: fonts.display, textTransform: "uppercase", letterSpacing: "0.08em",
                        background: COLORS.passedDim, color: COLORS.passed, border: `1px solid ${COLORS.passed}33`,
                      }}>View →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
