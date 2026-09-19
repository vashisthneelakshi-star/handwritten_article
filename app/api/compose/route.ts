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
  const typedPoints = ((form.get("typedPoints") as string) || "").trim();
  const author = (form.get("author") as string) || "the author";

  if (!files.length && !typedPoints) {
    return NextResponse.json({ error: "No points given — type some or upload pages." }, { status: 400 });
  }

  let extracted: string[] = [];
  if (files.length) {
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
  }

  const pointSections = [
    ...(typedPoints ? [`Typed points:\n${typedPoints}`] : []),
    ...extracted.map((t, i) => `Page ${i + 1}:\n${t}`),
  ];
  const combinedPoints = pointSections.join("\n\n");

  const STYLE_GUIDE = `You are writing in the voice of Bhawnesh Jain's "Pravaah" column for Rajasthan Patrika — a sharp, critical Hindi editorial column. Match this voice exactly:

STRUCTURE: 4-6 tight paragraphs, roughly 350-600 words total. Open cold — name the actual problem or event in the first sentence, no scene-setting or throat-clearing. End with one tight closing line that delivers a final judgment, often circling back to the opening image.

EVIDENCE: Ground every claim in something concrete — specific dates, rupee/percentage figures, names, designations, past incidents or precedents. Never leave a claim vague or general; always attach a specific fact right next to it.

VOICE: Sharply critical of negligence, hypocrisy, and failure to act — aimed at whoever is actually responsible (officials, a department, a party), government and opposition alike when both are at fault. Take a clear position and hold it; do not hedge or both-sides it for its own sake.

QUESTIONS: Use direct rhetorical questions aimed at the responsible party to press accountability — e.g. "आखिर जिम्मेदार कौन?", "क्या इसकी किसी को चिंता है?", "किसे शर्म आएगी?" — sprinkled through the piece, not just at the end.

LANGUAGE: Conversational, everyday Hindi — not formal or heavily Sanskritized. Leave common English/administrative terms in English where that's how it's actually written ("इन्फ्रास्ट्रक्चर", "वीआईपी कल्चर"). Mix short punchy sentences with longer explanatory ones for rhythm. Use idioms sparingly but sharply where they land (कान पर जूं तक न रेंगना, नाक कट जाना, सांप निकल जाने के बाद लकीर पीटना — do not overuse, one or two per piece at most).

Here is one real example of this exact voice, for calibration only — do not reuse its content:

---
मदहोश विभाग

हमारा प्रशासनिक तंत्र ढीठ हो चुका है। जब तक आठ-दस लोगों की मौत न हो जाए, उसकी नींद ही नहीं खुलती। सुविधाओं के नाम पर मोटा वेतन चाहिए, पर जिम्मेदारी निभाने में शून्य। सोमवार को जयपुर जिले के चंदवाजी में खेत में करंट लगने से दो भाइयों की मौत हो गई। मनोहरपुर में दिल्ली की लाइन दुरुस्त करते समय एक ठेका कर्मचारी मारा गया। पिछले सप्ताह करौली जिले में हाईटेंशन लाइन के तार टूटने से तीन जनों की मौत हो गई। लगता है राजस्थान का ऊर्जा मंत्रालय और बिजली निगम के अफसर-इंजीनियर अफीम खाकर सोए हुए हैं। प्रदेशवासियों को कीड़े-मकोड़े समझने लगे हैं।

बिजली के नाम पर यूं तो स्वर्णिम माहौल बनाया जा रहा है। सौर ऊर्जा, बड़े-बड़े बिजलीघर, हाईटेंशन लाइनों का जाल, हाईटेक मीटर, बिलिंग की डिजीटल व्यवस्था...और भी न जाने क्या-क्या। 'इन्फ्रास्ट्रक्चर' विकास ही मानो सब कुछ हो गया है। सेवा के मामले में ठन-ठन गोपाल! वितरण कंपनियों के आलीशान एयरकंडीशंड दफ्तरों में बैठकर अफसरों-इंजीनियरों ने राजस्थान की जनता के सिर पर 88,700 करोड़ रुपए का बोझ डाल दिया, पर उपभोक्ताओं को भगवान भरोसे छोड़ दिया।

पिछले साल करंट से पिता-पुत्र की मौत के एक मामले में अदालत ने जयपुर विद्युत वितरण निगम को जिम्मेदार ठहराते हुए परिजन को करीब सवा करोड़ रुपए का मुआवजा ब्याज सहित देने का आदेश दिया था। फिर भी अफसरों को शर्म नहीं आई।

बिजली विभाग को जनता के जीवन से खेलने की अनुमति क्यों दी जा रही है? लापरवाही और अकर्मण्यता के लिए हर स्तर पर जिम्मेदारी तय करनी होगी। मंत्री और सचिव से लेकर इंजीनियरों और लाइनमैन तक। तभी जाकर नींद में सोए इस विभाग की आंखें खुलेंगी।
---`;

  const composePrompt = `${STYLE_GUIDE}

Below are rough handwritten points collected for ${author}. Write them up as one Pravaah-style piece in this exact voice. Use only what the points give you — do not invent facts, figures, or incidents beyond what's provided; if the points don't give you enough specifics to match this style fully, work with what's there rather than fabricating detail. Do not add a title, byline, or heading — just the body paragraphs.

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
