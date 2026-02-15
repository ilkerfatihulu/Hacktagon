// src/PhotoAnalyzeButton.jsx
import React, { useRef, useState } from "react";
import { analyzeUrineFile } from "./urineColorAnalysis";

export default function PhotoAnalyzeButton({ onDetectedLevel }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const openPicker = () => inputRef.current?.click();

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // aynı fotoğrafı tekrar seçebilsin
    if (!file) return;

    setLoading(true);
    try {
      const res = await analyzeUrineFile(file, 140);

      if (!res.ok) {
        alert(res.reason || "Analysis failed.");
        return;
      }

      const ok = confirm(
        `Tahmin: Level ${res.level} (${res.label})\nConfidence: ${(res.confidence * 100).toFixed(0)}%\n\n Use this result?`
      );
      if (ok) onDetectedLevel(res.level);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={openPicker} disabled={loading}>
        {loading ? "Analyzing..." : "📸 Photo analyze"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPick}
      />
    </>
  );
}
