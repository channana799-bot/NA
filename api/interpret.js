const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

function buildSystemPrompt(mode) {
  const depth =
    mode === "deep"
      ? "深度解读模式：输出约600字，提供5条具体行动建议，分析三张牌之间的因果关联和时间线。"
      : "常规解读模式：输出约300字，提供3条简洁建议。";
  return `你是资深塔罗解读师，精通韦特塔罗体系。用户带着具体问题来占卜，你已抽到三张牌（过去、当前、未来位置）。

${depth}

你必须：
1. 引用用户问题的具体内容——你的解读必须贴合用户的问题
2. 分析每张牌在对应位置的含义，结合正/逆位
3. 将三张牌串联成一个故事，揭示过去→当前→未来的因果逻辑
4. 根据牌的元素（火/水/风/土）分析能量流动
5. 给出具体可操作的行动建议，不能是空洞的鸡汤

回复格式为严格 JSON，不要 markdown 代码块：
{"synthesis":"综合解读全文（中文，故事化叙述）","advice":["建议1","建议2",...]}`;
}

function buildUserMessage(data) {
  const { question, questionType, cards } = data;
  const cardLines = cards.map((c) => {
    const pos = ["过去", "当前", "未来"][c.position] || `位置${c.position}`;
    const direction = c.upright ? "正位" : "逆位";
    const keywords = c.upright ? c.keywordsUpright?.join("、") : c.keywordsReversed?.join("、");
    const meaning = c.upright ? c.meaningUpright : c.meaningReversed;
    return [
      `${pos} · ${direction} · ${c.nameCn}（${c.nameEn}）`,
      `元素：${c.element || "未知"}`,
      `关键词：${keywords || "无"}`,
      `牌义：${meaning || "无"}`,
    ].join("\n");
  });
  return `用户问题：${question}\n问题类型：${questionType}\n\n三张牌信息：\n\n${cardLines.join("\n\n")}`;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question, questionType, cards, mode } = req.body;

  if (!question || !cards?.length) {
    return res.status(400).json({ error: "question 和 cards 为必填" });
  }
  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: "AI 服务未配置" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: buildSystemPrompt(mode || "regular") },
          { role: "user", content: buildUserMessage(req.body) },
        ],
        temperature: 0.7,
        max_tokens: mode === "deep" ? 1500 : 800,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const raw = await response.json();

    if (!response.ok) {
      console.error("DeepSeek error:", raw);
      return res.status(502).json({ error: "AI 服务暂时不可用" });
    }

    const text = raw.choices?.[0]?.message?.content;
    if (!text) {
      return res.status(502).json({ error: "AI 返回为空" });
    }

    try {
      return res.json(JSON.parse(text));
    } catch {
      const cleaned = text.replace(/```(?:json)?\s*/g, "").trim();
      try {
        return res.json(JSON.parse(cleaned));
      } catch {
        return res.json({ synthesis: text, advice: [] });
      }
    }
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "AI 响应超时，请重试" });
    }
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "AI 服务异常" });
  }
};
