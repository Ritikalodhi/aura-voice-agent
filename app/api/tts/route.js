export async function POST(req) {
  const { text } = await req.json();

  if (!process.env.SARVAM_API_KEY || !text?.trim()) {
    return new Response("TTS unavailable", { status: 503 });
  }

  try {
    const r = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": process.env.SARVAM_API_KEY,
      },
      body: JSON.stringify({
        text: text.slice(0, 500),
        target_language_code: process.env.SARVAM_LANG || "en-IN",
        speaker: process.env.SARVAM_SPEAKER || "priya",
        model: "bulbul:v3",
        pace: 1.05,
      }),
    });

    if (!r.ok) {
      console.error("Sarvam TTS error", r.status, await r.text());
      return new Response("TTS failed", { status: 502 });
    }

    const data = await r.json();
    const audio = Buffer.from(data.audios?.[0] || "", "base64");
    return new Response(audio, { headers: { "Content-Type": "audio/wav" } });
  } catch (e) {
    console.error(e);
    return new Response("TTS failed", { status: 502 });
  }
}