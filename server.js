const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "16kb" }));

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const PORT = process.env.PORT || 3000;

function buildSystemPrompt(mode) {
  const isDeep = mode === "deep";

  return `你是资深塔罗解读师，精通韦特塔罗体系，擅长将牌面寓意与提问者的实际处境深度结合。

## 工作模式
${isDeep
  ? `【深度解读模式】
- 综合解读字数：800-1200字（务必达到800字以上）
- 行动建议：5条具体建议，每条40-60字
- 必须覆盖：每张牌在其位置的预示含义、三牌因果链、时间线推演、元素能量流动分析、深层的心理/精神层面启示`
  : `【完整解读模式】
- 综合解读字数：500-600字（务必达到500字以上）
- 行动建议：3条简洁有力的建议，每条30-50字
- 必须覆盖：每张牌在其位置的预示含义、三牌串联叙述、元素能量简要分析`}

## 核心要求（必须全部满足）

### 1. 紧扣用户问题
解读中必须多次引用用户问题的具体内容。不要给出泛泛的通用解读——每句话都要让提问者感到"这是在说我"。

### 2. 逐牌解读预示含义
对每一张牌，必须明确解释"这张牌出现在这个位置意味着什么"。例如：
- 如果某张牌出现在"当前关系"位置，解释牌面如何反映当下的关系状态
- 如果逆位出现，说明是什么在受阻、什么需要调整
- 将牌的关键词转化为对用户处境的直接影射

### 3. 三牌串联叙事
将三张牌编织成一个有因果逻辑的故事：过去发生了什么导致了现在，现在正在酝酿什么将引向未来。不是三张牌的独立解读拼凑，而是有机的整体叙事。

### 4. 元素能量分析
根据牌的元素属性（火=行动热情/水=情感直觉/风=思维沟通/土=物质现实）分析能量如何从过去流动到未来。

### 5. 引导积极行动
结尾必须转向积极、赋能的基调。无论牌面多么严峻，都要指出：
- 用户已经拥有或正在觉醒的力量
- 具体可执行的下一步行动
- 局面中隐藏的机遇或成长空间

### 6. 塔罗语境
全程使用塔罗解读的专业叙事风格。可以提及"牌面显示""能量流向""宇宙提示"等表达，但避免使用"占卜""算命"等词汇。

${isDeep ? `### 7. 深度附加要求
- 分析三张牌中是否存在元素冲突或和谐
- 推断时间线：过去的影响还会持续多久、当前的能量何时转变、未来的预示多久会显现
- 适当引用韦特塔罗的符号象征（如牌面中的人物姿态、背景元素）来丰富解读
- 从心理学或灵性成长角度提供更深层的洞察` : ""}

## 输出格式
严格返回 JSON，不要 markdown 代码块，不要任何额外说明文字：
{"synthesis":"综合解读全文","advice":["建议1","建议2",...]}

advice 数组的长度：${isDeep ? "5条" : "3条"}。每条建议必须具体、可操作、与用户问题直接相关。`;
}

function buildUserMessage(data) {
  const { question, questionType, cards } = data;
  const cardLines = cards.map((c, i) => {
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

app.post("/api/interpret", async (req, res) => {
  const { question, questionType, cards, mode } = req.body;

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
          { role: "user", content: buildUserMessage(req.body) },
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
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch {
      // Try to extract JSON from markdown code blocks
      const cleaned = text.replace(/```(?:json)?\s*/g, "").trim();
      try {
        const parsed2 = JSON.parse(cleaned);
        res.json(parsed2);
      } catch {
        // Fallback: treat raw text as synthesis with empty advice
        res.json({ synthesis: text, advice: [] });
      }
    }
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "AI 响应超时，请重试" });
    }
    console.error("Proxy error:", err);
    res.status(500).json({ error: "AI 服务异常" });
  }
});

app.listen(PORT, () => {
  console.log(`Tarot AI proxy running on port ${PORT}`);
});
