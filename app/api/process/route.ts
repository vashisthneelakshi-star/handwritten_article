import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-2.0-flash";

const PROMPT = `You are transcribing a single photographed page for a newsroom tool.

First decide what the page is:
- "table": a screenshot or photo of a spreadsheet, grid, or tabular data with clear rows and columns.
- "text": handwritten or printed running text (notes, a letter, an article, a list that is not a grid).

The page may be in Hindi (Devanagari script), English, or a mix (Hinglish). Transcribe the content exactly as written — do not translate, do not correct spelling, do not summarize.

Respond with ONLY raw JSON, no markdown fences, no commentary, matching exactly one of these shapes:

If it is a table:
{"type":"table","rows":[["cell","cell"],["cell","cell"]]}

If it is text:
{"type":"text","paragraphs":["first paragraph or line","second paragraph or line"]}

Keep the row/paragraph order exactly as it appears on the page.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY. Add it in your Vercel project settings." },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type || "image/jpeg";

  let parsed: { type: "table"; rows: string[][] } | { type: "text"; paragraphs: string[] };

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      throw new Error(`Gemini API error (${geminiRes.status}): ${errBody.slice(0, 300)}`);
    }

    const geminiJson = await geminiRes.json();
    const rawText: string | undefined =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("No text came back from the model. Try a clearer photo.");
    }

    const cleaned = rawText.trim().replace(/^```json\s*|^```\s*|```$/g, "");
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not read that page. Try a clearer photo." },
      { status: 502 }
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (parsed.type === "table") {
    const rows = parsed.rows?.length ? parsed.rows : [["No data detected"]];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const filename = `converted-${stamp}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Result-Kind": "table",
        "X-Result-Filename": filename,
      },
    });
  }

  const paragraphs = parsed.paragraphs?.length ? parsed.paragraphs : ["No text detected."];
  const doc = new Document({
    sections: [
      {
        children: paragraphs.map(
          (line) =>
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: line,
                  font: "Nirmala UI",
                  size: 24,
                }),
              ],
            })
        ),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `converted-${stamp}.docx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "X-Result-Kind": "text",
      "X-Result-Filename": filename,
    },
  });
}
