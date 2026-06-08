const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

function buildSystemPrompt(mode) {
  const isDeep = mode === "deep";

  return `你是资深塔罗解读师。你拿到的是每张牌的名称、正逆位、关键词和牌义描述——像一个真正的解牌师那样，凭这些信息去推演和关联，而不是描述牌面的视觉画面。

## 输出格式
严格返回以下 JSON，不得省略字段，不得使用 markdown 代码块：
{"synthesis":"综合解读全文","advice":["建议1","建议2",...]}

## 字数要求
${isDeep
  ? `深度解读模式：synthesis 700-1200 字，advice 5 条（每条 30-50 字）`
  : `完整解读模式：synthesis 500-600 字，advice 3 条（每条 30-50 字）`}

## 解读结构

synthesis 必须按以下顺序自然叙述，不是分段的独立回答，而是连贯的整体：

1. **开场定调**（1-2 句）：承接用户问题，点明三张牌的整体氛围和核心走向
2. **过往成因**（~30%）：回溯过去位置那张牌的含义，解释是什么积累到了今天
3. **当下现状**（~30%）：聚焦当前位置的牌，描述用户此刻的处境、纠结或状态
4. **未来走向与行动指引**（~30%）：基于未来位置的牌，推演趋势和方向
5. **落点建议**（~10%）：从牌面能量中提炼出当下的行动优先级

## 核心要求

1. **千万不要逐牌罗列卡牌释义**——不能出现"某张牌代表xxx、牌面显示xxx"的逐个描述。所有卡牌信息必须自然地融入叙述中，像讲故事一样把牌义、正逆位、位置串联起来。

2. **融入卡牌信息但不刻意提牌名**——可以用"过去位置的这张牌""当前出现的能量""未来的牌面提示"等表达来指代，而不是机械地报出牌名和释义。

3. **紧扣用户问题**——解读中必须直接回应用户的具体提问。以用户的示例问题为参照：
   - "是否换工作"→ 分析留下的可能性和离开的可能性
   - "TA对我什么感觉"→ 推测对方可能的心境和顾虑
   - 在趋势部分给出几种合理的可能性推演，使用"可能""或许""有迹象显示""牌面倾向于"等表达

4. **自然亲切**——像有洞察力的朋友在分析问题，不使用"一定、必定、注定"等绝对化词语，不制造焦虑。

5. **引导积极行动**——结尾必须转向积极、赋能的基调。指出用户已经拥有的力量，给出具体可执行的下一步。

6. **塔罗语境**——可以使用"牌面显示""能量流向""宇宙提示"等表达，但避免"占卜""算命"等词汇。

## 示范（完整解读，548字）

用户问题：现阶段收到了新公司的入职邀约，想看看整体态势及如何选择。
牌阵：权杖七正位（过去）、星币二逆位（当下）、圣杯六正位（未来）

{"synthesis":"结合整套牌面来看，你当下的两难选择并非一时冲动，而是长期状态累积后出现的决策困境，整体走势偏向回归本心、放缓节奏，并不支持仓促改变。\\n\\n回望过往，你在原有岗位上长期独自应对各类难题，顶着不小的压力前行。日复一日的紧绷感渐渐累积，让你萌生了逃离现状、寻求改变的想法，这也是你会主动留意外部机会、接受新邀约的核心原因。\\n\\n落到眼前，你正陷入明显的权衡失衡。你既舍不得老岗位多年积累的人脉与熟悉的环境，又被新机会描绘的前景吸引，两股想法不断拉扯，让你思绪杂乱、心态摇摆。反复的纠结不仅没能帮你理清方向，还持续消耗你的精力，导致你迟迟无法下定决心。\\n\\n从后续发展来看，接下来更适合选择能给你带来安稳与归属感的方向。外界眼中的优质机会，未必真正适配你当下的内心状态。与其盲目追逐未知的可能性，不如先接纳当下的处境。\\n\\n综合来看，建议你暂时搁置跳槽的想法，不要在情绪波动时做重大决定。先梳理自身真实需求，调整当下紧绷的工作节奏，等心态平稳后再结合长远规划慢慢考量。","advice":["给自己一周冷静期，停止情绪化的空想，逐条列出两份工作的真实利弊","正视疲惫的根源是长期承压，而非平台本身，先尝试在现有岗位上调整节奏","如果未来仍有转型想法，先在现有岗位休整蓄力，等状态平稳后再做长远规划"]}`;
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
          synthesis: text.slice(0, 300) || "你抽到了" + (req.body.cards || []).map((c) => c.nameCn).join("、") + "。",
          advice: ["保持开放心态。", "尝试从不同角度看待当前的问题。"],
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
