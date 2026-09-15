"use client";

import { useCallback, useRef, useState } from "react";

type Stage = "idle" | "ready" | "loading" | "done" | "error";

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultKind, setResultKind] = useState<"text" | "table" | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStage("ready");
    setErrorMsg("");
    setDownloadUrl(null);
    setResultKind(null);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const convert = async () => {
    if (!file) return;
    setStage("loading");
    setErrorMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/process", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Conversion failed. Try a clearer photo.");
      }
      const kind = res.headers.get("X-Result-Kind") as "text" | "table";
      const nameHeader = res.headers.get("X-Result-Filename") || "converted";
      const blob = await res.blob();
      setDownloadUrl(URL.createObjectURL(blob));
      setDownloadName(nameHeader);
      setResultKind(kind);
      setStage("done");
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong.");
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setStage("idle");
    setDownloadUrl(null);
    setResultKind(null);
    setErrorMsg("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <main className="shell">
      <div className="masthead">
        <div>
          <h1>Likhavat</h1>
          <p>
            Upload a handwritten page or a screenshot of a spreadsheet — in Hindi or
            English. Get back a clean Word or Excel file.
          </p>
        </div>
        <span className="copy-badge">no. 1 of 1</span>
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
          <p className="pane-label">your page</p>

          {!previewUrl ? (
            <label className={`dropzone ${dragging ? "dragging" : ""}`}>
              <h3>Drop a photo here</h3>
              <p>Or tap to choose a handwritten page or a sheet screenshot.</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
          ) : (
            <div className="dropzone" onClick={() => inputRef.current?.click()}>
              <img src={previewUrl} alt="Uploaded page" className="preview-thumb" />
              <p className="file-name">{file?.name}</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          <div className="actions">
            {stage !== "done" && (
              <button
                className="btn btn-primary"
                disabled={!file || stage === "loading"}
                onClick={convert}
              >
                {stage === "loading" ? "Reading your page…" : "Convert"}
              </button>
            )}
            {stage === "done" && (
              <button className="btn btn-primary" onClick={reset}>
                Convert another page
              </button>
            )}
          </div>
          {stage === "error" && <p className="error-note">{errorMsg}</p>}
        </section>

        <section className="pane pane--right">
          <p className="pane-label">your file</p>

          {stage === "idle" || stage === "ready" ? (
            <div className="result-slot idle">
              <div className="idle-mark" />
              <p>Your Word or Excel file will appear here once converted.</p>
            </div>
          ) : stage === "loading" ? (
            <div className="result-slot">
              <div className="spinner" />
              <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
                Reading the handwriting and checking whether it's a table…
              </p>
            </div>
          ) : stage === "done" && downloadUrl ? (
            <div className="result-slot">
              <div className="result-card">
                <p className="kind">
                  {resultKind === "table" ? "detected: spreadsheet" : "detected: written text"}
                </p>
                <h3>{resultKind === "table" ? "Excel file ready" : "Word file ready"}</h3>
                <p>
                  {resultKind === "table"
                    ? "Rows and columns were reconstructed from the screenshot."
                    : "The handwriting was transcribed as-is, in the language it was written."}
                </p>
                <a href={downloadUrl} download={downloadName} className="btn btn-download">
                  Download {downloadName}
                </a>
              </div>
            </div>
          ) : (
            <div className="result-slot idle">
              <p>Fix the page on the left and try again.</p>
            </div>
          )}
        </section>
      </div>

      <p className="footnote">
        Works best with a clear, well-lit photo. One page at a time.
      </p>
    </main>
  );
}
