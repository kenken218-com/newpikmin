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

// 3. 猜人名遊戲投票發起（純文字選單：穩定安全，防風控）
async function startNameVote(sock, remoteJid, senderPhone, senderName, m) {
    if (nameGameSession.active) {
        await sock.sendMessage(remoteJid, { text: `⚠️ 目前已經有一場遊戲正在進行中囉！` }, { quoted: m });
        return;
    }

    // 初始化遊戲狀態
    nameGameSession.active = true;
    nameGameSession.step = 'voting';
    nameGameSession.activeGroupJid = remoteJid;
    nameGameSession.hostPhone = senderPhone;
    nameGameSession.hostName = senderName;
    nameGameSession.votes = { A: 0, B: 0, C: 0 };
    nameGameSession.voters = {};
    nameGameSession.bPool = [];
    nameGameSession.secretMasterPhone = null;

    // 🌟 發送純文字投票邀請
    const voteText = `🎮 【猜人名 / 角色扮演遊戲】投票開始！\n\n` +
                     `由 ${senderName} 發起！請各位皮友在 30 秒內回覆代號選擇本局玩法：\n` +
                     `【A】AI 隨機出題（發起人指定主題）\n` +
                     `【B】群友匿名出題（私訊小呆 !出題 題目）\n` +
                     `【C】秘密扮演模式（私訊小呆 !扮演 角色名稱）\n\n` +
                     `💬 請直接在群組回覆：A、B 或 C！`;

    await sock.sendMessage(remoteJid, { text: voteText }, { quoted: m });

    // 🕒 30 秒投票計時器與自動結算
    nameGameSession.timer = setTimeout(async () => {
        if (!nameGameSession.active || nameGameSession.step !== 'voting') return;

        const votes = nameGameSession.votes;
        const maxVotes = Math.max(votes.A, votes.B, votes.C);
        let winningMode = 'A';
        if (maxVotes === votes.B && votes.B > votes.A) winningMode = 'B';
        if (maxVotes === votes.C && votes.C > votes.B && votes.C > votes.A) winningMode = 'C';

        nameGameSession.mode = winningMode;

        const mentionTarget = senderPhone ? `${senderPhone}@s.whatsapp.net` : remoteJid;

        if (winningMode === 'A') {
            nameGameSession.step = 'a_waiting_theme';
            await sock.sendMessage(remoteJid, { 
                text: `📊 【投票結算】最高票：【A 模式】\n\n@${senderPhone || senderName} 是本局發起人，請在群組輸入「!主題 [你的主題]」（例如：!主題 動漫角色）來讓小呆出題！`, 
                mentions: [mentionTarget] 
            });
        } else if (winningMode === 'B') {
            nameGameSession.step = 'b_collecting';
            await sock.sendMessage(remoteJid, { 
                text: `📊 【投票結算】最高票：【B 模式 (群友匿名出題)】\n\n請各位玩家**私訊小呆**輸入「!出題 [你想出的名字/角色]」，1分鐘後將從題庫隨機抽取！` 
            });
        } else {
            nameGameSession.step = 'c_waiting_master';
            await sock.sendMessage(remoteJid, { 
                text: `📊 【投票結算】最高票：【C 模式 (秘密扮演模式)】\n\n請隨便一位玩家**私訊小呆**輸入「!扮演 [你要扮演的角色]」來成為本局主持人！` 
            });
        }
    }, 30000);
}

module.exports = {
    turtleGame,
    nameGameSession,
    handleTarotFortune,
    startTurtleGame,
    startNameVote
};
