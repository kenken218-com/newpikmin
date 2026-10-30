// ==========================================
// 🎮 互動遊戲模組 (games.js) - 支援原生 Poll 投票
// ==========================================

const TAROT_CARDS = [
    { name: "愚者 (The Fool)", meaning: "新開始、冒險、純真、無限可能" },
    { name: "魔術師 (The Magician)", meaning: "創造力、技能、意志力、心想事成" },
    { name: "女祭司 (The High Priestess)", meaning: "直覺、智慧、神秘、內心聲音" },
    { name: "皇后 (The Empress)", meaning: "豐饒、母性、自然、舒適與繁榮" },
    { name: "皇帝 (The Emperor)", meaning: "權力、結構、領導力、秩序與穩定" },
    { name: "戀人 (The Lovers)", meaning: "愛情、和諧、選擇、價值觀契合" },
    { name: "戰車 (The Chariot)", meaning: "決心、勝利、前進、克服障礙" },
    { name: "力量 (Strength)", meaning: "勇氣、耐心、溫柔的控制、內在力量" },
    { name: "隱者 (The Hermit)", meaning: "內省、孤獨、尋找真理、明智導引" },
    { name: "命運之輪 (Wheel of Fortune)", meaning: "轉折點、機遇、命運、順其自然" },
    { name: "正義 (Justice)", meaning: "公平、真理、法律、因果報應" },
    { name: "吊人 (The Hanged Man)", meaning: "犧牲、換位思考、暫停、等待突破" },
    { name: "死神 (Death)", meaning: "結束與新生、重大轉變、放下過去" },
    { name: "節制 (Temperance)", meaning: "平衡、調和、耐心、適度與融合" },
    { name: "惡魔 (The Devil)", meaning: "誘惑、束縛、執著、覺察盲點" },
    { name: "高塔 (The Tower)", meaning: "突變、崩解、震撼、破除舊有框架" },
    { name: "星星 (The Star)", meaning: "希望、療癒、靈感、光明未來" },
    { name: "月亮 (The Moon)", meaning: "幻覺、不安、潛意識、隱藏的事物" },
    { name: "太陽 (The Sun)", meaning: "快樂、成功、活力、溫暖與光明" },
    { name: "審判 (Judgement)", meaning: "覺醒、審視、重生、迎來結果" },
    { name: "世界 (The World)", meaning: "圓滿、成就、旅程結束、新循環" }
];

let turtleGame = {
    active: false,
    story: "",
    answer: "",
    inactivityTimer: null
};

let nameGameSession = {
    active: false,
    step: 'voting', // 'voting' | 'a_waiting_theme' | 'b_collecting' | 'c_waiting_master' | 'playing'
    mode: null,     // 'A' | 'B' | 'C'
    activeGroupJid: null,
    hostPhone: null,
    hostName: "",
    timer: null,
    targetName: "",
    theme: "",
    bPool: [],
    secretMasterPhone: null,
    secretMasterName: ""
};

// 1. 塔羅牌占卜
async function handleTarotFortune(sock, remoteJid, senderPhone, senderName, m, db, ai, systemPrompt) {
    const randomCard = TAROT_CARDS[Math.floor(Math.random() * TAROT_CARDS.length)];
    const prompt = `使用者 ${senderName} 抽到了塔羅牌：「${randomCard.name}」（牌義：${randomCard.meaning}）。
請以《皮克敏 Bloom》管家「小呆」的身份，用道地香港廣東話，為他解讀今日運勢與今日適合種什麼花或進行什麼遊戲建議。`;

    let tarotReading = '';
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: { systemInstruction: systemPrompt }
        });
        tarotReading = response.text || `今日抽到 ${randomCard.name}，代表 ${randomCard.meaning}！加油呀！`;
    } catch (e) {
        tarotReading = `🔮 【今日塔羅運勢】\n抽到牌卡：**${randomCard.name}**\n核心牌義：${randomCard.meaning}\n\n🌱 小呆祝你有個美好的一天！`;
    }

    await sock.sendMessage(remoteJid, { text: `🔮 【${senderName} 的今日塔羅占卜】\n\n抽到牌卡：**${randomCard.name}**\n💡 牌義：${randomCard.meaning}\n\n✨ 小呆解讀：\n${tarotReading}` }, { quoted: m });
}

// 2. 海龜湯啟動（具備防重複發起檢查）
async function startTurtleGame(sock, remoteJid, difficulty, m, ai, systemPrompt) {
    if (turtleGame.active) {
        await sock.sendMessage(remoteJid, { text: `⚠️ 目前已經有一局海龜湯正在進行中囉！請先猜出答案或等待結束。` }, { quoted: m });
        return;
    }

    await sock.sendMessage(remoteJid, { text: `🐢 【海龜湯】小呆正在編寫一道${difficulty === 'easy' ? '簡單' : '正常'}難度的懸疑謎題，請稍候……` }, { quoted: m });

    try {
        const prompt = `請生成一個懸疑的海龜湯情境題（${difficulty === 'easy' ? '難度簡單，線索明顯' : '難度適中，充滿反轉'}）。
格式要求嚴格回傳 JSON 格式：
{
  "story": "湯面（故事背景與詭異現象）",
  "answer": "湯底（真相與完整故事）"
}`;
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: { systemInstruction: systemPrompt, responseMimeType: "application/json" }
        });

        const data = JSON.parse(response.text);
        turtleGame.active = true;
        turtleGame.story = data.story;
        turtleGame.answer = data.answer;

        await sock.sendMessage(remoteJid, { text: `🐢 【海龜湯開局！】\n\n📌 **【湯面】**\n${turtleGame.story}\n\n💡 **遊戲規則**：大家可以在群組內向小呆發問「是/不是/無關」的問題來推理真相！` });
    } catch (e) {
        await sock.sendMessage(remoteJid, { text: `❌ 哎呀！海龜湯生成失敗，請稍後再試一次！` });
    }
}

// 3. 猜人名遊戲投票發起（改用 WhatsApp 原生 Poll）
async function startNameVote(sock, remoteJid, senderPhone, senderName, m) {
    if (nameGameSession.active) {
        await sock.sendMessage(remoteJid, { text: `⚠️ 目前已經有一場遊戲正在進行中囉！` }, { quoted: m });
        return;
    }

    nameGameSession.active = true;
    nameGameSession.step = 'voting';
    nameGameSession.activeGroupJid = remoteJid;
    nameGameSession.hostPhone = senderPhone;
    nameGameSession.hostName = senderName;
    nameGameSession.bPool = [];
    nameGameSession.secretMasterPhone = null;

    // 🌟 發送 WhatsApp 原生 Poll 投票按鈕卡片
    await sock.sendMessage(remoteJid, {
        poll: {
            name: `🎮 【猜人名 / 角色扮演】由 ${senderName} 發起！請點擊選擇玩法（30秒後自動結算）：`,
            values: [
                '【A】AI 隨機出題 (發起人指定主題)',
                '【B】群友匿名出題 (私訊小呆 !出題)',
                '【C】秘密扮演模式 (私訊小呆 !扮演)'
            ],
            selectableCount: 1
        }
    }, { quoted: m });

    // 30 秒後進入設定步驟（預設引導發起人進入 A 模式指定主題）
    nameGameSession.timer = setTimeout(async () => {
        if (!nameGameSession.active || nameGameSession.step !== 'voting') return;

        nameGameSession.mode = 'A';
        nameGameSession.step = 'a_waiting_theme';

        const mentionTarget = senderPhone ? `${senderPhone}@s.whatsapp.net` : remoteJid;

        await sock.sendMessage(remoteJid, { 
            text: `📊 【投票完成！】\n\n@${senderPhone || senderName} 是本局遊戲發起人，請在群組輸入「!主題 [你的主題]」（例如：!主題 皮克敏角色）來讓小呆出題！`, 
            mentions: [mentionTarget] 
        });
    }, 30000);
}

module.exports = {
    turtleGame,
    nameGameSession,
    handleTarotFortune,
    startTurtleGame,
    startNameVote
};