import React, { useEffect, useMemo, useRef, useState } from "react";
import { generateDailyTip } from "./gemini";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const LS_TODAY = "hydration_today_entries_v1";
const LS_WEEKLY = "hydration_weekly_averages_v1";

// 1 (very pale) -> 8 (dark amber)
const URINE_COLORS = [
  { n: 1, hex: "#FFFDF2", label: "Very pale" },
  { n: 2, hex: "#FFF7C6", label: "Pale straw" },
  { n: 3, hex: "#FFEFA0", label: "Light yellow" },
  { n: 4, hex: "#FFE07A", label: "Yellow" },
  { n: 5, hex: "#FFD05A", label: "Dark yellow" },
  { n: 6, hex: "#FFBC3D", label: "Amber" },
  { n: 7, hex: "#F4A62A", label: "Dark amber" },
  { n: 8, hex: "#D9831F", label: "Very dark amber" },
];

const URINE_INSIGHTS = {
  1: { label: "Hydrated", text: "Your urine is very pale, which is a sign of excellent hydration.", action: "Keep doing what you're doing!", color: "#4caf50" },
  2: { label: "Hydrated", text: "A pale straw color indicates you are well-hydrated.", action: "Maintain your current water intake.", color: "#4caf50" },
  3: { label: "Healthy", text: "This light yellow shade is considered a healthy baseline.", action: "Sip water throughout the day.", color: "#8bc34a" },
  4: { label: "Healthy", text: "Your body is generally hydrated, but don't forget to keep drinking.", action: "Have a glass of water soon.", color: "#8bc34a" },
  5: { label: "Concentrated", text: "Your urine is getting darker, meaning your body is starting to save water.", action: "Drink 1 full glass of water now.", color: "#f39c12" },
  6: { label: "Concentrated", text: "This amber shade suggests you are likely mildly dehydrated.", action: "Drink 1-2 glasses of water immediately.", color: "#f39c12" },
  7: { label: "Very Concentrated", text: "Your urine is quite dark. Your body is significantly low on fluids.", action: "Rehydrate with 500ml of water now.", color: "#e74c3c" },
  8: { label: "Severely Concentrated", text: "Very dark urine is a strong signal that you need fluids immediately.", action: "Drink water now and monitor your next entry.", color: "#e74c3c" },
};

const FALLBACK_TIPS = [
  "Keep a water bottle nearby today.",
  "Sip water regularly—small sips add up.",
  "Drink a glass of water before meals.",
  "Refill your bottle during breaks.",
  "If your urine looks darker, sip more over the next hour.",
];

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDateShort(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function pickQuickTip() {
  return FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
}

export default function App() {
  const [todayEntries, setTodayEntries] = useState(() => readJSON(LS_TODAY, []));
  const [weeklyAverages, setWeeklyAverages] = useState(() => readJSON(LS_WEEKLY, []));
  const [selectedColor, setSelectedColor] = useState(null);
  const [toast, setToast] = useState("");

  const [dailyTip, setDailyTip] = useState("Loading tip...");
  const [tipLoading, setTipLoading] = useState(false);
  const [tipErr, setTipErr] = useState("");

  const toastTimer = useRef(null);

  function localDayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  useEffect(() => writeJSON(LS_TODAY, todayEntries), [todayEntries]);
  useEffect(() => writeJSON(LS_WEEKLY, weeklyAverages), [weeklyAverages]);

  // Generate tip ONLY once on mount (prevents double calls)
  useEffect(() => {
    const cacheKey = `dailyTip:${localDayKey()}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      setDailyTip(cached);
      return;
    }

    // show something immediately
    const quick = pickQuickTip();
    setDailyTip(quick);

    // update in background with Gemini
    (async () => {
      setTipErr("");
      setTipLoading(true);
      try {
        const weeklyAvg =
          weeklyAverages.length
            ? +(
                weeklyAverages.reduce((s, d) => s + d.avg, 0) / weeklyAverages.length
              ).toFixed(2)
            : null;

        const lastColor = todayEntries.length ? todayEntries[todayEntries.length - 1].value : null;

        const tip = await generateDailyTip({ weeklyAvg, lastColor });
        const finalTip = tip || quick;

        setDailyTip(finalTip);
        localStorage.setItem(cacheKey, finalTip);
      } catch (e) {
        setTipErr("Tip update failed (using fallback).");
      } finally {
        setTipLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayCount = weeklyAverages.length + 1;

  const todayAvg = useMemo(() => {
    if (!todayEntries.length) return null;
    const sum = todayEntries.reduce((a, e) => a + e.value, 0);
    return +(sum / todayEntries.length).toFixed(2);
  }, [todayEntries]);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }

  function addEntry(value) {
    const entry = { value, ts: Date.now() };
    setTodayEntries((prev) => [...prev, entry]);
    setSelectedColor(value);
    showToast(`Logged color ${value} (${URINE_COLORS[value - 1].label})`);
  }

  async function endDay() {
    if (!todayEntries.length) {
      showToast("No entries today.");
      return;
    }

    const avg = todayAvg ?? 0;
    const item = { avg, ts: Date.now() };

    setWeeklyAverages((prev) => {
      const next = [...prev, item].slice(-7); // last 7 days
      return next;
    });

    setTodayEntries([]);
    setSelectedColor(null);
    showToast(`Saved today's average: ${avg}`);

    // immediate UI update (no waiting)
    const quick = pickQuickTip();
    setDailyTip(quick);

    // clear today's cache so we can store a fresh one
    const cacheKey = `dailyTip:${localDayKey()}`;
    localStorage.removeItem(cacheKey);

    // Gemini update
    try {
      setTipErr("");
      setTipLoading(true);

      const weeklyAvg =
        weeklyAverages.length
          ? +(
              weeklyAverages.reduce((s, d) => s + d.avg, 0) / weeklyAverages.length
            ).toFixed(2)
          : avg;

      const tip = await generateDailyTip({ weeklyAvg, lastColor: null });
      const finalTip = tip || quick;

      setDailyTip(finalTip);
      localStorage.setItem(cacheKey, finalTip);
    } catch (e) {
      setTipErr("Tip update failed (using fallback).");
    } finally {
      setTipLoading(false);
    }
  }

  function resetAll() {
    if (!confirm("Reset demo data (today + weekly)?")) return;
    setTodayEntries([]);
    setWeeklyAverages([]);
    setSelectedColor(null);
    localStorage.removeItem(LS_TODAY);
    localStorage.removeItem(LS_WEEKLY);

    // optional: clear tip cache for today too
    localStorage.removeItem(`dailyTip:${localDayKey()}`);
    setDailyTip("Loading tip...");
    setTipErr("");
    showToast("Reset complete.");
  }

  // Charts
  const dailyData = useMemo(() => {
    const labels = todayEntries.map((e) => formatTime(e.ts));
    const data = todayEntries.map((e) => e.value);
    return {
      labels,
      datasets: [
        {
          label: "Today (urine color)",
          data,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        },
      ],
    };
  }, [todayEntries]);

  const weeklyData = useMemo(() => {
    const labels = weeklyAverages.map((d) => formatDateShort(d.ts));
    const data = weeklyAverages.map((d) => d.avg);
    return {
      labels,
      datasets: [
        {
          label: "Daily average (last 7)",
          data,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        },
      ],
    };
  }, [weeklyAverages]);

  const commonOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { boxWidth: 12 } },
        tooltip: { enabled: true },
      },
      scales: {
        x: {
          ticks: { maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          min: 1,
          max: 8,
          ticks: { stepSize: 1 },
          title: { display: true, text: "Color (1–8)" },
        },
      },
    }),
    []
  );

  const weeklyOptions = useMemo(
    () => ({
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: {
          min: 1,
          max: 8,
          ticks: { stepSize: 1 },
          title: { display: true, text: "Daily average (1–8)" },
        },
      },
    }),
    [commonOptions]
  );

  // Simple “AI weekly summary” text (frontend-only demo)
  const aiSummary = useMemo(() => {
    if (!weeklyAverages.length) return "Log a few days to see your weekly trend.";
    const vals = weeklyAverages.map((d) => d.avg);
    const avg = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
    const last = vals[vals.length - 1];
    const trend =
      vals.length >= 2
        ? last < vals[vals.length - 2]
          ? "improving"
          : last > vals[vals.length - 2]
          ? "getting darker"
          : "stable"
        : "stable";
    let note = "Nice!";
    if (avg <= 3) note = "Hydration looks good overall.";
    else if (avg <= 5) note = "Moderate—try sipping more regularly.";
    else note = "Darker average—consider increasing fluids today.";
    return `Weekly avg: ${avg} (trend: ${trend}). ${note}`;
  }, [weeklyAverages]);

const urineInsight = useMemo(() => {
  const lastValue = todayEntries.length ? todayEntries[todayEntries.length - 1].value : null;
  if (!lastValue) return { label: "No Data", text: "Log a color to see hydration insights.", action: "Waiting for log...", color: "#666" };
  return URINE_INSIGHTS[lastValue];
}, [todayEntries]);

const weeklyReport = useMemo(() => {
    // Check if we have at least 7 days of data
    if (weeklyAverages.length < 7) {
      return {
        ready: false,
        title: "Weekly Kidney Report",
        text: `Collecting data... (${weeklyAverages.length}/7 days saved).`,
        status: "In Progress"
      };
    }

    // Calculate the average of the last 7 days
    const totalAvg = weeklyAverages.reduce((sum, day) => sum + day.avg, 0) / 7;
    
    let reportText = "";
    let statusLabel = "";
    let statusColor = "";

    if (totalAvg <= 3) {
      statusLabel = "Excellent";
      statusColor = "#4caf50";
      reportText = "Over the past week, your kidneys have maintained optimal filtration. Your hydration habits are consistent and healthy.";
    } else if (totalAvg <= 5) {
      statusLabel = "Good/Stable";
      statusColor = "#8bc34a";
      reportText = "Your weekly average shows stable kidney function, though some days were more concentrated than others. Keep aiming for consistency.";
    } else {
      statusLabel = "At Risk of Strain";
      statusColor = "#e74c3c";
      reportText = "Your kidneys have been consistently dealing with concentrated waste this week. This can increase the risk of kidney stones. Try to increase your daily water goal.";
    }

    return { ready: true, title: "7-Day Kidney Report", text: reportText, status: statusLabel, color: statusColor };
  }, [weeklyAverages]);

  return (
    <div className="wrap">
      <header className="topHeader" role="banner">
        <div className="headerInner">
          <div className="bottleIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M10 2h4v2l1 1v2H9V5l1-1V2Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M9 7h6v14a1.8 1.8 0 0 1-1.8 1.8h-2.4A1.8 1.8 0 0 1 9 21V7Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M10.2 14.2c.9.9 2.7.9 3.6 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="titleBlock">
            <h1>Am I drinking enough water?</h1>
            <p>Track hydration using a urine colour scale (1–8). Tap a color to log it.</p>
          </div>
        </div>
      </header>

      <main className="grid" role="main">
        {/* LEFT */}
        <section className="col leftCol" aria-label="Tips and summary">
          <div className="card tipCard">
            <h3>Daily tip</h3>
            <p>{dailyTip}</p>
            {tipLoading ? <p className="muted small">Updating tip…</p> : null}
            {tipErr ? <p className="muted small">{tipErr}</p> : null}
          </div>

          {/* UPDATED URINE INSIGHT BOX */}
          <div className="card tipCard">
              <h3 style={{ marginBottom: "8px" }}>
                Urine Analysis: <span style={{ color: urineInsight.color }}>{urineInsight.label}</span>
              </h3>
              <p style={{ fontSize: "0.95rem", lineHeight: "1.4" }}>{urineInsight.text}</p>
            <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "8px" }}>
              <p className="muted small" style={{ marginBottom: "4px" }}>Hydration Advice:</p>
              <strong>{urineInsight.action}</strong>
            </div>
          </div>

          {/* WEEKLY KIDNEY REPORT BOX */}
          <div className="card tipCard" style={{ marginTop: "15px" }}>
            <h3 style={{ marginBottom: "8px" }}>
              {weeklyReport.title}
            </h3>
            
            {weeklyReport.ready ? (
              <>
                <div style={{ marginBottom: "10px" }}>
                  Status: <strong style={{ color: weeklyReport.color }}>{weeklyReport.status}</strong>
                </div>
                <p style={{ fontSize: "0.95rem", lineHeight: "1.4" }}>{weeklyReport.text}</p>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <p className="muted">{weeklyReport.text}</p>
                {/* Visual Progress Bar */}
                <div style={{ width: "100%", background: "#eee", height: "8px", borderRadius: "4px", marginTop: "10px" }}>
                  <div style={{ 
                    width: `${(weeklyAverages.length / 7) * 100}%`, 
                    background: "#3498db", 
                    height: "100%", 
                    borderRadius: "4px",
                    transition: "width 0.3s ease" 
                  }}></div>
                </div>
              </div>
            )}
          </div>
          
          <div className="card bigCard">
            <div className="rowBetween">
              <h3>AI Weekly Summary</h3>
              <button className="ghostBtn" onClick={resetAll} aria-label="Reset demo data">
                Reset
              </button>
            </div>
            <p className="muted">{aiSummary}</p>

            <div className="stats">
              <div className="stat">
                <div className="statLabel">Today entries</div>
                <div className="statValue">{todayEntries.length}</div>
              </div>
              <div className="stat">
                <div className="statLabel">Today avg</div>
                <div className="statValue">{todayAvg ?? "—"}</div>
              </div>
              <div className="stat">
                <div className="statLabel">Days saved</div>
                <div className="statValue">{weeklyAverages.length}</div>
              </div>
            </div>
        
            <div className="log">
              <div className="logHeader">
                <span>Today’s log</span>
                <span className="muted small">({todayEntries.length ? "latest last" : "empty"})</span>
              </div>
              <ul className="logList" aria-label="Today entries list">
                {todayEntries.length ? (
                  [...todayEntries].slice(-8).map((e, idx) => (
                    <li key={e.ts + ":" + idx} className="logItem">
                      <span className="pill" style={{ background: URINE_COLORS[e.value - 1].hex }}>
                        {e.value}
                      </span>
                      <span className="logText">{URINE_COLORS[e.value - 1].label}</span>
                      <span className="muted small">{formatTime(e.ts)}</span>
                    </li>
                  ))
                ) : (
                  <li className="muted small">Tap a color to add your first entry.</li>
                )}
              </ul>
            </div>
          </div>
        </section>

        {/* MIDDLE */}
        <section className="col midCol" aria-label="Urine color scale">
          <div className="card scaleCard">
            <div className="scaleHeader">
              <h3>Urine color (1–8)</h3>
              <p className="muted small">Keyboard: Tab → Enter/Space to log.</p>
            </div>

            <div className="scale" role="list" aria-label="Urine color blocks">
              {URINE_COLORS.map((c) => (
                <button
                  key={c.n}
                  type="button"
                  className={`colorBlock ${selectedColor === c.n ? "selected" : ""}`}
                  style={{ background: c.hex }}
                  onClick={() => addEntry(c.n)}
                  aria-label={`Log color ${c.n}: ${c.label}`}
                >
                  <span className="blockNum">{c.n}</span>
                  <span className="blockLabel">{c.label}</span>
                </button>
              ))}
            </div>

            <div className="midBottom">
              <button
                className="primaryBtn"
                onClick={endDay}
                disabled={tipLoading}
                aria-label="End the day and save today average"
              >
                {tipLoading ? "Updating tip..." : "End the day"}
              </button>
              <div className="dayCounter" aria-label="Day counter">
                Day <strong>{dayCount}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT */}
        <section className="col rightCol" aria-label="Charts">
          <div className="card chartCard">
            <div className="rowBetween">
              <h3>Daily chart</h3>
              <span className="muted small">{todayAvg !== null ? `avg ${todayAvg}` : "no data"}</span>
            </div>
            <div className="chartBox" role="img" aria-label="Daily line chart">
              <Line data={dailyData} options={commonOptions} />
            </div>
          </div>

          <div className="card chartCard">
            <div className="rowBetween">
              <h3>Weekly chart</h3>
              <span className="muted small">last {weeklyAverages.length}/7 days</span>
            </div>
            <div className="chartBox" role="img" aria-label="Weekly line chart">
              <Line data={weeklyData} options={weeklyOptions} />
            </div>
          </div>
        </section>
      </main>

      <footer className="footerNote">
        <p>This app provides hydration guidance only and does not provide medical diagnosis.</p>
      </footer>

      {/* Toast */}
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
