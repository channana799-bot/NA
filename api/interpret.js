const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

function buildSystemPrompt(mode) {
  const depth =
    mode === "deep"
      ? "深度模式：每段输出更详细（200-300字），行动建议5-6条。"
      : "常规模式：每段输出适中（100-150字），行动建议3-4条。";
  return `你是资深塔罗解读师。用户带着具体问题来占卜，抽到的牌已标注正/逆位及每张牌对应的解读维度（位置名）。

你必须严格按以下 JSON 结构输出，不得省略任何字段，不得使用 markdown 代码块：

{
  "opening": "开场回应（承接问题，说明抽到的牌名和正逆位，点明本次解读将围绕什么展开）",
  "current": "现状解读（结合牌面意象，分析用户当下的实际处境、心态或外部环境，贴合其问题）",
  "rootCause": "根源分析（指出背后隐藏的问题、执念或容易被忽略的细节，呼应牌面提示）",
  "trend": "趋势预判（客观分析如果维持现状，事情短期内的走向，不制造焦虑，不用绝对化词语）",
  "advice": {
    "mindset": "心态调整建议（1-2句话）",
    "actions": ["具体行动建议1", "具体行动建议2", "..."]
  },
  "closing": "收尾提醒（温和说明塔罗仅为自我探索的参考，最终结果取决于个人选择与行动）"
}

${depth}

特别要求：
- 语言通俗自然，不使用晦涩玄学术语
- 不制造焦虑，不用"一定、必定、注定、必然"等绝对化词语
- 紧密结合每张牌的正逆位含义和所在位置维度来解读
- 解读要具体、有人情味，像朋友间的真诚交流`;
}

function buildUserMessage(data) {
  const { question, questionType, cards, positionLabels } = data;
  const labels = positionLabels || ["过去", "当前", "未来"];
  const cardLines = cards.map((c) => {
    const posLabel = labels[c.position] || `位置${c.position + 1}`;
    const direction = c.upright ? "正位" : "逆位";
    const keywords = c.upright ? c.keywordsUpright?.join("、") : c.keywordsReversed?.join("、");
    const meaning = c.upright ? c.meaningUpright : c.meaningReversed;
    return [
      `${posLabel} · ${direction} · ${c.nameCn}（${c.nameEn}）`,
      `元素：${c.element || "未知"}`,
      `关键词：${keywords || "无"}`,
      `牌义：${meaning || "无"}`,
    ].join("\n");
  });
  return `用户问题：${question}\n问题类型：${questionType}\n\n牌阵说明：共${cards.length}张牌，每个位置的解读维度如下——\n${labels.map((l, i) => `位置${i + 1}「${l}」`).join("\n")}\n\n抽到的牌：\n\n${cardLines.join("\n\n")}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question, questionType, cards, mode, positionLabels } = req.body;

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
          { role: "user", content: buildUserMessage({ ...req.body, positionLabels }) },
        ],
        temperature: 0.7,
        max_tokens: mode === "deep" ? 2000 : 1200,
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
        return res.json({
          opening: "你抽到了" + (req.body.cards || []).map((c) => c.nameCn).join("、") + "。",
          current: text.slice(0, 200),
          rootCause: "",
          trend: "",
          advice: { mindset: "保持开放心态。", actions: ["尝试从不同角度看待当前的问题。"] },
          closing: "塔罗是自我探索的工具，最终的选择权在你手中。",
        });
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
