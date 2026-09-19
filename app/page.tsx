"use client";

import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";

type PageStatus = "ready" | "loading" | "done" | "error";

type Page = {
  id: string;
  file: File;
  previewUrl: string;
  status: PageStatus;
  resultKind?: "text" | "table";
  downloadUrl?: string;
  downloadName?: string;
  errorMsg?: string;
};

type ComposeResult = {
  status: "idle" | "loading" | "done" | "error";
  downloadUrl?: string;
  downloadName?: string;
  errorMsg?: string;
};

let nextId = 0;

export default function Home() {
  const [pages, setPages] = useState<Page[]>([]);
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [composeMode, setComposeMode] = useState(false);
  const [authorName, setAuthorName] = useState("Bhawnesh Jain, Rajasthan Patrika");
  const [typedPoints, setTypedPoints] = useState("");
  const [composeResult, setComposeResult] = useState<ComposeResult>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setPages((prev) => [
      ...prev,
      ...list.map((f) => ({
        id: String(nextId++),
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: "ready" as PageStatus,
      })),
    ]);
  }, []);

  const removePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const convertOne = async (page: Page): Promise<Partial<Page>> => {
    try {
      const form = new FormData();
      form.append("file", page.file);
      const res = await fetch("/api/process", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't read this page.");
      }
      const kind = res.headers.get("X-Result-Kind") as "text" | "table";
      const nameHeader = res.headers.get("X-Result-Filename") || "converted";
      const blob = await res.blob();
      return {
        status: "done",
        resultKind: kind,
        downloadUrl: URL.createObjectURL(blob),
        downloadName: nameHeader,
      };
    } catch (err: any) {
      return { status: "error", errorMsg: err.message || "Something went wrong." };
    }
  };

  const convertAll = async () => {
    const targets = pages.filter((p) => p.status === "ready" || p.status === "error");
    if (!targets.length) return;
    setConverting(true);

    setPages((prev) =>
      prev.map((p) =>
        targets.find((t) => t.id === p.id) ? { ...p, status: "loading" } : p
      )
    );

    const CONCURRENCY = 2;
    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const page = targets[cursor++];
        const patch = await convertOne(page);
        setPages((prev) =>
          prev.map((p) => (p.id === page.id ? { ...p, ...patch } : p))
        );
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setConverting(false);
  };

  const downloadAll = async () => {
    const done = pages.filter((p) => p.status === "done" && p.downloadUrl);
    if (!done.length) return;
    if (done.length === 1) {
      const a = document.createElement("a");
      a.href = done[0].downloadUrl!;
      a.download = done[0].downloadName!;
      a.click();
      return;
    }
    const zip = new JSZip();
    for (let i = 0; i < done.length; i++) {
      const blob = await fetch(done[i].downloadUrl!).then((r) => r.blob());
      zip.file(`${i + 1}-${done[i].downloadName}`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted-pages.zip";
    a.click();
  };

  const composeArticle = async () => {
    if (!pages.length && !typedPoints.trim()) return;
    setComposeResult({ status: "loading" });
    try {
      const form = new FormData();
      pages.forEach((p) => form.append("file", p.file));
      if (typedPoints.trim()) form.append("typedPoints", typedPoints.trim());
      form.append("author", authorName || "Bhawnesh Jain, Rajasthan Patrika");
      const res = await fetch("/api/compose", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't compose the write-up.");
      }
      const nameHeader = res.headers.get("X-Result-Filename") || "pravaah.docx";
      const blob = await res.blob();
      setComposeResult({
        status: "done",
        downloadUrl: URL.createObjectURL(blob),
        downloadName: nameHeader,
      });
    } catch (err: any) {
      setComposeResult({ status: "error", errorMsg: err.message || "Something went wrong." });
    }
  };

  const clearAll = () => {
    setPages([]);
    setTypedPoints("");
    setComposeResult({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const doneCount = pages.filter((p) => p.status === "done").length;
  const hasConvertible = pages.some((p) => p.status === "ready" || p.status === "error");

  return (
    <main className="shell">
      <div className="masthead">
        <div className="masthead-text">
          <span className="copy-badge">
            {pages.length ? `${pages.length} page${pages.length > 1 ? "s" : ""} in queue` : "handwriting → files"}
          </span>
          <h1>Likhavat</h1>
          <p>
            Upload handwritten pages or spreadsheet screenshots — Hindi, English, or
            mixed. Each page comes back as its own Word or Excel file.
          </p>
        </div>
        <svg className="hero-mark" viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M8 78 C 24 40, 40 100, 56 60 S 88 30, 104 66" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M8 92 C 30 76, 46 100, 64 82 S 92 62, 104 84" stroke="var(--crimson)" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.75" />
          <path d="M120 66 L 152 66" stroke="var(--ink-soft)" strokeWidth="1.6" strokeDasharray="1 6" strokeLinecap="round" />
          <path d="M144 59 L 154 66 L 144 73" stroke="var(--ink-soft)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <g transform="translate(168,34)">
            <rect x="0" y="0" width="44" height="58" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6" />
            <line x1="8" y1="16" x2="36" y2="16" stroke="var(--ink)" strokeWidth="1.4" />
            <line x1="8" y1="26" x2="36" y2="26" stroke="var(--ink)" strokeWidth="1.4" />
            <line x1="8" y1="36" x2="28" y2="36" stroke="var(--crimson)" strokeWidth="1.4" />
            <line x1="8" y1="46" x2="32" y2="46" stroke="var(--ink)" strokeWidth="1.4" />
          </g>
        </svg>
      </div>

      <div className={`pravaah-bar ${composeMode ? "pravaah-bar--open" : ""}`}>
        <div className="pravaah-row">
          <label className="pravaah-switch">
            <input
              type="checkbox"
              checked={composeMode}
              onChange={(e) => setComposeMode(e.target.checked)}
            />
            <span className="pravaah-track">
              <span className="pravaah-thumb" />
            </span>
            <span className="pravaah-label">Points se pravaah likhein</span>
          </label>
          {composeMode && (
            <input
              className="pravaah-author"
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Kiske liye likhna hai"
            />
          )}
        </div>
        {composeMode && (
          <div className="pravaah-points-wrap">
            <textarea
              className="pravaah-points"
              value={typedPoints}
              onChange={(e) => setTypedPoints(e.target.value)}
              placeholder="Apne points yahan type karein — ek line mein ek point. Chahe to neeche pages bhi upload kar sakte hain, ya dono ek saath use karein."
              rows={5}
            />
          </div>
        )}
      </div>

      <div className="spread">
        <section
          className="pane pane--left"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {pages.length > 0 && (
            <div className="page-list">
              {pages.map((p, i) => (
                <div className="page-card" key={p.id} style={{ ["--tilt" as any]: `${((i % 5) - 2) * 0.6}deg` }}>
                  <span className="page-num">{i + 1}</span>
                  <img src={p.previewUrl} alt={`Page ${i + 1}`} />
                  <button
                    type="button"
                    className="page-remove"
                    onClick={() => removePage(p.id)}
                    aria-label="Remove page"
                    disabled={p.status === "loading"}
                  >
                    ×
                  </button>
                  {p.status === "loading" && <div className="page-overlay"><div className="spinner spinner-sm" /></div>}
                  {p.status === "done" && <span className="page-tag ok">{p.resultKind === "table" ? "xlsx" : "docx"}</span>}
                  {p.status === "error" && <span className="page-tag err" title={p.errorMsg}>retry</span>}
                </div>
              ))}
            </div>
          )}

          <label className={`dropzone ${dragging ? "dragging" : ""} ${pages.length ? "dropzone-compact" : ""}`}>
            <span className={`cta-pill cta-pill--gold ${pages.length ? "cta-pill--sm" : ""}`}>
              {pages.length ? "+ Add Page" : "Upload File Here"}
            </span>
            <p>
              {pages.length
                ? "Drag more in, or tap to browse."
                : "Or tap to choose one or several photos at once."}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>

          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={
                composeMode
                  ? (!pages.length && !typedPoints.trim()) || composeResult.status === "loading"
                  : !hasConvertible || converting
              }
              onClick={composeMode ? composeArticle : convertAll}
            >
              {composeMode
                ? composeResult.status === "loading"
                  ? "Pravaah likh rahe hain…"
                  : "Pravaah Likhein"
                : converting
                ? "Reading your pages…"
                : doneCount > 0
                ? `Convert remaining (${pages.filter((p) => p.status === "ready" || p.status === "error").length})`
                : `Convert ${pages.length > 1 ? `all ${pages.length} pages` : "page"}`}
            </button>
            {(pages.length > 0 || typedPoints.trim()) && !converting && composeResult.status !== "loading" && (
              <button className="btn btn-ghost" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>
        </section>

        <section className="pane pane--right">
          {composeMode ? (
            composeResult.status === "idle" ? (
              <div className="result-slot idle">
                <span className="cta-pill cta-pill--crimson">Your File Is Here</span>
                <svg className="idle-illustration" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect x="24" y="12" width="40" height="52" fill="white" stroke="var(--line)" strokeWidth="1.6" />
                  <rect x="34" y="22" width="42" height="54" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6" />
                  <line x1="42" y1="36" x2="68" y2="36" stroke="var(--ink-soft)" strokeWidth="1.4" />
                  <line x1="42" y1="45" x2="68" y2="45" stroke="var(--ink-soft)" strokeWidth="1.4" />
                  <line x1="42" y1="54" x2="60" y2="54" stroke="var(--crimson)" strokeWidth="1.4" />
                  <line x1="42" y1="63" x2="64" y2="63" stroke="var(--ink-soft)" strokeWidth="1.4" />
                </svg>
                <p>Upload the points and press "Pravaah Likhein" — one flowing write-up comes back here.</p>
              </div>
            ) : composeResult.status === "loading" ? (
              <div className="result-slot">
                <span className="cta-pill cta-pill--crimson cta-pill--sm">Your File Is Here</span>
                <div className="spinner" />
                <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
                  Reading the points and writing it up for {authorName || "your author"}…
                </p>
              </div>
            ) : composeResult.status === "done" ? (
              <div className="result-slot">
                <div className="result-card">
                  <p className="kind">pravaah · {authorName}</p>
                  <h3>Write-up ready</h3>
                  <p>Composed from {pages.length} page{pages.length > 1 ? "s" : ""} of points.</p>
                  <a href={composeResult.downloadUrl} download={composeResult.downloadName} className="btn btn-download">
                    Download {composeResult.downloadName}
                  </a>
                </div>
              </div>
            ) : (
              <div className="result-slot idle">
                <p className="error-note">{composeResult.errorMsg}</p>
              </div>
            )
          ) : pages.length === 0 ? (
            <div className="result-slot idle">
              <span className="cta-pill cta-pill--crimson">Your File Is Here</span>
              <svg className="idle-illustration" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="24" y="12" width="40" height="52" fill="white" stroke="var(--line)" strokeWidth="1.6" />
                <rect x="34" y="22" width="42" height="54" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6" />
                <line x1="42" y1="36" x2="68" y2="36" stroke="var(--ink-soft)" strokeWidth="1.4" />
                <line x1="42" y1="45" x2="68" y2="45" stroke="var(--ink-soft)" strokeWidth="1.4" />
                <line x1="42" y1="54" x2="60" y2="54" stroke="var(--crimson)" strokeWidth="1.4" />
                <line x1="42" y1="63" x2="64" y2="63" stroke="var(--ink-soft)" strokeWidth="1.4" />
              </svg>
              <p>Converted Word and Excel files will appear here, numbered to match your pages.</p>
            </div>
          ) : (
            <>
              <span className="cta-pill cta-pill--crimson cta-pill--sm" style={{ alignSelf: "flex-start", marginBottom: 14 }}>
                Your File Is Here
              </span>
              <div className="result-list">
                {pages.map((p, i) => (
                  <div className={`result-row ${p.status}`} key={p.id}>
                    <span className="result-num">{i + 1}</span>
                    <div className="result-body">
                      {p.status === "ready" && <span className="result-status">waiting to convert</span>}
                      {p.status === "loading" && <span className="result-status">reading…</span>}
                      {p.status === "done" && (
                        <>
                          <span className="result-status ok">
                            {p.resultKind === "table" ? "Excel file ready" : "Word file ready"}
                          </span>
                          <a href={p.downloadUrl} download={p.downloadName} className="result-link">
                            {p.downloadName}
                          </a>
                        </>
                      )}
                      {p.status === "error" && (
                        <span className="result-status err">{p.errorMsg || "couldn't read this one"}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {doneCount > 0 && (
                <button className="btn btn-download" onClick={downloadAll}>
                  {doneCount > 1 ? `Download all ${doneCount} files (.zip)` : "Download file"}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      <p className="footnote">Works best with clear, well-lit photos, one page per image.</p>
    </main>
  );
}
