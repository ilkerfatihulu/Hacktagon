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

  // src/PhotoAnalyzeButton.jsx
return (
  <>
    <button className="photo-upload-btn" onClick={openPicker} disabled={loading}>
      <div className="svg-wrapper-1">
        <div className="svg-wrapper">
          {/* Using a camera SVG to match your app */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <path fill="none" d="M0 0h24v24H0z"></path>
            <path fill="currentColor" d="M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm7-9h-3.17l-1.24-1.86A1 1 0 0 0 13.75 2h-3.5a1 1 0 0 0-.84.47L8.17 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-7 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"></path>
          </svg>
        </div>
      </div>
      <span>{loading ? "Analyzing..." : "Upload"}</span>
    </button>

    <input ref={inputRef} type="file" accept="image/*" hidden onChange={onPick} />
  </>
);
}
