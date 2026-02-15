import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import PhotoAnalyzeButton from "./PhotoAnalyzeButton";
import { generateWeeklyTip, runChat } from "./gemini"; 
import { Send, Paperclip, Minus } from 'lucide-react';


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

const URINE_INSIGHTS = {
  1: {
    label: "Hydrated",
    text: "Your urine is very pale, which is a sign of excellent hydration.",
    action: "Keep doing what you're doing!",
    color: "#4caf50",
  },
  2: {
    label: "Hydrated",
    text: "A pale straw color indicates you are well-hydrated.",
    action: "Maintain your current water intake.",
    color: "#4caf50",
  },
  3: {
    label: "Healthy",
    text: "This light yellow shade is considered a healthy baseline.",
    action: "Sip water throughout the day.",
    color: "#8bc34a",
  },
  4: {
    label: "Healthy",
    text: "Your body is generally hydrated, but don't forget to keep drinking.",
    action: "Have a glass of water soon.",
    color: "#8bc34a",
  },
  5: {
    label: "Concentrated",
    text: "Your urine is getting darker, meaning your body is starting to save water.",
    action: "Drink 1 full glass of water now.",
    color: "#f39c12",
  },
  6: {
    label: "Concentrated",
    text: "This amber shade suggests you are likely mildly dehydrated.",
    action: "Drink 1-2 glasses of water immediately.",
    color: "#f39c12",
  },
  7: {
    label: "Very Concentrated",
    text: "Your urine is quite dark. Your body is significantly low on fluids.",
    action: "Rehydrate with 500ml of water now.",
    color: "#e74c3c",
  },
  8: {
    label: "Severely Concentrated",
    text: "Very dark urine is a strong signal that you need fluids immediately.",
    action: "Drink water now and monitor your next entry.",
    color: "#e74c3c",
  },
};

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
  const [weeklyAverages, setWeeklyAverages] = useState(() =>
    readJSON(LS_WEEKLY, [])
  );

  const [selectedColor, setSelectedColor] = useState(null);
  const [toast, setToast] = useState("");

  const [weeklyTip, setWeeklyTip] = useState(
    "Log 7 days to unlock your weekly tip."
  );
  const [tipLoading, setTipLoading] = useState(false);
  const [tipErr, setTipErr] = useState("");

  const [dayCount, setDayCount] = useState(() => {
    const saved = readJSON(LS_DAYCOUNT, null);
    if (typeof saved === "number") return saved;
    const hist = readJSON(LS_WEEKLY, []);
    return (hist?.length || 0) + 1;
  });

  const toastTimer = useRef(null);

  // --- Chatbot State ---
  const [chatMessages, setChatMessages] = useState([
    { id: 1, text: "Hi! I'm Peki, your virtual assistant. How can I help you?", sender: 'bot', time: formatTime(Date.now()) }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMsg = { id: Date.now(), text: chatInput, sender: 'user', time: formatTime(Date.now()) };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsTyping(true);

    try {
      const response = await runChat(chatInput);
      const botMsg = { id: Date.now() + 1, text: response, sender: 'bot', time: formatTime(Date.now()) };
      setChatMessages(prev => [...prev, botMsg]);
    } catch (error) {
      const errorMsg = { id: Date.now() + 1, text: "I'm having trouble connecting. Try again?", sender: 'bot', time: formatTime(Date.now()) };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => writeJSON(LS_TODAY, todayEntries), [todayEntries]);
  useEffect(() => writeJSON(LS_WEEKLY, weeklyAverages), [weeklyAverages]);
  useEffect(() => writeJSON(LS_DAYCOUNT, dayCount), [dayCount]);

  // Weekly tip on mount
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

      if (cached) setWeeklyTip(cached);
      else setWeeklyTip("Weekly tip is ready—press End the day once to generate it.");
    } else {
      const remaining = 7 - (completedDays % 7);
      setWeeklyTip(`Log ${remaining} more day(s) to unlock your weekly tip.`);
    }
  }, []); // run once

  const todayAvg = useMemo(() => {
    if (!todayEntries.length) return null;
    const sum = todayEntries.reduce((a, e) => a + e.value, 0);
    return +(sum / todayEntries.length).toFixed(2);
  }, [todayEntries]);

  // ✅ Week counter
  const weekNumber = useMemo(() => {
    if (!weeklyAverages.length) return 1;
    return Math.floor((weeklyAverages.length - 1) / 7) + 1;
  }, [weeklyAverages]);

  // ✅ This week's progress (1..7)
  const weekProgress = useMemo(() => {
    const mod = weeklyAverages.length % 7;
    return mod === 0 && weeklyAverages.length > 0 ? 7 : mod;
  }, [weeklyAverages]);

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
    const nextWeekly = [...weeklyAverages, item];
    setWeeklyAverages(nextWeekly);

    setTodayEntries([]);
    setSelectedColor(null);
    setDayCount((d) => d + 1);

    showToast(`Saved today's average: ${avg}`);

    const completedDays = nextWeekly.length;

    // weekly tip logic
    if (completedDays % 7 === 0) {
      const weekIndex = Math.floor(completedDays / 7);
      const cacheKey = `weeklyTip:week${weekIndex}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        setWeeklyTip(cached);
        return;
      }

      const quick = pickQuickTip();
      setWeeklyTip(quick);

      try {
        setTipErr("");
        setTipLoading(true);

        const { last7Avg, trend } = compute7DayTrend(nextWeekly);

        if (last7Avg == null) {
          setWeeklyTip(quick);
          localStorage.setItem(cacheKey, quick);
          return;
        }

        const tip = await generateWeeklyTip({ last7Avg, trend });
        const finalTip = tip && String(tip).trim() ? String(tip).trim() : quick;

        setWeeklyTip(finalTip);
        localStorage.setItem(cacheKey, finalTip);
      } catch {
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

  const aiSummary = useMemo(() => {
    if (!weeklyAverages.length) return "Log a few days to see your weekly trend.";

    const { last7Avg, trend } = compute7DayTrend(weeklyAverages);

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

  const urineInsight = useMemo(() => {
    const lastValue = todayEntries.length
      ? todayEntries[todayEntries.length - 1].value
      : null;

    if (!lastValue) {
      return {
        label: "No Data",
        text: "Log a color to see hydration insights.",
        action: "Waiting for log...",
        color: "#666",
      };
    }
    return URINE_INSIGHTS[lastValue];
  }, [todayEntries]);

  // ✅ Kidney report uses LAST 7 (rolling) + includes week number
  const weeklyReport = useMemo(() => {
    if (weeklyAverages.length < 7) {
      return {
        ready: false,
        title: `7-Day Kidney Report (Week ${weekNumber})`,
        text: `Collecting data... (${weeklyAverages.length}/7 days saved).`,
        status: "In Progress",
      };
    }

    const last7 = weeklyAverages.slice(-7);
    const totalAvg = last7.reduce((sum, day) => sum + day.avg, 0) / 7;

    let reportText = "";
    let statusLabel = "";
    let statusColor = "";

    if (totalAvg <= 3) {
      statusLabel = "Excellent";
      statusColor = "#4caf50";
      reportText =
        "Over the past 7 days, your kidneys have maintained optimal filtration. Your hydration habits are consistent and healthy.";
    } else if (totalAvg <= 5) {
      statusLabel = "Good/Stable";
      statusColor = "#8bc34a";
      reportText =
        "Your last 7-day average shows stable kidney function, though some days were more concentrated than others. Keep aiming for consistency.";
    } else {
      statusLabel = "At Risk of Strain";
      statusColor = "#e74c3c";
      reportText =
        "Your kidneys have been consistently dealing with concentrated waste over the last 7 days. This can increase the risk of kidney stones. Try to increase your daily water goal.";
    }

    return {
      ready: true,
      title: `7-Day Kidney Report (Week ${weekNumber})`,
      text: reportText,
      status: statusLabel,
      color: statusColor,
    };
  }, [weeklyAverages, weekNumber]);

  return (
    <div className="wrap">
      <header className="siteHeader" role="banner">
        <div className="siteHeaderInner">
          <div className="brand">
            <img src="/KidneyGuard.png" alt="KidneyGuard Logo" className="brandLogo" />
            <div className="brandText">
              <div className="brandName kidneyGuardTitle" >KidneyGuard</div>
              <div className="brandSub">Kidney health tracking</div>
            </div>
          </div>

          <div className="tagline">Track. Care. Live.</div>
        </div>
      </header>

      <main className="grid" role="main">
        {/* LEFT */}
        <section className="col leftCol" aria-label="Tips and summary">
          <div className="card tipCard">
            <h3>Weekly tip</h3>
            <p>{weeklyTip}</p>
            {tipLoading ? <p className="muted small">Updating tip…</p> : null}
            
          </div>

          <div className="card tipCard">
            <h3 style={{ marginBottom: "8px" }}>
              Urine Analysis:{" "}
              <span style={{ color: urineInsight.color }}>{urineInsight.label}</span>
            </h3>
            <p style={{ fontSize: "0.95rem", lineHeight: "1.4" }}>{urineInsight.text}</p>
            <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "8px" }}>
              <p className="muted small" style={{ marginBottom: "4px" }}>
                Hydration Advice:
              </p>
              <strong>{urineInsight.action}</strong>
            </div>
          </div>

          <div className="card tipCard" style={{ marginTop: "15px" }}>
            <h3 style={{ marginBottom: "8px" }}>{weeklyReport.title}</h3>

            {weeklyReport.ready ? (
              <>
                <div style={{ marginBottom: "10px" }}>
                  Status:{" "}
                  <strong style={{ color: weeklyReport.color }}>{weeklyReport.status}</strong>
                </div>
                <p style={{ fontSize: "0.95rem", lineHeight: "1.4" }}>{weeklyReport.text}</p>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <p className="muted">{weeklyReport.text}</p>
                <div style={{ width: "100%", background: "#eee", height: "8px", borderRadius: "4px", marginTop: "10px" }}>
                  <div
                    style={{
                      width: `${(weeklyAverages.length / 7) * 100}%`,
                      background: "#3498db",
                      height: "100%",
                      borderRadius: "4px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          
        </section>

        {/* MIDDLE */}
        <section className="col midCol" aria-label="Urine color scale">
          {/* 1) Urine level card */}
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
              <div className="actionRow">
                <button className="primaryBtn" onClick={endDay} disabled={tipLoading}>
                  {tipLoading ? "Updating tip..." : "End the day"}
                </button>

                <PhotoAnalyzeButton onDetectedLevel={(level) => addEntry(level)} />
              </div>
            </div>
          </div>

          {/* 2) Progress card (AYRI KART) */}
          
        </section>

        {/* RIGHT */}
        <section className="col rightCol" aria-label="Charts">
          
        <div className="card bigCard">
            <div className="rowBetween">
              <h3>Weekly Summary</h3>
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
          <div className="card chartCard">
            <div className="rowBetween">
              <h3>Weekly chart</h3>
              <span className="muted small">last {Math.min(weeklyAverages.length, 7)}/7 days</span>
            </div>
            <div className="chartBox">
              <Line data={weeklyData} options={weeklyOptions} />
            </div>
          </div>
        </section>
      </main>

      {/* GET STARTED + AI (below dashboard) */}
      <section className="bottomSplit" aria-label="Get started and AI assistant">
        <div className="card getStartedCard">
          <h2 className="gsTitle">Smartly track your kidney health.</h2>
          <p className="gsIntro">
            KidneyGuard helps you log hydration with quick inputs and clear visual insights,
            powered by AI, so you can stay consistent, spot trends over time, and make
            smarter daily choices to better care for your kidneys.
          </p>

          <h3 className="gsSubTitle">Follow the steps below to get started:</h3>

          <ol className="gsList">
            <li>
              <strong>Log a Color:</strong>
              <ul>
                <li>Choose the color that matches your current hydration.</li>
              </ul>
            </li>
            <li>
              <strong>Add Multiple Entries (Optional):</strong>
              <ul>
                <li>Log more than once during the day to get a more accurate daily average.</li>
              </ul>
            </li>
            <li>
              <strong>Use Photo Detection (Optional):</strong>
              <ul>
                <li>
                  If you’re unsure about the color, try photo-based detection. It may not be
                  100% accurate, but it can help guide your choice.
                </li>
              </ul>
            </li>
            <li>
              <strong>View Insights:</strong>
              <ul>
                <li>Review your daily and weekly charts to spot patterns and trends.</li>
              </ul>
            </li>
            <li>
              <strong>Get AI Guidance:</strong>
              <ul>
                <li>
                  With the help of AI, receive simple tips and weekly summaries to improve your
                  hydration habits.
                </li>
              </ul>
            </li>
          </ol>
        </div>

        <div className="card aiCard" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '550px', overflow: 'hidden' }}>
  {/* Chat Header */}
  <div style={{ backgroundColor: '#2563eb', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ color: 'white', fontWeight: '600' }}>Virtual assistant</span>
    <Minus size={20} color="white" style={{ cursor: 'pointer' }} />
  </div>
  
  {/* Message Area */}
  <div style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#f9fafb' }}>
    {chatMessages.map((msg) => (
      <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start', marginBottom: '16px' }}>
        <div style={{ maxWidth: '85%' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              {msg.sender === 'bot' && <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>🤖</div>}
              <span style={{ fontSize: '12px', color: '#6b7280' }}>{msg.sender === 'bot' ? 'Peki' : 'You'}</span>
           </div>
           <div style={{ 
             padding: '12px', 
             borderRadius: '16px', 
             fontSize: '14px',
             backgroundColor: msg.sender === 'user' ? '#2563eb' : 'white',
             color: msg.sender === 'user' ? 'white' : '#1f2937',
             border: msg.sender === 'user' ? 'none' : '1px solid #e5e7eb',
             borderTopRightRadius: msg.sender === 'user' ? '0' : '16px',
             borderTopLeftRadius: msg.sender === 'bot' ? '0' : '16px'
           }}>
             {msg.text}
           </div>
           <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>{msg.time}</div>
        </div>
      </div>
    ))}
    {isTyping && <div style={{ fontSize: '12px', color: '#9ca3af', italic: 'true' }}>Peki is typing...</div>}
    <div ref={chatEndRef} />
  </div>

  {/* Input Area */}
  <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', backgroundColor: 'white' }}>
    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: '999px', padding: '8px 16px' }}>
      <input 
        type="text" 
        placeholder="Type a message" 
        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '14px' }}
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
      />
      <Paperclip size={18} color="#9ca3af" style={{ marginRight: '8px', cursor: 'pointer' }} />
      <button onClick={handleSendMessage} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
        <Send size={18} color="#2563eb" />
      </button>
    </div>
  </div>
</div>
      </section>

      <footer className="footerNote">
        <p>This app provides hydration guidance only and does not provide medical diagnosis.</p>
      </footer>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
