// src/urineColorAnalysis.js

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
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }
  
  function rgbDist(a, b) {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  
  function matchPalette(meanRgb) {
    const ranked = URINE_PALETTE
      .map((p) => ({ ...p, dist: rgbDist(meanRgb, hexToRgb(p.hex)) }))
      .sort((a, b) => a.dist - b.dist);
  
    const best = ranked[0];
    const second = ranked[1];
    const gap = second ? second.dist - best.dist : best.dist;
    const confidence = clamp(gap / 40, 0, 1);
  
    return { best, ranked, confidence };
  }
  
  function analyzeCenterRegion(ctx, canvasW, canvasH, regionSize = 140) {
    const size = Math.min(regionSize, canvasW, canvasH);
    const x0 = Math.floor((canvasW - size) / 2);
    const y0 = Math.floor((canvasH - size) / 2);
  
    const img = ctx.getImageData(x0, y0, size, size);
    const data = img.data;
  
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const v = (r + g + b) / 3;
  
      if (v > 245) continue; // glare
      if (v < 25) continue;  // shadow
  
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
  
      if (v > 220 && sat < 0.08) continue;
  
      pixels.push({ r, g, b, v });
    }
  
    if (pixels.length < 50) return null;
  
    pixels.sort((a, b) => a.v - b.v);
    const trim = Math.floor(pixels.length * 0.15);
    const core = pixels.slice(trim, pixels.length - trim);
  
    const sum = core.reduce((acc, p) => {
      acc.r += p.r; acc.g += p.g; acc.b += p.b;
      return acc;
    }, { r: 0, g: 0, b: 0 });
  
    return {
      meanRgb: { r: sum.r / core.length, g: sum.g / core.length, b: sum.b / core.length },
      usablePixels: pixels.length,
      region: { x: x0, y: y0, size }
    };
  }
  
  /**
   * Main API: file -> analysis result
   */
  export async function analyzeUrineFile(file, regionSize = 140) {
    const img = new Image();
    const url = URL.createObjectURL(file);
  
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
  
      // Draw to offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = 520;
      canvas.height = 360;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
  
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const scale = Math.min(canvas.width / iw, canvas.height / ih);
      const dw = Math.floor(iw * scale);
      const dh = Math.floor(ih * scale);
      const dx = Math.floor((canvas.width - dw) / 2);
      const dy = Math.floor((canvas.height - dh) / 2);
  
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, dx, dy, dw, dh);
  
      const a = analyzeCenterRegion(ctx, canvas.width, canvas.height, regionSize);
      if (!a) {
        return { ok: false, reason: "Not enough usable pixels (glare/shadow). Try better light." };
      }
  
      const m = matchPalette(a.meanRgb);
      return {
        ok: true,
        level: m.best.level,
        label: m.best.label,
        confidence: m.confidence,
        usablePixels: a.usablePixels,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  