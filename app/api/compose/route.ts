import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-3.6-flash";

const EXTRACT_PROMPT = `You are reading a single photographed page of rough handwritten or printed points, for a newsroom tool. The page may be in Hindi (Devanagari), English, or a mix (Hinglish).

Transcribe everything on the page exactly as written — every point, note, or line. Do not translate, do not correct, do not summarize, do not add commentary. Respond with ONLY the transcribed text, nothing else.`;

async function callGemini(apiKey: string, parts: any[]): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3 },
      }),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errBody.slice(0, 300)}`);
  }
  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text came back from the model.");
  return text.trim();
}

export async function POST(req: NextRequest) {
  const rawKey = process.env.GEMINI_API_KEY;
  if (!rawKey) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY. Add it in your Vercel project settings." },
      { status: 500 }
    );
  }
  const apiKey: string = rawKey;

  const form = await req.formData();
  const files = form.getAll("file") as File[];
  const author = (form.get("author") as string) || "the author";

  if (!files.length) {
    return NextResponse.json({ error: "No pages uploaded." }, { status: 400 });
  }

  let extracted: string[];
  try {
    const CONCURRENCY = 3;
    const results: string[] = new Array(files.length);
    let cursor = 0;
    async function worker() {
      while (cursor < files.length) {
        const idx = cursor++;
        const file = files[idx];
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = file.type || "image/jpeg";
        results[idx] = await callGemini(apiKey, [
          { text: EXTRACT_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    extracted = results;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Couldn't read one of the pages. Try clearer photos." },
      { status: 502 }
    );
  }

  const combinedPoints = extracted
    .map((t, i) => `Page ${i + 1}:\n${t}`)
    .join("\n\n");

  const composePrompt = `You are a senior copy editor at Rajasthan Patrika, a Hindi newspaper. Below are rough handwritten points collected for ${author}. Turn them into a single, polished, flowing write-up in Hindi — natural, conversational, active-voice Hindi, not overly formal or heavily Sanskritized, the way it would actually run in print. Connect and smooth the points into proper paragraphs, but do not invent facts or add anything beyond what the points say. Keep it appropriately concise for the amount of material given. Do not add a title, byline, or heading — just the body text, in clean paragraphs.

Points:
${combinedPoints}

Respond with ONLY the finished Hindi write-up, no preamble, no markdown, no commentary.`;

  let composed: string;
  try {
    composed = await callGemini(apiKey, [{ text: composePrompt }]);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Couldn't compose the write-up from those points." },
      { status: 502 }
    );
  }

  const bodyParagraphs = composed.split(/\n+/).filter((l) => l.trim().length > 0);
  const stamp = new Date().toISOString().slice(0, 10);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            spacing: { after: 300 },
            children: [
              new TextRun({ text: author, bold: true, font: "Nirmala UI", size: 26 }),
            ],
          }),
          ...bodyParagraphs.map(
            (line) =>
              new Paragraph({
                spacing: { after: 200 },
                children: [new TextRun({ text: line, font: "Nirmala UI", size: 24 })],
              })
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `pravaah-${stamp}.docx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "X-Result-Filename": filename,
    },
  });
}
