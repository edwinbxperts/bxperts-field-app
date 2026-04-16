import { useState, useEffect, useCallback, useRef } from "react";

// ─── BRAND COLORS (from bxperts.com) ─────────────────────────────────────────
const B = {
  navy:       "#1B2D4F",   // primary dark — logo, headers, footer
  navyDark:   "#152238",   // deeper background
  navyLight:  "#243D68",   // card surfaces
  orange:     "#E87722",   // accent — X logo, CTAs, highlights
  orangeLight:"#F0954A",   // hover/lighter orange
  lime:       "#A8C832",   // secondary — success, badges, icons
  limeDark:   "#8AAF1A",   // deeper lime
  white:      "#FFFFFF",
  offWhite:   "#F4F6FA",
  grayLight:  "#E2E8F0",
  gray:       "#8A9BB5",
  grayDark:   "#4A607A",
  textOnNavy: "#FFFFFF",
  textSub:    "#A0B4CC",
};

// ─── AZURE AD CONFIG ──────────────────────────────────────────────────────────
const AZURE_CONFIG = {
  clientId:    "YOUR_AZURE_CLIENT_ID",
  tenantId:    "YOUR_TENANT_ID",
  redirectUri: "https://your-app-domain.com",
  scopes:      ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"],
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BOARD_ID   = 5832196313;
const MS365_MCP  = "https://microsoft365.mcp.claude.com/mcp";
const MONDAY_MCP = "https://mcp.monday.com/mcp";

const STATUS_META = {
  "NEW":       { color: B.gray,       bg: B.navyLight },
  "Request":   { color: "#5AADDE",    bg: "#1A3560" },
  "Tentative": { color: B.orange,     bg: "#3A2010" },
  "Approved":  { color: B.lime,       bg: "#1E3010" },
  "ON GOING":  { color: B.orangeLight,bg: "#3A2810" },
  "Completed": { color: "#5A9ADE",    bg: "#1A2A50" },
  "Cancelled": { color: "#E06060",    bg: "#3A1010" },
};

// ─── MSAL HELPERS ─────────────────────────────────────────────────────────────
function getMsal() {
  if (!window.msal) return null;
  if (!window.__msalApp) {
    window.__msalApp = new window.msal.PublicClientApplication({
      auth: {
        clientId:    AZURE_CONFIG.clientId,
        authority:   `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}`,
        redirectUri: AZURE_CONFIG.redirectUri,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
  }
  return window.__msalApp;
}
async function msalLogin() {
  const m = getMsal();
  if (!m) throw new Error("MSAL not loaded");
  const r = await m.loginPopup({ scopes: AZURE_CONFIG.scopes, prompt: "select_account" });
  return r.account;
}
async function msalLogout() {
  const m = getMsal();
  if (!m) return;
  const accs = m.getAllAccounts();
  if (accs[0]) await m.logoutPopup({ account: accs[0] });
}
function getActiveAccount() {
  try { const m = getMsal(); return m?.getAllAccounts()[0] || null; }
  catch { return null; }
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function callClaude(system, user, mcpServers = []) {
  const body = {
    model: "claude-sonnet-4-20250514", max_tokens: 1000,
    system, messages: [{ role: "user", content: user }],
  };
  if (mcpServers.length) body.mcp_servers = mcpServers;
  const res = await fetch("/api/claude-proxy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
function parseJSON(data) {
  const text = data.content?.find(b => b.type === "text")?.text || "";
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}
async function fetchMyJobs(email, name) {
  const data = await callClaude(
    `Query monday.com board ${BOARD_ID}. Return ONLY a JSON array of job objects:
     id, name, status, customer, final_client, location, timeline_start, timeline_end, job_type,
     stage, division, description, client_poc, client_poc_phone, client_poc_email,
     service_note, shift, on_site_date, duration, job_folder_link, report_link, report_docs,
     flight, hotel, hotel_address, transportation, special_accommodations, special_terms.
     Filter by Assigned Technician matching email OR name. Exclude Cancelled and Completed. No markdown.`,
    `Assignments for technician email: "${email}", name: "${name}". Limit 50.`,
    [{ type: "url", url: MONDAY_MCP, name: "monday" }]
  );
  return parseJSON(data) || [];
}
async function getTemplates(jobType) {
  const data = await callClaude(
    `Search OneDrive/SharePoint for report templates. Return ONLY JSON array:
     [{id, name, webUrl, downloadUrl, lastModified}]. No markdown.`,
    `Find templates for job type: "${jobType}". Check "Templates" folder first.`,
    [{ type: "url", url: MS365_MCP, name: "microsoft365" }]
  );
  return parseJSON(data) || [];
}
async function uploadReport(fileName, base64, jobId, jobName) {
  const data = await callClaude(
    `Upload file to OneDrive. Return ONLY JSON: {success, fileId, webUrl, message}. No markdown.`,
    `Upload "${fileName}" to "Tech Reports/${jobId} - ${jobName}". Base64 starts: ${base64.substring(0,80)}`,
    [{ type: "url", url: MS365_MCP, name: "microsoft365" }]
  );
  return parseJSON(data) || { success: false, message: "Upload failed" };
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: B.gray, bg: B.navyLight };
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800,
      letterSpacing: "0.07em", textTransform: "uppercase",
      color: m.color, background: m.bg, border: `1px solid ${m.color}50`,
      display: "inline-block",
    }}>{status || "—"}</span>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <div style={{
        width: 30, height: 30, borderRadius: "50%",
        border: `3px solid ${B.navyLight}`,
        borderTop: `3px solid ${B.orange}`,
        animation: "spin 0.7s linear infinite",
      }} />
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [ready,   setReady]   = useState(false);
  const canvasRef = useRef(null);

  // Animated circuit-board-style dots (industrial feel matching bxperts)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf, frame = 0;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
    }));
    const draw = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw connecting lines
      pts.forEach((a, i) => {
        pts.slice(i + 1).forEach(b => {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(168,200,50,${0.12 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        });
        // Move
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > canvas.width)  a.vx *= -1;
        if (a.y < 0 || a.y > canvas.height) a.vy *= -1;
        // Draw dot
        ctx.beginPath();
        ctx.arc(a.x, a.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(168,200,50,0.25)";
        ctx.fill();
      });
      frame++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1200);
    const i = setInterval(() => { if (window.msal) { setReady(true); clearInterval(i); } }, 300);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);

  const handleLogin = async () => {
    setLoading(true); setError("");
    try {
      if (window.msal) {
        const account = await msalLogin();
        if (!account.username.toLowerCase().endsWith("@bxperts.com")) {
          await msalLogout();
          throw new Error("Access is restricted to @bxperts.com accounts only.");
        }
        onLogin({
          name:   account.name,
          email:  account.username.toLowerCase(),
          avatar: account.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(),
        });
      } else {
        // Demo mode
        await new Promise(r => setTimeout(r, 900));
        onLogin({ name: "Demo Technician", email: "demo@bxperts.com", avatar: "DT", isDemo: true });
      }
    } catch (e) {
      setError(e.message || "Sign-in failed. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(160deg, ${B.navyDark} 0%, ${B.navy} 60%, #1E3A6A 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 24, position: "relative", overflow: "hidden",
      fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
    }}>
      {/* Animated background */}
      <canvas ref={canvasRef} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.8,
      }} />

      {/* Orange glow top-right (matches bxperts accent energy) */}
      <div style={{
        position: "absolute", top: -80, right: -60,
        width: 280, height: 280, borderRadius: "50%",
        background: `radial-gradient(circle, ${B.orange}22 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      {/* Lime glow bottom-left */}
      <div style={{
        position: "absolute", bottom: -60, left: -40,
        width: 240, height: 240, borderRadius: "50%",
        background: `radial-gradient(circle, ${B.lime}18 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          {/* bXperts logo recreation */}
          <div style={{ marginBottom: 16 }}>
            <span style={{
              fontSize: 42, fontWeight: 900, letterSpacing: -1,
              color: B.white, fontFamily: "'Trebuchet MS', sans-serif",
            }}>
              b<span style={{ color: B.orange }}>X</span>perts
            </span>
          </div>
          <div style={{
            display: "inline-block",
            padding: "4px 16px", borderRadius: 20,
            background: `${B.lime}22`, border: `1px solid ${B.lime}40`,
            color: B.lime, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", textTransform: "uppercase",
          }}>
            Field Service Portal
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(21,34,56,0.85)",
          backdropFilter: "blur(12px)",
          borderRadius: 20, padding: "32px 28px",
          border: `1px solid rgba(255,255,255,0.1)`,
          boxShadow: `0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,200,50,0.08)`,
        }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ color: B.white, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Welcome back
            </div>
            <div style={{ color: B.textSub, fontSize: 13, lineHeight: 1.55 }}>
              Sign in with your{" "}
              <span style={{ color: B.lime, fontWeight: 700 }}>@bxperts.com</span>
              {" "}Microsoft account to access your job assignments.
            </div>
          </div>

          {/* Microsoft button */}
          <button
            onClick={handleLogin}
            disabled={loading || !ready}
            style={{
              width: "100%", padding: "15px 20px", borderRadius: 12,
              background: loading
                ? "rgba(255,255,255,0.05)"
                : `linear-gradient(135deg, #185ABD 0%, #2563B8 100%)`,
              border: loading
                ? `1px solid rgba(255,255,255,0.08)`
                : "1px solid rgba(37,99,184,0.6)",
              color: loading ? B.gray : B.white,
              fontSize: 15, fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              fontFamily: "inherit", transition: "all 0.2s",
              boxShadow: loading ? "none" : "0 4px 20px rgba(24,90,189,0.35)",
              letterSpacing: 0.3,
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${B.navyLight}`,
                  borderTop: `2px solid ${B.orange}`,
                  animation: "spin 0.7s linear infinite",
                }} />
                Signing in...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                Sign in with Microsoft
              </>
            )}
          </button>

          {error && (
            <div style={{
              marginTop: 14, padding: "11px 14px", borderRadius: 10,
              background: "rgba(224,96,96,0.12)", border: "1px solid rgba(224,96,96,0.3)",
              color: "#E07070", fontSize: 13, lineHeight: 1.45,
            }}>⚠️ {error}</div>
          )}

          {/* Trust pills */}
          <div style={{
            marginTop: 26, paddingTop: 20,
            borderTop: `1px solid rgba(255,255,255,0.07)`,
            display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap",
          }}>
            {[
              { icon: "🔒", label: "Azure AD" },
              { icon: "🛡️", label: "MFA Ready" },
              { icon: "✉️", label: "@bxperts.com only" },
            ].map(({ icon, label }) => (
              <div key={label} style={{
                padding: "4px 11px", borderRadius: 20,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: B.gray, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.04em",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {icon} {label}
              </div>
            ))}
          </div>
        </div>

        <div style={{
          textAlign: "center", marginTop: 22,
          color: "rgba(255,255,255,0.25)", fontSize: 11, lineHeight: 1.7,
        }}>
          Having trouble? Contact IT support.
        </div>
      </div>
    </div>
  );
}

// ─── TOP NAV ──────────────────────────────────────────────────────────────────
function Nav({ user, onLogout }) {
  const [menu, setMenu] = useState(false);
  return (
    <div style={{
      background: B.navy,
      borderBottom: `3px solid ${B.orange}`,
      padding: "12px 18px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 20,
      boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: B.navyDark,
          border: `1px solid rgba(255,255,255,0.12)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            fontSize: 16, fontWeight: 900, color: B.white,
            fontFamily: "'Trebuchet MS', sans-serif", letterSpacing: -0.5,
          }}>
            b<span style={{ color: B.orange }}>X</span>
          </span>
        </div>
        <div>
          <div style={{ color: B.white, fontSize: 14, fontWeight: 700, lineHeight: 1, letterSpacing: 0.2 }}>
            Field Portal
          </div>
          {user.isDemo && (
            <div style={{ color: B.lime, fontSize: 9, letterSpacing: "0.1em", fontWeight: 700 }}>DEMO MODE</div>
          )}
        </div>
      </div>

      {/* User menu */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setMenu(v => !v)} style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 24, padding: "6px 12px 6px 7px", cursor: "pointer",
          transition: "background 0.15s",
        }}>
          <div style={{
            width: 27, height: 27, borderRadius: "50%",
            background: `linear-gradient(135deg, ${B.orange}, ${B.orangeLight})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: B.white, fontSize: 10, fontWeight: 800,
          }}>{user.avatar}</div>
          <span style={{ color: B.textOnNavy, fontSize: 12, fontWeight: 600 }}>
            {user.name.split(" ")[0]}
          </span>
          <span style={{ color: B.textSub, fontSize: 9 }}>▼</span>
        </button>

        {menu && (
          <>
            <div onClick={() => setMenu(false)} style={{
              position: "fixed", inset: 0, zIndex: 29,
            }} />
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)",
              background: B.navy, border: `1px solid rgba(255,255,255,0.12)`,
              borderRadius: 14, padding: 8, minWidth: 210,
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)", zIndex: 30,
            }}>
              <div style={{ padding: "10px 14px 12px", borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
                <div style={{ color: B.white, fontSize: 13, fontWeight: 700 }}>{user.name}</div>
                <div style={{ color: B.textSub, fontSize: 11, marginTop: 2 }}>{user.email}</div>
              </div>
              <button onClick={() => { setMenu(false); onLogout(); }} style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                background: "none", border: "none", color: "#E07070",
                fontSize: 13, cursor: "pointer", textAlign: "left",
                fontFamily: "inherit", marginTop: 4,
              }}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── JOB CARD ─────────────────────────────────────────────────────────────────
function JobCard({ job, onClick }) {
  const fmt = d => d
    ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const s = fmt(job.timeline_start), e = fmt(job.timeline_end);

  return (
    <div
      onClick={() => onClick(job)}
      style={{
        background: B.navy,
        borderRadius: 14, padding: "17px 18px",
        border: `1px solid rgba(255,255,255,0.08)`,
        borderLeft: `4px solid ${B.orange}`,
        marginBottom: 10, cursor: "pointer",
        boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
        transition: "transform 0.1s, box-shadow 0.1s",
        WebkitTapHighlightColor: "transparent",
      }}
      onTouchStart={e => e.currentTarget.style.transform = "scale(0.975)"}
      onTouchEnd={e => e.currentTarget.style.transform = "scale(1)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ color: B.white, fontSize: 15, fontWeight: 700, flex: 1, paddingRight: 12, lineHeight: 1.3 }}>
          {job.name}
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.customer && (
        <div style={{ color: B.textSub, fontSize: 12, marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: B.lime, fontSize: 13 }}>🏢</span> {job.customer}
        </div>
      )}
      {job.location && (
        <div style={{ color: B.gray, fontSize: 12, marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>📍</span>
          {typeof job.location === "object" ? (job.location.address || job.location.city || "—") : job.location}
        </div>
      )}
      {(s || e) && (
        <div style={{ color: B.gray, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>📅</span> {s}{e && s !== e ? ` → ${e}` : ""}
        </div>
      )}

      {job.job_type && (
        <div style={{
          display: "inline-block", marginTop: 10, padding: "3px 10px",
          background: `${B.lime}18`, border: `1px solid ${B.lime}40`,
          borderRadius: 20, color: B.lime, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
        }}>{job.job_type}</div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <span style={{ color: B.orange, fontSize: 18, fontWeight: 700 }}>→</span>
      </div>
    </div>
  );
}

// ─── JOB DETAIL ───────────────────────────────────────────────────────────────
function JobDetail({ job, onBack }) {
  const [tab,       setTab]       = useState("info");
  const [templates, setTemplates] = useState([]);
  const [loadingT,  setLoadingT]  = useState(false);
  const [file,      setFile]      = useState(null);
  const [upState,   setUpState]   = useState({ loading: false, result: null });

  useEffect(() => {
    if (tab !== "reports") return;
    setLoadingT(true);
    getTemplates(job.job_type || "service").then(r => {
      setTemplates(r); setLoadingT(false);
    });
  }, [tab, job.job_type]);

  const doUpload = async () => {
    if (!file) return;
    setUpState({ loading: true, result: null });
    const reader = new FileReader();
    reader.onload = async ev => {
      const b64 = ev.target.result.split(",")[1];
      const r = await uploadReport(file.name, b64, job.id, job.name);
      setUpState({ loading: false, result: r });
    };
    reader.readAsDataURL(file);
  };

  const Row = ({ icon, label, val }) => {
    if (!val) return null;
    const display = typeof val === "object"
      ? (val.address || val.city || JSON.stringify(val))
      : String(val);
    return (
      <div style={{
        padding: "13px 0",
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
        display: "flex", gap: 12,
      }}>
        <span style={{ fontSize: 15, minWidth: 22, marginTop: 1 }}>{icon}</span>
        <div>
          <div style={{
            color: B.gray, fontSize: 10, textTransform: "uppercase",
            letterSpacing: "0.08em", marginBottom: 3, fontWeight: 700,
          }}>{label}</div>
          <div style={{ color: B.white, fontSize: 14, lineHeight: 1.45 }}>{display}</div>
        </div>
      </div>
    );
  };

  const TABS = [
    { id: "info",    label: "Work Order" },
    { id: "travel",  label: "Travel"     },
    { id: "reports", label: "Reports"    },
  ];

  return (
    <div style={{ fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif", paddingBottom: 48 }}>
      {/* Sticky header */}
      <div style={{
        background: B.navy,
        borderBottom: `1px solid rgba(255,255,255,0.08)`,
        position: "sticky", top: 0, zIndex: 10,
        padding: "12px 18px 0",
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: B.lime,
          fontSize: 13, cursor: "pointer", padding: "0 0 10px",
          fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
          fontWeight: 700,
        }}>
          ← My Jobs
        </button>
        <div style={{ color: B.white, fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginBottom: 7 }}>
          {job.name}
        </div>
        <div style={{ marginBottom: 12 }}><StatusBadge status={job.status} /></div>

        {/* Tabs */}
        <div style={{ display: "flex", marginTop: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 0",
              background: "none", border: "none",
              borderBottom: tab === t.id
                ? `3px solid ${B.orange}`
                : "3px solid transparent",
              color: tab === t.id ? B.orange : B.gray,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.04em",
              transition: "color 0.15s",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "4px 18px 0", background: B.navyDark, minHeight: "calc(100vh - 200px)" }}>
        {/* ── WORK ORDER TAB ── */}
        {tab === "info" && <>
          <Row icon="🏢" label="Customer"       val={job.customer} />
          <Row icon="🏭" label="Final Client"   val={job.final_client} />
          <Row icon="📍" label="Location"       val={job.location} />
          <Row icon="📅" label="Timeline"       val={
            job.timeline_start
              ? `${job.timeline_start}${job.timeline_end ? " → " + job.timeline_end : ""}`
              : null
          } />
          <Row icon="🔧" label="Job Type"       val={job.job_type} />
          <Row icon="🏷️" label="Stage"          val={job.stage} />
          <Row icon="🏛️" label="Division"       val={job.division} />
          <Row icon="📋" label="Description"    val={job.description} />
          <Row icon="⏰" label="Shift"           val={job.shift} />
          <Row icon="📆" label="On-Site Date"   val={job.on_site_date} />
          <Row icon="⏱️" label="Duration"       val={job.duration ? `${job.duration} days` : null} />
          <Row icon="📝" label="Service Note"   val={job.service_note} />
          <Row icon="👤" label="Client POC"     val={job.client_poc} />
          <Row icon="📞" label="POC Phone"      val={job.client_poc_phone} />
          <Row icon="✉️" label="POC Email"      val={job.client_poc_email} />

          {job.special_terms && (
            <div style={{ padding: "14px 0" }}>
              <div style={{ color: B.gray, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 8 }}>
                📌 Special Terms
              </div>
              <div style={{
                background: B.navy, borderRadius: 10, padding: 14,
                color: B.textSub, fontSize: 13, lineHeight: 1.6,
                border: `1px solid ${B.lime}30`,
                borderLeft: `3px solid ${B.lime}`,
              }}>{job.special_terms}</div>
            </div>
          )}

          {job.job_folder_link && (
            <a href={job.job_folder_link} target="_blank" rel="noreferrer" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              marginTop: 20, padding: 14, borderRadius: 12,
              background: `${B.lime}15`,
              border: `1px solid ${B.lime}40`,
              color: B.lime, fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}>
              📁 Open Job Folder
            </a>
          )}
        </>}

        {/* ── TRAVEL TAB ── */}
        {tab === "travel" && <>
          <Row icon="✈️" label="Flight"                 val={job.flight} />
          <Row icon="🏨" label="Hotel"                  val={job.hotel} />
          <Row icon="📍" label="Hotel Address"          val={job.hotel_address} />
          <Row icon="🚗" label="Transportation"         val={job.transportation} />
          <Row icon="🛌" label="Special Accommodations" val={job.special_accommodations} />
          <Row icon="📋" label="Itinerary / Reservation" val={job.itinerary_reservation} />
          {!job.flight && !job.hotel && !job.transportation && (
            <div style={{ textAlign: "center", padding: "56px 20px" }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>✈️</div>
              <div style={{ color: B.gray, fontSize: 14 }}>No travel arrangements on file.</div>
            </div>
          )}
        </>}

        {/* ── REPORTS TAB ── */}
        {tab === "reports" && (
          <div style={{ paddingTop: 8 }}>
            {/* Templates */}
            <div style={{ marginBottom: 28 }}>
              <div style={{
                color: B.white, fontSize: 13, fontWeight: 700,
                marginBottom: 12, display: "flex", alignItems: "center", gap: 7,
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: `${B.lime}25`, display: "inline-flex",
                  alignItems: "center", justifyContent: "center", fontSize: 13,
                }}>📄</span>
                Report Templates
              </div>
              {loadingT ? <Spinner /> : templates.length ? (
                templates.map((t, i) => (
                  <a key={i} href={t.webUrl || t.downloadUrl} target="_blank" rel="noreferrer" style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "13px 15px", background: B.navy, borderRadius: 12,
                    border: `1px solid rgba(255,255,255,0.08)`,
                    marginBottom: 8, textDecoration: "none",
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: `linear-gradient(135deg, ${B.navy}, ${B.navyLight})`,
                      border: `1px solid ${B.lime}40`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>📋</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: B.white, fontSize: 13, fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{t.name}</div>
                      {t.lastModified && (
                        <div style={{ color: B.gray, fontSize: 11, marginTop: 1 }}>
                          {new Date(t.lastModified).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${B.orange}20`, border: `1px solid ${B.orange}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: B.orange, fontSize: 16, fontWeight: 700,
                    }}>↓</div>
                  </a>
                ))
              ) : (
                <div style={{
                  padding: "20px 16px", borderRadius: 12, background: B.navy,
                  border: `1px dashed rgba(255,255,255,0.1)`,
                  textAlign: "center", color: B.gray, fontSize: 13,
                }}>
                  No templates in OneDrive yet.<br />
                  <span style={{ color: `${B.lime}80`, fontSize: 11 }}>
                    Add files to a "Templates" folder in SharePoint.
                  </span>
                </div>
              )}
            </div>

            {/* Submitted reports */}
            {job.report_docs && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ color: B.white, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                  📁 Submitted Reports
                </div>
                <div style={{
                  background: B.navy, borderRadius: 12, padding: "13px 15px",
                  border: `1px solid rgba(255,255,255,0.08)`,
                  color: B.textSub, fontSize: 13,
                }}>{job.report_docs}</div>
              </div>
            )}

            {/* Upload */}
            <div>
              <div style={{ color: B.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                ⬆️ Upload Completed Report
              </div>
              <div style={{
                background: B.navy, borderRadius: 16, padding: 20,
                border: `1px dashed ${B.orange}50`,
              }}>
                <input
                  type="file" id="fu"
                  accept=".pdf,.doc,.docx,.xlsx,.xls"
                  onChange={e => {
                    setFile(e.target.files[0]);
                    setUpState({ loading: false, result: null });
                  }}
                  style={{ display: "none" }}
                />
                <label htmlFor="fu" style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  padding: 14, borderRadius: 12,
                  background: B.navyDark,
                  border: `1px solid ${file ? B.orange + "60" : "rgba(255,255,255,0.08)"}`,
                  cursor: "pointer", marginBottom: 13,
                  color: file ? B.white : B.gray, fontSize: 14,
                  transition: "border 0.15s",
                }}>
                  <span style={{ fontSize: 20 }}>{file ? "📄" : "📎"}</span>
                  {file ? file.name : "Tap to select file"}
                </label>

                {file && !upState.result && (
                  <button onClick={doUpload} disabled={upState.loading} style={{
                    width: "100%", padding: 14, borderRadius: 12,
                    background: upState.loading
                      ? "rgba(255,255,255,0.05)"
                      : `linear-gradient(135deg, ${B.orange}, ${B.orangeLight})`,
                    border: upState.loading ? `1px solid rgba(255,255,255,0.08)` : "none",
                    color: upState.loading ? B.gray : B.white,
                    fontSize: 15, fontWeight: 700,
                    cursor: upState.loading ? "default" : "pointer",
                    fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: upState.loading ? "none" : `0 4px 16px ${B.orange}40`,
                  }}>
                    {upState.loading ? (
                      <>
                        <div style={{
                          width: 16, height: 16, borderRadius: "50%",
                          border: `2px solid rgba(255,255,255,0.2)`,
                          borderTop: `2px solid ${B.white}`,
                          animation: "spin 0.7s linear infinite",
                        }} />
                        Uploading to OneDrive...
                      </>
                    ) : "Upload to OneDrive"}
                  </button>
                )}

                {upState.result && (
                  <div style={{
                    padding: "11px 14px", borderRadius: 10, fontSize: 13,
                    background: upState.result.success
                      ? "rgba(168,200,50,0.1)"
                      : "rgba(224,96,96,0.1)",
                    border: `1px solid ${upState.result.success ? B.lime + "50" : "#E0606050"}`,
                    color: upState.result.success ? B.lime : "#E07070",
                  }}>
                    {upState.result.success ? "✅" : "❌"} {upState.result.message}
                    {upState.result.webUrl && (
                      <a href={upState.result.webUrl} target="_blank" rel="noreferrer"
                        style={{ display: "block", color: "#5AADDE", marginTop: 6, fontSize: 12 }}>
                        View in OneDrive →
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── JOBS LIST ────────────────────────────────────────────────────────────────
function JobsList({ user, onLogout }) {
  const [jobs,     setJobs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState("all");

  useEffect(() => {
    fetchMyJobs(user.email, user.name).then(r => {
      setJobs(r); setLoading(false);
    });
  }, [user]);

  const shown = jobs.filter(j => {
    const q = search.toLowerCase();
    return (
      (!q || j.name?.toLowerCase().includes(q) || j.customer?.toLowerCase().includes(q)) &&
      (filter === "all" || j.status === filter)
    );
  });

  const filterOptions = [
    { id: "all",       label: "All" },
    { id: "Approved",  label: "Approved" },
    { id: "ON GOING",  label: "On Going" },
    { id: "Tentative", label: "Tentative" },
  ];

  return (
    <div style={{
      fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      minHeight: "100vh", background: B.navyDark,
    }}>
      <Nav user={user} onLogout={onLogout} />

      {selected ? (
        <JobDetail job={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          {/* Search + filters */}
          <div style={{
            padding: "14px 14px 8px",
            background: B.navy,
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
          }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <span style={{
                position: "absolute", left: 13, top: "50%",
                transform: "translateY(-50%)", color: B.gray, fontSize: 14,
              }}>🔍</span>
              <input
                placeholder="Search jobs or customers..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "11px 14px 11px 38px",
                  borderRadius: 12,
                  background: B.navyDark,
                  border: `1px solid rgba(255,255,255,0.1)`,
                  color: B.white, fontSize: 14, outline: "none",
                  boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
            </div>

            {/* Filter pills */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {filterOptions.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{
                  padding: "6px 14px", borderRadius: 20,
                  border: `1px solid ${filter === f.id ? B.orange : "rgba(255,255,255,0.12)"}`,
                  background: filter === f.id ? `${B.orange}20` : "transparent",
                  color: filter === f.id ? B.orange : B.gray,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap", fontFamily: "inherit", letterSpacing: "0.04em",
                  transition: "all 0.15s",
                }}>{f.label}</button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div style={{
            padding: "10px 16px 4px",
            color: B.gray, fontSize: 11, letterSpacing: "0.07em", fontWeight: 700,
          }}>
            {loading
              ? "LOADING ASSIGNMENTS..."
              : `${shown.length} JOB${shown.length !== 1 ? "S" : ""}`}
          </div>

          {/* List */}
          <div style={{ padding: "4px 12px 60px" }}>
            {loading ? <Spinner /> : shown.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>📋</div>
                <div style={{ color: B.gray, fontSize: 15, fontWeight: 600 }}>
                  {jobs.length === 0
                    ? `No assignments found for ${user.name}`
                    : "No jobs match this filter"}
                </div>
              </div>
            ) : (
              shown.map(j => <JobCard key={j.id} job={j} onClick={setSelected} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const acc = getActiveAccount();
      if (acc) return {
        name:   acc.name,
        email:  acc.username.toLowerCase(),
        avatar: acc.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(),
      };
    } catch {}
    return null;
  });

  const logout = async () => { await msalLogout(); setUser(null); };

  return (
    <>
      <style>{`
        * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        body { background:${B.navyDark}; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { display:none; }
        input::placeholder { color:${B.grayDark}; }
        a { -webkit-tap-highlight-color:transparent; }
      `}</style>
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh" }}>
        {!user
          ? <Login    onLogin={setUser} />
          : <JobsList user={user} onLogout={logout} />
        }
      </div>
    </>
  );
}
