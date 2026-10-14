import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req) {
  const { messages } = await req.json();
  const transcript = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  try {
    const res = await client.chat.completions.create({
      model: "openai/gpt-oss-120b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Summarize this customer support call. Return ONLY JSON with keys:
customer_intent (ORDER_TRACKING | CANCELLATION | RETURN_REFUND | SHIPPING_INFO | PAYMENT_COD | PRODUCT_INFO | OUT_OF_SCOPE | OTHER),
order_id (string or null),
resolution_status (RESOLVED | UNRESOLVED | ESCALATION_NEEDED),
call_summary (1-2 sentences).`,
        },
        { role: "user", content: transcript || "(empty call)" },
      ],
    });
    return Response.json(JSON.parse(res.choices[0].message.content));
  } catch (e) {
    console.error(e);
    return Response.json({
      customer_intent: "OTHER",
      order_id: null,
      resolution_status: "UNRESOLVED",
      call_summary: "Summary could not be generated.",
    });
  }
}