import React, { useEffect, useMemo, useRef, useState } from "react";
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

const TIPS = [
  "Drink a glass of water after waking up.",
  "Keep a bottle near your desk as a visual reminder.",
  "If you’re active today, aim for extra fluids.",
  "Sip regularly—don’t wait until you feel thirsty.",
  "Pair water with meals to build a habit.",
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

export default function App() {
  const [todayEntries, setTodayEntries] = useState(() => readJSON(LS_TODAY, []));
  const [weeklyAverages, setWeeklyAverages] = useState(() => readJSON(LS_WEEKLY, []));
  const [selectedColor, setSelectedColor] = useState(null);
  const [toast, setToast] = useState("");

  const toastTimer = useRef(null);

  useEffect(() => writeJSON(LS_TODAY, todayEntries), [todayEntries]);
  useEffect(() => writeJSON(LS_WEEKLY, weeklyAverages), [weeklyAverages]);

  const dayCount = weeklyAverages.length + 1;

  const todayAvg = useMemo(() => {
    if (!todayEntries.length) return null;
    const sum = todayEntries.reduce((a, e) => a + e.value, 0);
    return +(sum / todayEntries.length).toFixed(2);
  }, [todayEntries]);

  const tipOfTheDay = useMemo(() => {
    const idx = (new Date().getDate() + new Date().getMonth()) % TIPS.length;
    return TIPS[idx];
  }, []);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }

  function addEntry(value) {
    const entry = { value, ts: Date.now() };
    setTodayEntries((prev) => [...prev, entry]);
    setSelectedColor(value);

    // micro “interaction” feedback
    showToast(`Logged color ${value} (${URINE_COLORS[value - 1].label})`);
  }

  function endDay() {
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
  }

  function resetAll() {
    if (!confirm("Reset demo data (today + weekly)?")) return;
    setTodayEntries([]);
    setWeeklyAverages([]);
    setSelectedColor(null);
    localStorage.removeItem(LS_TODAY);
    localStorage.removeItem(LS_WEEKLY);
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
            <p>{tipOfTheDay}</p>
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
              <button className="primaryBtn" onClick={endDay} aria-label="End the day and save today average">
                End the day
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
        <p>
          This app provides hydration guidance only and does not provide medical diagnosis.
        </p>
      </footer>

      {/* Toast */}
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
