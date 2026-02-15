import React, { useEffect, useMemo, useRef, useState } from "react";
import "./urinePhotoTester.css";

/**
 * Urine color reference palette (1–8)
 * You can tweak hex values later to match your UI exactly.
 */
const URINE_PALETTE = [
  { level: 1, label: "Very pale", hex: "#FFFDF2" },
  { level: 2, label: "Pale straw", hex: "#FFF6C9" },
  { level: 3, label: "Light yellow", hex: "#FFE993" },
  { level: 4, label: "Yellow", hex: "#FFD35C" },
  { level: 5, label: "Dark yellow", hex: "#FFB93A" },
  { level: 6, label: "Amber", hex: "#F39A1F" },
  { level: 7, label: "Dark amber", hex: "#D97D12" },
  { level: 8, label: "Very dark amber", hex: "#B45E0C" },
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const bigint = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

/**
 * Simple RGB distance (fast MVP).
 * Later you can upgrade to Lab/DeltaE for better robustness.
 */
function rgbDist(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToCss({ r, g, b }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * Analyze a fixed center square region on a canvas:
 * - sample pixels
 * - drop very bright (glare) & very dark (shadow) pixels
 * - compute trimmed mean (robust-ish)
 */
function analyzeCenterRegion(canvas, regionSize = 120) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;

  const size = Math.min(regionSize, w, h);
  const x0 = Math.floor((w - size) / 2);
  const y0 = Math.floor((h - size) / 2);

  const img = ctx.getImageData(x0, y0, size, size);
  const data = img.data;

  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // brightness approximation
    const v = (r + g + b) / 3;

    // filter glare & deep shadow
    if (v > 245) continue;
    if (v < 25) continue;

    // also ignore near-white/near-gray low saturation-ish pixels a bit
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

    if (v > 220 && sat < 0.08) continue;

    pixels.push({ r, g, b, v, sat });
  }

  if (pixels.length < 50) {
    return { ok: false, reason: "Not enough usable pixels (glare/shadow/too small region)." };
  }

  // sort by brightness and trim extremes (robustness)
  pixels.sort((a, b) => a.v - b.v);
  const trim = Math.floor(pixels.length * 0.15);
  const core = pixels.slice(trim, pixels.length - trim);

  const sum = core.reduce(
    (acc, p) => {
      acc.r += p.r; acc.g += p.g; acc.b += p.b;
      acc.v += p.v; acc.sat += p.sat;
      return acc;
    },
    { r: 0, g: 0, b: 0, v: 0, sat: 0 }
  );

  const mean = {
    r: sum.r / core.length,
    g: sum.g / core.length,
    b: sum.b / core.length,
    v: sum.v / core.length,
    sat: sum.sat / core.length,
  };

  return {
    ok: true,
    region: { x: x0, y: y0, size },
    meanRgb: { r: mean.r, g: mean.g, b: mean.b },
    brightness: mean.v,
    saturation: mean.sat,
    usablePixels: pixels.length,
  };
}

function matchPalette(meanRgb) {
  const ranked = URINE_PALETTE
    .map((p) => {
      const ref = hexToRgb(p.hex);
      const d = rgbDist(meanRgb, ref);
      return { ...p, dist: d };
    })
    .sort((a, b) => a.dist - b.dist);

  const best = ranked[0];
  const second = ranked[1];

  // crude confidence: separation between best & second
  const gap = second ? second.dist - best.dist : best.dist;
  const confidence = clamp(gap / 40, 0, 1); // tuned-ish for RGB scale

  return { best, ranked, confidence };
}

export default function UrinePhotoTester() {
  const [file, setFile] = useState(null);
  const [imgUrl, setImgUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [regionSize, setRegionSize] = useState(140);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setResult(null);
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const palette = useMemo(() => URINE_PALETTE, []);

  function drawToCanvas() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Fit image into canvas while preserving aspect ratio
    const ctx = canvas.getContext("2d");
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const scale = Math.min(cw / iw, ch / ih);
    const dw = Math.floor(iw * scale);
    const dh = Math.floor(ih * scale);
    const dx = Math.floor((cw - dw) / 2);
    const dy = Math.floor((ch - dh) / 2);

    ctx.drawImage(img, dx, dy, dw, dh);

    // draw target square overlay
    const size = Math.min(regionSize, cw, ch);
    const x0 = Math.floor((cw - size) / 2);
    const y0 = Math.floor((ch - size) / 2);

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x0, y0, size, size);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("Target area", x0 + 8, y0 - 10 < 12 ? y0 + 18 : y0 - 10);
    ctx.restore();
  }

  function onImageLoad() {
    drawToCanvas();
  }

  function runAnalysis() {
    setError("");
    setResult(null);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const analysis = analyzeCenterRegion(canvas, regionSize);
    if (!analysis.ok) {
      setError(analysis.reason || "Analysis failed.");
      return;
    }

    const matched = matchPalette(analysis.meanRgb);

    setResult({
      ...analysis,
      match: matched.best,
      ranked: matched.ranked,
      confidence: matched.confidence,
    });
  }

  return (
    <div className="upt-wrap">
      <div className="upt-card">
        <h2 className="upt-title">Urine Photo Color Tester (MVP)</h2>
        <p className="upt-sub">
          Fotoğraf yükle → hedef kareyi idrarın olduğu bölgeye denk getir → Analyze.
          <br />
          (İpucu: iyi ışık, yansıma/flash parlaması olmasın.)
        </p>

        <div className="upt-controls">
          <label className="upt-btn">
            📷 Choose photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              hidden
            />
          </label>

          <button className="upt-btn secondary" onClick={runAnalysis} disabled={!imgUrl}>
            Analyze
          </button>

          <div className="upt-slider">
            <span>Target size</span>
            <input
              type="range"
              min="80"
              max="220"
              value={regionSize}
              onChange={(e) => {
                setRegionSize(Number(e.target.value));
                // redraw overlay
                setTimeout(drawToCanvas, 0);
              }}
              disabled={!imgUrl}
            />
            <span>{regionSize}px</span>
          </div>
        </div>

        <div className="upt-main">
          <div className="upt-canvasWrap">
            <canvas ref={canvasRef} width={520} height={360} className="upt-canvas" />
            {!imgUrl && <div className="upt-placeholder">Upload a photo to start</div>}

            {/* Hidden img used for drawing */}
            {imgUrl && (
              <img
                ref={imgRef}
                src={imgUrl}
                alt="uploaded"
                onLoad={onImageLoad}
                style={{ display: "none" }}
              />
            )}
          </div>

          <div className="upt-side">
            <div className="upt-panel">
              <h3>Result</h3>

              {error && <div className="upt-error">⚠️ {error}</div>}

              {!error && !result && (
                <div className="upt-muted">No result yet. Click “Analyze”.</div>
              )}

              {result && (
                <>
                  <div className="upt-row">
                    <div className="upt-swatch" style={{ background: rgbToCss(result.meanRgb) }} />
                    <div>
                      <div className="upt-big">
                        Level {result.match.level} — {result.match.label}
                      </div>
                      <div className="upt-small">
                        Confidence: {(result.confidence * 100).toFixed(0)}% · usable pixels:{" "}
                        {result.usablePixels}
                      </div>
                    </div>
                  </div>

                  <div className="upt-miniList">
                    <div className="upt-miniTitle">Top matches</div>
                    {result.ranked.slice(0, 3).map((m) => (
                      <div className="upt-miniItem" key={m.level}>
                        <span className="upt-dot" style={{ background: m.hex }} />
                        <span>
                          {m.level}. {m.label}
                        </span>
                        <span className="upt-muted">dist {m.dist.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="upt-panel">
              <h3>Palette (1–8)</h3>
              <div className="upt-palette">
                {palette.map((p) => (
                  <div className="upt-pItem" key={p.level}>
                    <span className="upt-dot" style={{ background: p.hex }} />
                    <span>
                      {p.level}. {p.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="upt-note">
              Bu MVP “tıbbi teşhis” değildir. Ama doğru ışık + doğru hedefleme ile genelde ±1 seviye
              içinde çalışır.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
