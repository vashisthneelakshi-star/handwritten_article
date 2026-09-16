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

let nextId = 0;

export default function Home() {
  const [pages, setPages] = useState<Page[]>([]);
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(false);
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

  const clearAll = () => {
    setPages([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const doneCount = pages.filter((p) => p.status === "done").length;
  const hasConvertible = pages.some((p) => p.status === "ready" || p.status === "error");

  return (
    <main className="shell">
      <div className="masthead">
        <div>
          <h1>Likhavat</h1>
          <p>
            Upload handwritten pages or spreadsheet screenshots — Hindi, English, or
            mixed. Each page comes back as its own Word or Excel file.
          </p>
        </div>
        <span className="copy-badge">
          {pages.length ? `${pages.length} page${pages.length > 1 ? "s" : ""}` : "no pages yet"}
        </span>
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
          <p className="pane-label">your pages</p>

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
            <h3>{pages.length ? "Add another page" : "Drop pages here"}</h3>
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
              disabled={!hasConvertible || converting}
              onClick={convertAll}
            >
              {converting
                ? "Reading your pages…"
                : doneCount > 0
                ? `Convert remaining (${pages.filter((p) => p.status === "ready" || p.status === "error").length})`
                : `Convert ${pages.length > 1 ? `all ${pages.length} pages` : "page"}`}
            </button>
            {pages.length > 0 && !converting && (
              <button className="btn btn-ghost" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>
        </section>

        <section className="pane pane--right">
          <p className="pane-label">your files</p>

          {pages.length === 0 ? (
            <div className="result-slot idle">
              <div className="idle-mark" />
              <p>Converted Word and Excel files will appear here, numbered to match your pages.</p>
            </div>
          ) : (
            <>
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
