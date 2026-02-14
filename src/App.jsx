import React, { useEffect, useMemo, useRef, useState } from "react";
import { generateWeeklyTip } from "./gemini";

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
const LS_DAYCOUNT = "hydration_day_count_v1";

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

const FALLBACK_TIPS = [
  "Nice work—aim for steady sipping this week.",
  "Try a simple goal: refill your bottle 2–3 times today.",
  "Keep hydration consistent—small sips every hour add up.",
  "If you’re active, add an extra glass of water after movement.",
  "Pair water with routine moments (after bathroom, before meals).",
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

/**
 * Computes last-7 average + previous-7 average + trend.
 * nextWeekly: [{avg, ts}, ...] full history
 */
function compute7DayTrend(nextWeekly) {
  const last7 = nextWeekly.slice(-7).map((d) => d.avg);
  const last7Avg =
    last7.length === 7
      ? +(last7.reduce((a, b) => a + b, 0) / 7).toFixed(2)
      : null;

  const prev7 = nextWeekly.slice(-14, -7).map((d) => d.avg);
  const prev7Avg =
    prev7.length === 7
      ? +(prev7.reduce((a, b) => a + b, 0) / 7).toFixed(2)
      : null;

  const trend =
    prev7Avg == null || last7Avg == null
      ? "stable"
      : last7Avg < prev7Avg
      ? "improving"
      : last7Avg > prev7Avg
      ? "getting darker"
      : "stable";

  return { last7Avg, prev7Avg, trend };
}

export default function App() {
  const [todayEntries, setTodayEntries] = useState(() => readJSON(LS_TODAY, []));
  const [weeklyAverages, setWeeklyAverages] = useState(() => readJSON(LS_WEEKLY, []));

  const [selectedColor, setSelectedColor] = useState(null);
  const [toast, setToast] = useState("");

  // Weekly tip (NOT daily)
  const [weeklyTip, setWeeklyTip] = useState("Log 7 days to unlock your weekly tip.");
  const [tipLoading, setTipLoading] = useState(false);
  const [tipErr, setTipErr] = useState("");

  // Infinite day counter
  const [dayCount, setDayCount] = useState(() => {
    const saved = readJSON(LS_DAYCOUNT, null);
    if (typeof saved === "number") return saved;
    // fallback: week history + 1
    const hist = readJSON(LS_WEEKLY, []);
    return (hist?.length || 0) + 1;
  });

  const toastTimer = useRef(null);

  useEffect(() => writeJSON(LS_TODAY, todayEntries), [todayEntries]);
  useEffect(() => writeJSON(LS_WEEKLY, weeklyAverages), [weeklyAverages]);
  useEffect(() => writeJSON(LS_DAYCOUNT, dayCount), [dayCount]);

  // On mount: set weekly tip message based on how many days completed
  useEffect(() => {
    const completedDays = weeklyAverages.length;

    if (completedDays < 7) {
      const remaining = 7 - completedDays;
      setWeeklyTip(`Log ${remaining} more day(s) to unlock your weekly tip.`);
      return;
    }

    if (completedDays % 7 === 0) {
      const weekIndex = Math.floor(completedDays / 7);
      const cacheKey = `weeklyTip:week${weekIndex}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        setWeeklyTip(cached);
      } else {
        setWeeklyTip("Weekly tip is ready—press End the day once to generate it.");
      }
    } else {
      const remaining = 7 - (completedDays % 7);
      setWeeklyTip(`Log ${remaining} more day(s) to unlock your weekly tip.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // full history (NO slice(-7))
    const nextWeekly = [...weeklyAverages, item];
    setWeeklyAverages(nextWeekly);

    setTodayEntries([]);
    setSelectedColor(null);

    // infinite day counter
    setDayCount((d) => d + 1);

    showToast(`Saved today's average: ${avg}`);

    // weekly tip logic: only generate when a 7-day block completes
    const completedDays = nextWeekly.length;

    if (completedDays % 7 === 0) {
      const weekIndex = Math.floor(completedDays / 7);
      const cacheKey = `weeklyTip:week${weekIndex}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        setWeeklyTip(cached);
        return;
      }

      // fallback immediately
      const quick = pickQuickTip();
      setWeeklyTip(quick);

      try {
        setTipErr("");
        setTipLoading(true);

        const { last7Avg, trend } = compute7DayTrend(nextWeekly);

        // if somehow not enough data, keep fallback
        if (last7Avg == null) {
          setWeeklyTip(quick);
          localStorage.setItem(cacheKey, quick);
          return;
        }

        const tip = await generateWeeklyTip({ last7Avg, trend });
        const finalTip = (tip && String(tip).trim()) ? String(tip).trim() : quick;

        setWeeklyTip(finalTip);
        localStorage.setItem(cacheKey, finalTip);
      } catch (e) {
        setTipErr("Weekly tip update failed (using fallback).");
      } finally {
        setTipLoading(false);
      }
    } else {
      const remaining = 7 - (completedDays % 7);
      setWeeklyTip(`Log ${remaining} more day(s) to unlock your weekly tip.`);
    }
  }

  function resetAll() {
    if (!confirm("Reset demo data (today + weekly)?")) return;

    setTodayEntries([]);
    setWeeklyAverages([]);
    setSelectedColor(null);
    setDayCount(1);

    localStorage.removeItem(LS_TODAY);
    localStorage.removeItem(LS_WEEKLY);
    localStorage.removeItem(LS_DAYCOUNT);

    setWeeklyTip("Log 7 days to unlock your weekly tip.");
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

  // Weekly chart shows LAST 7 only (but storage keeps all)
  const weeklyData = useMemo(() => {
    const last7 = weeklyAverages.slice(-7);
    const labels = last7.map((d) => formatDateShort(d.ts));
    const data = last7.map((d) => d.avg);
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
        x: { ticks: { maxRotation: 0 }, grid: { display: false } },
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

  // AI Weekly Summary: use last7 vs prev7 trend (clean)
  const aiSummary = useMemo(() => {
    if (!weeklyAverages.length) return "Log a few days to see your weekly trend.";

    const { last7Avg, trend } = compute7DayTrend(weeklyAverages);

    // if <7 days, compute simple overall avg + simple trend
    if (last7Avg == null) {
      const vals = weeklyAverages.map((d) => d.avg);
      const avg = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
      return `Weekly avg: ${avg} (trend: stable). Log more days for a 7-day trend.`;
    }

    let note = "Nice!";
    if (last7Avg <= 3) note = "Hydration looks good overall.";
    else if (last7Avg <= 5) note = "Moderate—try sipping more regularly.";
    else note = "Darker average—consider increasing fluids today.";

    return `Weekly avg: ${last7Avg} (trend: ${trend}). ${note}`;
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
            <h3>Weekly tip</h3>
            <p>{weeklyTip}</p>
            {tipLoading ? <p className="muted small">Updating tip…</p> : null}
            {tipErr ? <p className="muted small">{tipErr}</p> : null}
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
              <span className="muted small">last {Math.min(weeklyAverages.length, 7)}/7 days</span>
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
