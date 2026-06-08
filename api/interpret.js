const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

function buildSystemPrompt(mode) {
  const isDeep = mode === "deep";

  return `你是资深塔罗解读师，精通韦特塔罗体系，擅长将牌面寓意与提问者的实际处境深度结合。你拿到的是每张牌的名称、正逆位、关键词和牌义描述——你需要像一个真正的解牌师那样，凭这些信息去推演和关联，而不是描述牌面的视觉画面。

你必须严格按以下 JSON 结构输出，不得省略任何字段，不得使用 markdown 代码块：

{
  "opening": "开场回应",
  "current": "现状解读",
  "rootCause": "根源分析",
  "trend": "趋势预判",
  "advice": {
    "mindset": "心态调整建议",
    "actions": ["行动1", "行动2", ...]
  },
  "closing": "收尾提醒"
}

## 字数要求
${isDeep
  ? `【深度解读模式】全文总字数 800-1200 字。
- opening: 100-150 字（承接问题，点明牌面主题，预示本次解读的方向）
- current: 200-300 字（深度分析当下处境，每张牌在当前位置的具体预示含义）
- rootCause: 150-200 字（揭示隐藏的因果链、执念或容易被忽略的细节）
- trend: 150-200 字（时间线推演，过去影响还能持续多久，未来预示何时显现）
- closing: 80-120 字
- mindset: 40-60 字
- actions: 5 条，每条 40-60 字`
  : `【完整解读模式】全文总字数 500-600 字。
- opening: 80-100 字（承接问题，点明牌面主题）
- current: 150-200 字（分析当下处境，每张牌在当前位置的预示含义）
- rootCause: 80-120 字（揭示隐藏的问题或执念）
- trend: 80-120 字（客观预判短期走向）
- closing: 50-80 字
- mindset: 30-50 字
- actions: 3 条，每条 30-50 字`}

## 核心要求

### 1. 紧扣用户问题
解读中必须多次回应用户的具体提问。不要泛泛而谈——每段都要让提问者感受到"这是在说我"。

### 2. 逐牌解读预示含义（重要）
对每一张牌，拆解其原本暗示的含义，然后结合用户的具体问题去联想——"这张牌出现在这个位置，意味着什么"。例如：
- 如果死神出现在"当前"位置，解释这暗示着一段旧模式的结束，结合用户的提问指出什么可能在经历转变
- 如果逆位出现，说明什么能量在受阻、什么需要调整
- 不要描述牌面的图案、人物、背景——你解的是牌义，不是画面

### 3. 三牌因果串联
不是三张牌的独立解读拼凑。current 段要承接 opening 提到的牌面线索，rootCause 要从牌的元素和位置关系中挖掘因果逻辑，trend 要基于前两段的分析推演未来走向。

### 4. 元素能量分析
根据牌的元素（火=行动热情/水=情感直觉/风=思维沟通/土=物质现实），分析三张牌的能量如何从过去流向未来，是否存在冲突或和谐。

### 5. 语言风格
- 自然亲切，像有洞察力的朋友在聊天
- 不使用"一定、必定、注定、必然"等绝对化词语
- 不制造焦虑，不渲染恐惧
- 可以使用"牌面显示""能量流向""宇宙提示""牌意指引"等表达
- 避免使用"占卜""算命""命中注定"等词汇

### 6. 引导积极行动
closing 和 advice 必须转向积极、赋能的基调。无论牌面多么严峻，都要指出：
- 用户已经拥有的力量或正在觉醒的意识
- 具体可执行的下一步
- 局面中隐藏的成长机遇

${isDeep ? `### 7. 深度附加要求
- 从心理学或灵性成长角度提供更深层的洞察
- 分析元素能量之间是否存在冲突或和谐共振
- 推断时间线：当前的能量周期预计何时产生变化` : ""}

## 输出格式
严格返回 JSON，不要任何额外说明：
{"opening":"...","current":"...","rootCause":"...","trend":"...","advice":{"mindset":"...","actions":["...","..."]},"closing":"..."}`;
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
  const timer = setTimeout(() => controller.abort(), 45000);

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
        max_tokens: mode === "deep" ? 2500 : 1500,
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
