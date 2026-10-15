import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { getOrderDetails } from "@/lib/orders";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const tools = [
  {
    type: "function",
    function: {
      name: "get_order_details",
      description: "Look up an Aura Skincare order by its ID (format ORD-101).",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "e.g. ORD-101" } },
        required: ["order_id"],
      },
    },
  },
];

export async function POST(req) {
  const { messages } = await req.json(); // [{role:"user"|"assistant", content}]
  const convo = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
  const toolLog = [];

  try {
    for (let i = 0; i < 3; i++) {
      const res = await client.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: convo,
        tools,
        temperature: 0.3,
        max_tokens: 600,
        reasoning_effort: "low",
      });
      const msg = res.choices[0].message;

      if (!msg.tool_calls?.length) {
                const clean = (msg.content || "")
          .replace(/[\u202F\u00A0]/g, " ")
                  .replace(/[\u2010\u2011]/g, "-")
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/[\u201C\u201D]/g, '"')
                  .replace(/\s*\n+\s*/g, " ")
          .trim();
        return Response.json({ reply: clean, toolLog });
      }

      convo.push(msg);
      for (const call of msg.tool_calls) {
        let args = {};
        let result;

        if (call.function.name !== "get_order_details") {
          result = { error: "UNKNOWN_TOOL", message: "This tool is not available." };
        } else {
          try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
          result = getOrderDetails(args.order_id);
        }

        toolLog.push({ tool: call.function.name, args, result });
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return Response.json({ reply: "Sorry, could you please repeat that?", toolLog });
  } catch (e) {
    console.error(e);
    return Response.json(
      { reply: "Sorry, I'm having trouble right now. Could you please repeat that?", toolLog },
      { status: 200 }
    );
  }
}