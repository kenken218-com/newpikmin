// ==========================================
// 🎮 互動遊戲模組 (games.js) - 78張完整塔羅牌版
// ==========================================

const TAROT_CARDS = [
    // === 大阿爾克那 (Major Arcana: 0 ~ 21) ===
    { id: 1, name: "0. 愚者 (The Fool)", meaning: "新開始、冒險、純真、無限可能" },
    { id: 2, name: "1. 魔術師 (The Magician)", meaning: "創造力、技能、意志力、心想事成" },
    { id: 3, name: "2. 女祭司 (The High Priestess)", meaning: "直覺、智慧、神秘、內心聲音" },
    { id: 4, name: "3. 皇后 (The Empress)", meaning: "豐饒、母性、自然、舒適與繁榮" },
    { id: 5, name: "4. 皇帝 (The Emperor)", meaning: "權力、結構、領導力、秩序與穩定" },
    { id: 6, name: "5. 教皇 (The Hierophant)", meaning: "傳統、信仰、指導、心靈學習" },
    { id: 7, name: "6. 戀人 (The Lovers)", meaning: "愛情、和諧、選擇、價值觀契合" },
    { id: 8, name: "7. 戰車 (The Chariot)", meaning: "決心、勝利、前進、克服障礙" },
    { id: 9, name: "8. 力量 (Strength)", meaning: "勇氣、耐心、溫柔的控制、內在力量" },
    { id: 10, name: "9. 隱者 (The Hermit)", meaning: "內省、孤獨、尋找真理、明智導引" },
    { id: 11, name: "10. 命運之輪 (Wheel of Fortune)", meaning: "轉折點、機遇、命運、順其自然" },
    { id: 12, name: "11. 正義 (Justice)", meaning: "公平、真理、法律、因果報應" },
    { id: 13, name: "12. 吊人 (The Hanged Man)", meaning: "犧牲、換位思考、暫停、等待突破" },
    { id: 14, name: "13. 死神 (Death)", meaning: "結束與新生、重大轉變、放下過去" },
    { id: 15, name: "14. 節制 (Temperance)", meaning: "平衡、調和、耐心、適度與融合" },
    { id: 16, name: "15. 惡魔 (The Devil)", meaning: "誘惑、束縛、執著、覺察盲點" },
    { id: 17, name: "16. 高塔 (The Tower)", meaning: "突變、崩解、震撼、破除舊有框架" },
    { id: 18, name: "17. 星星 (The Star)", meaning: "希望、療癒、靈感、光明未來" },
    { id: 19, name: "18. 月亮 (The Moon)", meaning: "幻覺、不安、潛意識、隱藏的事物" },
    { id: 20, name: "19. 太陽 (The Sun)", meaning: "快樂、成功、活力、溫暖與光明" },
    { id: 21, name: "20. 審判 (Judgement)", meaning: "覺醒、審視、重生、迎來結果" },
    { id: 22, name: "21. 世界 (The World)", meaning: "圓滿、成就、旅程結束、新循環" },

    // === 小阿爾克那 (Minor Arcana: 權杖 Wands 23-36) ===
    { id: 23, name: "權杖 ace (Ace of Wands)", meaning: "新機會、強大動力、靈感爆發" },
    { id: 24, name: "權杖二 (Two of Wands)", meaning: "未來規劃、遠見、抉擇方向" },
    { id: 25, name: "權杖三 (Three of Wands)", meaning: "遠見實現、拓展版圖、等待收成" },
    { id: 26, name: "權杖四 (Four of Wands)", meaning: "慶祝、安居樂業、婚禮或聚會" },
    { id: 27, name: "權杖五 (Five of Wands)", meaning: "競爭、意見分歧、小衝突" },
    { id: 28, name: "權杖六 (Six of Wands)", meaning: "勝利、凱旋歸來、受到肯定" },
    { id: 29, name: "權杖七 (Seven of Wands)", meaning: "防守、捍衛立場、面對挑戰" },
    { id: 30, name: "權杖八 (Eight of Wands)", meaning: "快速進展、消息、旅行、效率" },
    { id: 31, name: "權杖九 (Nine of Wands)", meaning: "防備、堅持到底、歷經考驗" },
    { id: 32, name: "權杖十 (Ten of Wands)", meaning: "壓力過大、過勞、承擔太多責任" },
    { id: 33, name: "權杖侍者 (Page of Wands)", meaning: "充滿熱情的好消息、探索者" },
    { id: 34, name: "權杖騎士 (Knight of Wands)", meaning: "行動力強、急躁、熱血衝勁" },
    { id: 35, name: "權杖王后 (Queen of Wands)", meaning: "自信、熱情、充滿魅力的領袖" },
    { id: 36, name: "權杖國王 (King of Wands)", meaning: "遠見、領導力、開創精神" },

    // === 聖杯 Cups (37-50) ===
    { id: 37, name: "聖杯 Ace (Ace of Cups)", meaning: "情感滿溢、新戀情、心靈滿足" },
    { id: 38, name: "聖杯二 (Two of Cups)", meaning: "合作、心靈契合、人際或戀愛結盟" },
    { id: 39, name: "聖杯三 (Three of Cups)", meaning: "歡聚、友情慶祝、社交活動" },
    { id: 40, name: "聖杯四 (Four of Cups)", meaning: "冷漠、疲憊、對現狀感到厭倦" },
    { id: 41, name: "聖杯五 (Five of Cups)", meaning: "失落、悲傷、過度關注失去的事物" },
    { id: 42, name: "聖杯六 (Six of Cups)", meaning: "懷舊、童年回憶、重逢、純真" },
    { id: 43, name: "聖杯七 (Seven of Cups)", meaning: "幻想、選擇過多、不切實際的目標" },
    { id: 44, name: "聖杯八 (Eight of Cups)", meaning: "尋找更高追求、離開不適合環境" },
    { id: 45, name: "聖杯九 (Nine of Cups)", meaning: "願望實現、心滿意足、享受成果" },
    { id: 46, name: "聖杯十 (Ten of Cups)", meaning: "家庭幸福、圓滿快樂、情感歸宿" },
    { id: 47, name: "聖杯侍者 (Page of Cups)", meaning: "浪漫消息、溫和、情感表達" },
    { id: 48, name: "聖杯騎士 (Knight of Cups)", meaning: "追求浪漫、求婚、溫柔體貼的追求者" },
    { id: 49, name: "聖杯王后 (Queen of Cups)", meaning: "溫柔同理、直覺敏銳、包容體貼" },
    { id: 50, name: "聖杯國王 (King of Cups)", meaning: "情緒穩定、成熟包容、大愛與智慧" },

    // === 寶劍 Swords (51-64) ===
    { id: 51, name: "寶劍 Ace (Ace of Swords)", meaning: "理性突破、清晰思維、突破盲點" },
    { id: 52, name: "寶劍二 (Two of Swords)", meaning: "逃避抉擇、僵局、盲點保護" },
    { id: 53, name: "寶劍三 (Three of Swords)", meaning: "心碎、悲傷痛苦、言語傷害" },
    { id: 54, name: "寶劍四 (Four of Swords)", meaning: "休養生息、靜心冥想、暫停休息" },
    { id: 55, name: "寶劍五 (Five of Swords)", meaning: "爭勝心、兩敗俱傷、不光彩的勝利" },
    { id: 56, name: "寶劍六 (Six of Swords)", meaning: "度過難關、療傷止痛、離開風暴" },
    { id: 57, name: "寶劍七 (Seven of Swords)", meaning: "智取、秘密行動、心眼與防範" },
    { id: 58, name: "寶劍八 (Eight of Swords)", meaning: "自我設限、困境、動彈不得的焦慮" },
    { id: 59, name: "寶劍九 (Nine of Swords)", meaning: "焦慮、失眠、過度擔憂與精神壓力" },
    { id: 60, name: "寶劍十 (Ten of Swords)", meaning: "谷底、徹底結束、慘痛教訓" },
    { id: 61, name: "寶劍侍者 (Page of Swords)", meaning: "警惕、觀察力強、刺探消息" },
    { id: 62, name: "寶劍騎士 (Knight of Swords)", meaning: "行動迅速、言語犀利、衝動直率" },
    { id: 63, name: "寶劍王后 (Queen of Swords)", meaning: "理性獨立、洞察力敏銳、公正嚴明" },
    { id: 64, name: "寶劍國王 (King of Swords)", meaning: "權威、邏輯清晰、客觀公正的裁決" },

    // === 金幣/錢幣 Pentacles (65-78) ===
    { id: 65, name: "金幣 Ace (Ace of Pentacles)", meaning: "實質財富、新商機、物質豐盛" },
    { id: 66, name: "金幣二 (Two of Pentacles)", meaning: "生活平衡、多重任務處理、財務周轉" },
    { id: 67, name: "金幣三 (Three of Pentacles)", meaning: "團隊合作、專業技術、工作受到認可" },
    { id: 68, name: "金幣四 (Four of Pentacles)", meaning: "守財、保守、安全感、過度執著" },
    { id: 69, name: "金幣五 (Five of Pentacles)", meaning: "財務困境、孤立無援、寒酸與失落" },
    { id: 70, name: "金幣六 (Six of Pentacles)", meaning: "施與受、分享資源、慈善或財務援助" },
    { id: 71, name: "金幣七 (Seven of Pentacles)", meaning: "長期投資、耐心等待收成、審視成果" },
    { id: 72, name: "金幣八 (Eight of Pentacles)", meaning: "專注技藝、努力耕耘、匠人精神" },
    { id: 73, name: "金幣九 (Nine of Pentacles)", meaning: "財務獨立、享受豐盛果實、優雅生活" },
    { id: 74, name: "金幣十 (Ten of Pentacles)", meaning: "家族繁榮、財產傳承、長遠穩定" },
    { id: 75, name: "金幣侍者 (Page of Pentacles)", meaning: "學習理財、務實的計劃、好消息" },
    { id: 76, name: "金幣騎士 (Knight of Pentacles)", meaning: "踏實穩健、一步一腳印、可靠負責" },
    { id: 77, name: "金幣王后 (Queen of Pentacles)", meaning: "務實照顧、擅長理財、溫暖豐饒" },
    { id: 78, name: "金幣國王 (King of Pentacles)", meaning: "商業頭腦、財務穩健、富裕與成功" }
];

const tarotSessions = {};

let turtleGame = {
    active: false,
    story: "",
    answer: "",
    inactivityTimer: null
};

let nameGameSession = {
    active: false,
    step: 'voting',
    mode: null,
    activeGroupJid: null,
    hostPhone: null,
    hostName: "",
    votes: { A: 0, B: 0, C: 0 },
    voters: {},
    timer: null,
    targetName: "",
    theme: "",
    bPool: [],
    secretMasterPhone: null,
    secretMasterName: ""
};

// 1. 塔羅牌引導發起（改為 1 - 78）
async function startTarotPrompt(sock, remoteJid, voterKey, senderName, m) {
    if (tarotSessions[voterKey]) {
        clearTimeout(tarotSessions[voterKey].expireTimer);
    }

    const expireTimer = setTimeout(() => {
        delete tarotSessions[voterKey];
    }, 60000);

    tarotSessions[voterKey] = { active: true, expireTimer };

    const promptText = `🔮 【${senderName} 的 78張完整塔羅牌占卜】\n\n` +
                       `請在心中默念你的問題，然後在群組回覆一個數字 **1 至 78** 來抽取你的塔羅牌！\n\n` +
                       `⏱️ 請在 60 秒之內回覆數字喔！`;

    await sock.sendMessage(remoteJid, { text: promptText }, { quoted: m });
}

// 2. 處理 1-78 的數字選擇
async function processTarotChoice(sock, remoteJid, voterKey, senderName, cardNumber, m, ai, systemPrompt) {
    if (!tarotSessions[voterKey]) return false;

    clearTimeout(tarotSessions[voterKey].expireTimer);
    delete tarotSessions[voterKey];

    const selectedCard = TAROT_CARDS[(cardNumber - 1) % TAROT_CARDS.length];

    await sock.sendMessage(remoteJid, { react: { text: '🔮', key: m.key } });

    const prompt = `使用者 ${senderName} 抽到了 78 張塔羅牌中的第 ${cardNumber} 號：「${selectedCard.name}」（牌義：${selectedCard.meaning}）。
請以《皮克敏 Bloom》管家「小管家」的身份，用道地香港廣東話，為他解讀今日運勢與今日適合種什麼花或進行什麼遊戲建議。`;

    let tarotReading = '';
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: { systemInstruction: systemPrompt }
        });
        tarotReading = response.text || `今日你抽到 ${selectedCard.name}，代表 ${selectedCard.meaning}！加油呀！`;
    } catch (e) {
        tarotReading = `🔮 【今日塔羅運勢】\n你抽中嘅牌卡：**${selectedCard.name}**\n核心牌義：${selectedCard.meaning}\n\n🌱 小呆祝你有個美好的一天！`;
    }

    await sock.sendMessage(remoteJid, { 
        text: `🔮 【${senderName} 的塔羅解讀】\n\n🎯 你抽中了第 **${cardNumber}** 張牌：**${selectedCard.name}**\n💡 牌義：${selectedCard.meaning}\n\n✨ 小呆解讀：\n${tarotReading}` 
    }, { quoted: m });

    return true;
}

// 3. 海龜湯啟動
async function startTurtleGame(sock, remoteJid, difficulty, m, ai, systemPrompt) {
    if (turtleGame.active) {
        await sock.sendMessage(remoteJid, { text: `⚠️ 目前已經有一局海龜湯正在進行中囉！請先猜出答案或等待結束。` }, { quoted: m });
        return;
    }

    await sock.sendMessage(remoteJid, { text: `🐢 【海龜湯】小管家正在編寫一道${difficulty === 'easy' ? '簡單' : '正常'}難度的懸疑謎題，請稍候……` }, { quoted: m });

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

        await sock.sendMessage(remoteJid, { text: `🐢 【海龜湯開局！】\n\n📌 **【湯面】**\n${turtleGame.story}\n\n💡 **遊戲規則**：大家可以在群組內向小管家發問「是/不是/無關」的問題來推理真相！` });
    } catch (e) {
        await sock.sendMessage(remoteJid, { text: `❌ 哎呀！海龜湯生成失敗，請稍後再試一次！` });
    }
}

// 4. 猜人名遊戲投票發起
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
    nameGameSession.votes = { A: 0, B: 0, C: 0 };
    nameGameSession.voters = {};
    nameGameSession.bPool = [];
    nameGameSession.secretMasterPhone = null;

    const voteText = `🎮 【猜人名 / 角色扮演遊戲】投票開始！\n\n` +
                     `由 ${senderName} 發起！請各位皮友在 30 秒內回覆代號選擇本局玩法：\n` +
                     `【A】AI 隨機出題（發起人指定主題）\n` +
                     `【B】群友匿名出題（私訊小管家 !出題 題目）\n` +
                     `【C】秘密扮演模式（私訊小管家 !扮演 角色名稱）\n\n` +
                     `💬 請直接在群組回覆：A、B 或 C！`;

    await sock.sendMessage(remoteJid, { text: voteText }, { quoted: m });

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
    tarotSessions,
    turtleGame,
    nameGameSession,
    startTarotPrompt,
    processTarotChoice,
    startTurtleGame,
    startNameVote
};
