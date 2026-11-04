// ==========================================
// 🔮 專業級 78 張塔羅牌與多功能遊戲模組 (games.js) [全功能完整升級版]
// ==========================================
const { recordCafeMessage } = require('./aiService');
const dbService = require('./dbService');

const TAROT_CARDS = [
    // === 大阿爾克那 (0 ~ 21) ===
    { id: 0, name: "0. 愚者 (The Fool)", keywords: "新開始、冒險、純真、無限可能", revKeywords: "輕率、冒險過度、盲目、停滯" },
    { id: 1, name: "1. 魔術師 (The Magician)", keywords: "創造力、技能、意志力、心想事成", revKeywords: "欺騙、才能未發揮、缺乏計劃、意志薄弱" },
    { id: 2, name: "2. 女祭司 (The High Priestess)", keywords: "直覺、智慧、神秘、內心聲音", revKeywords: "壓抑情緒、膚淺、忽視直覺、冷漠" },
    { id: 3, name: "3. 皇后 (The Empress)", keywords: "豐饒、母性、自然、舒適與繁榮", revKeywords: "情感依賴、創造力阻塞、浪費、過度控制" },
    { id: 4, name: "4. 皇帝 (The Emperor)", keywords: "權力、結構、領導力、秩序與穩定", revKeywords: "專制、缺乏控制、僵化、權力濫用" },
    { id: 5, name: "5. 教皇 (The Hierophant)", keywords: "傳統、信仰、指導、心靈學習", revKeywords: "固執、保守過度、盲從、非傳統思考" },
    { id: 6, name: "6. 戀人 (The Lovers)", keywords: "愛情、和諧、選擇、價值觀契合", revKeywords: "不和諧、逃避抉擇、關係疏離、衝動" },
    { id: 7, name: "7. 戰車 (The Chariot)", keywords: "決心、勝利、前進、克服障礙", revKeywords: "失去方向、失控、衝動挫敗、壓力" },
    { id: 8, name: "8. 力量 (Strength)", keywords: "勇氣、耐心、溫柔的控制、內在力量", revKeywords: "自我懷疑、軟弱、情緒失控、缺乏自信" },
    { id: 9, name: "9. 隱者 (The Hermit)", keywords: "內省、孤獨、尋找真理、明智導引", revKeywords: "孤立過度、退縮、偏執、拒絕溝通" },
    { id: 10, name: "10. 命運之輪 (Wheel of Fortune)", keywords: "轉折點、機遇、命運、順其自然", revKeywords: "抗拒改變、厄運感、不可控局勢、時機未到" },
    { id: 11, name: "11. 正義 (Justice)", keywords: "公平、真理、法律、因果報應", revKeywords: "不公、偏見、避責、延誤決定" },
    { id: 12, name: "12. 吊人 (The Hanged Man)", keywords: "犧牲、換位思考、暫停、等待突破", revKeywords: "無謂犧牲、頑固、拖延、無力感" },
    { id: 13, name: "13. 死神 (Death)", keywords: "結束與新生、重大轉變、放下過去", revKeywords: "恐懼改變、執著過去、停滯不前、苦悶" },
    { id: 14, name: "14. 節制 (Temperance)", keywords: "平衡、調和、耐心、適度與融合", revKeywords: "失衡、極端、缺乏耐心、溝通不良" },
    { id: 15, name: "15. 惡魔 (The Devil)", keywords: "誘惑、束縛、執著、覺察盲點", revKeywords: "解脫束縛、覺醒、打破執念、恢復自主" },
    { id: 16, name: "16. 高塔 (The Tower)", keywords: "突變、崩解、震撼、破除舊有框架", revKeywords: "緊抱舊觀念、逃避危機、內部積怨、漸進式衝擊" },
    { id: 17, name: "17. 星星 (The Star)", keywords: "希望、療癒、靈感、光明未來", revKeywords: "失望、絕望、缺乏信心、靈感枯竭" },
    { id: 18, name: "18. 月亮 (The Moon)", keywords: "幻覺、不安、潛意識、隱藏的事物", revKeywords: "撥雲見日、恐懼消退、真相大白、情緒平復" },
    { id: 19, name: "19. 太陽 (The Sun)", keywords: "快樂、成功、活力、溫暖與光明", revKeywords: "暫時受挫、延遲成功、熱情消退、過度自滿" },
    { id: 20, name: "20. 審判 (Judgement)", keywords: "覺醒、審視、重生、迎來結果", revKeywords: "自我懷疑、悔恨、拖延決定、忽視召喚" },
    { id: 21, name: "21. 世界 (The World)", keywords: "圓滿、成就、旅程結束、新循環", revKeywords: "未完成、欠缺臨門一腳、延遲達成、受限" },

    // === 小阿爾克那 (權杖 Wands: 22-35) ===
    { id: 22, name: "權杖 Ace", keywords: "新機會、強大動力、靈感爆發", revKeywords: "動力不足、計畫延遲、失去熱情" },
    { id: 23, name: "權杖二", keywords: "未來規劃、遠見、抉擇方向", revKeywords: "缺乏遠見、畏懼改變、猶豫不決" },
    { id: 24, name: "權杖三", keywords: "遠見實現、拓展版圖、等待收成", revKeywords: "計畫受阻、延誤、預期落空" },
    { id: 25, name: "權杖四", keywords: "慶祝、安居樂業、婚禮或聚會", revKeywords: "不穩定、家庭摩擦、慶祝延期" },
    { id: 26, name: "權杖五", keywords: "競爭、意見分歧、小衝突", revKeywords: "避免衝突、內部整合、達成共識" },
    { id: 27, name: "權杖六", keywords: "勝利、凱旋歸來、受到肯定", revKeywords: "驕傲自滿、勝利短暫、未獲認可" },
    { id: 28, name: "權杖七", keywords: "防守、捍衛立場、面對挑戰", revKeywords: "體力透支、放棄防守、招架不住" },
    { id: 29, name: "權杖八", keywords: "快速進展、消息、旅行、效率", revKeywords: "訊息延誤、腳步受阻、混亂" },
    { id: 30, name: "權杖九", keywords: "防備、堅持到底、歷經考驗", revKeywords: "過度防備、疲憊不堪、放棄堅持" },
    { id: 31, name: "權杖十", keywords: "壓力過大、過勞、承擔太多責任", revKeywords: "學會放手、不堪負荷、崩潰邊緣" },
    { id: 32, name: "權杖侍者", keywords: "充滿熱情的好消息、探索者", revKeywords: "壞消息、三分鐘熱度、不成熟" },
    { id: 33, name: "權杖騎士", keywords: "行動力強、急躁、熱血衝勁", revKeywords: "魯莽行事、半途而廢、衝突" },
    { id: 34, name: "權杖王后", keywords: "自信、熱情、充滿魅力的領袖", revKeywords: "專斷、嫉妒心強、失去自信" },
    { id: 35, name: "權杖國王", keywords: "遠見、領導力、開創精神", revKeywords: "暴躁、獨裁、缺乏執行力" },

    // === 聖杯 Cups (36-49) ===
    { id: 36, name: "聖杯 Ace", keywords: "情感滿溢、新戀情、心靈滿足", revKeywords: "情感壓抑、空虛、失落感" },
    { id: 37, name: "聖杯二", keywords: "合作、心靈契合、人際或戀愛結盟", revKeywords: "關係破裂、溝通不良、不協調" },
    { id: 38, name: "聖杯三", keywords: "歡聚、友情慶祝、社交活動", revKeywords: "過度享樂、孤立、聚會取消" },
    { id: 39, name: "聖杯四", keywords: "冷漠、疲憊、對現狀感到厭倦", revKeywords: "重新振作、走出陰霾、接受新機會" },
    { id: 40, name: "聖杯五", keywords: "失落、悲傷、過度關注失去的事物", revKeywords: "走出傷痛、接納過去、重新看見希望" },
    { id: 41, name: "聖杯六", keywords: "懷舊、童年回憶、重逢、純真", revKeywords: "沉溺過去、長不大、脫離現實" },
    { id: 42, name: "聖杯七", keywords: "幻想、選擇過多、不切實際的目標", revKeywords: "看清現實、做出抉擇、夢醒時分" },
    { id: 43, name: "聖杯八", keywords: "尋找更高追求、離開不適合環境", revKeywords: "猶豫不決、捨不得離開、半途而廢" },
    { id: 44, name: "聖杯九", keywords: "願望實現、心滿意足、享受成果", revKeywords: "自滿、貪婪、表面光鮮" },
    { id: 45, name: "聖杯十", keywords: "家庭幸福、圓滿快樂、情感歸宿", revKeywords: "家庭不和、理想破滅、摩擦" },
    { id: 46, name: "聖杯侍者", keywords: "浪漫消息、溫和、情感表達", revKeywords: "情緒化、敏感脆弱、不切實際" },
    { id: 47, name: "聖杯騎士", keywords: "追求浪漫、求婚、溫柔體貼的追求者", revKeywords: "感情用事、虛偽、承諾不實" },
    { id: 48, name: "聖杯王后", keywords: "溫柔同理、直覺敏銳、包容體貼", revKeywords: "情緒勒索、過度敏感、自我犧牲" },
    { id: 49, name: "聖杯國王", keywords: "情緒穩定、成熟包容、大愛與智慧", revKeywords: "冷酷無情、情緒失控、心機重" },

    // === 寶劍 Swords (50-63) ===
    { id: 50, name: "寶劍 Ace", keywords: "理性突破、清晰思維、突破盲點", revKeywords: "思緒混亂、誤解、判斷錯誤" },
    { id: 51, name: "寶劍二", keywords: "逃避抉擇、僵局、盲點保護", revKeywords: "被迫面對現實、局勢明朗" },
    { id: 52, name: "寶劍三", keywords: "心碎、悲傷痛苦、言語傷害", revKeywords: "傷口癒合、走出痛苦、原諒" },
    { id: 53, name: "寶劍四", keywords: "休養生息、靜心冥想、暫停休息", revKeywords: "被迫重返戰場、倦怠" },
    { id: 54, name: "寶劍五", keywords: "爭勝心、兩敗俱傷、不光彩的勝利", revKeywords: "和解、放下爭執、記取教訓" },
    { id: 55, name: "寶劍六", keywords: "度過難關、療傷止痛、離開風暴", revKeywords: "滯留原地、舊傷復發、逃避問題" },
    { id: 56, name: "寶劍七", keywords: "智取、秘密行動、心眼與防範", revKeywords: "陰謀敗露、誠實面對、坦白" },
    { id: 57, name: "寶劍八", keywords: "自我設限、困境、動彈不得的焦慮", revKeywords: "突破自我、重獲自由、看清解法" },
    { id: 58, name: "寶劍九", keywords: "焦慮、失眠、過度擔憂與精神壓力", revKeywords: "憂慮減輕、尋求協助、放寬心" },
    { id: 59, name: "寶劍十", keywords: "谷底、徹底結束、慘痛教訓", revKeywords: "死裡逃生、逐漸復甦、曙光乍現" },
    { id: 60, name: "寶劍侍者", keywords: "警惕、觀察力強、刺探消息", revKeywords: "流言蜚語、計畫洩漏、多疑" },
    { id: 61, name: "寶劍騎士", keywords: "行動迅速、言語犀利、衝動直率", revKeywords: "禍從口出、思慮不周、盲目衝動" },
    { id: 62, name: "寶劍王后", keywords: "理性獨立、洞察力敏銳、公正嚴明", revKeywords: "過度冷酷、尖酸刻薄、偏見" },
    { id: 63, name: "寶劍國王", keywords: "權威、邏輯清晰、客觀公正的裁決", revKeywords: "濫用權力、鐵石心腸、專斷" },

    // === 金幣/錢幣 Pentacles (64-77) ===
    { id: 64, name: "金幣 Ace", keywords: "實質財富、新商機、物質豐盛", revKeywords: "財務危機、錯失良機、投資失利" },
    { id: 65, name: "金幣二", keywords: "生活平衡、多重任務處理、財務周轉", revKeywords: "失衡、財務吃緊、負荷過多" },
    { id: 66, name: "金幣三", keywords: "團隊合作、專業技術、工作受到認可", revKeywords: "合作破裂、缺乏默契、品質低落" },
    { id: 67, name: "金幣四", keywords: "守財、保守、安全感、過度執著", revKeywords: "破財、慷慨、放手、財務鬆綁" },
    { id: 68, name: "金幣五", keywords: "財務困境、孤立無援、寒酸與失落", revKeywords: "度過難關、獲得援助、狀況改善" },
    { id: 69, name: "金幣六", keywords: "施與受、分享資源、慈善或財務援助", revKeywords: "債務糾紛、吝嗇、不公的分配" },
    { id: 70, name: "金幣七", keywords: "長期投資、耐心等待收成、審視成果", revKeywords: "投資報酬率低、急於求成、放棄" },
    { id: 71, name: "金幣八", keywords: "專注技藝、努力耕耘、匠人精神", revKeywords: "馬虎敷衍、缺乏耐心、原地踏步" },
    { id: 72, name: "金幣九", keywords: "財務獨立、享受豐盛果實、優雅生活", revKeywords: "財務揮霍、虛榮、失去自主" },
    { id: 73, name: "金幣十", keywords: "家族繁榮、財產傳承、長遠穩定", revKeywords: "財務糾紛、家庭負債、傳承受阻" },
    { id: 74, name: "金幣侍者", keywords: "學習理財、務實的計劃、好消息", revKeywords: "不切實際、學業或工作怠惰" },
    { id: 75, name: "金幣騎士", keywords: "踏實穩健、一步一腳印、可靠負責", revKeywords: "死板不知變通、進度緩慢、懶散" },
    { id: 76, name: "金幣王后", keywords: "務實照顧、擅長理財、溫暖豐饒", revKeywords: "過度物質化、忽略心靈、金錢至上" },
    { id: 77, name: "金幣國王", keywords: "商業頭腦、財務穩健、富裕與成功", revKeywords: "守財奴、貪婪、投資失敗" }
];

// 記憶體對話狀態與每日抽牌記錄
const tarotSessions = {}; // key = voterKey, value = { step: 'waiting_card' or 'chatting', chosenCard, expireTimer }
const tarotDailyRecords = {}; // key = voterKey, value = { dateStr, cardName, orientation, reading }

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

// 取得當天日期字串 (YYYY-MM-DD)
function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
}

// ==========================================
// 1. 發起專業占卜提示 (塔羅起手式)
// ==========================================
async function startTarotPrompt(sock, remoteJid, voterKey, senderName, m, db) {
    const today = getTodayDateStr();
    const activeDb = db || dbService.db;

    // 🛡️ 檢查今天是否已經抽過牌
    if (tarotDailyRecords[voterKey] && tarotDailyRecords[voterKey].dateStr === today) {
        const record = tarotDailyRecords[voterKey];
        const repeatMsg = `🔮 @${senderName}，你今日已經抽過塔羅牌囉！\n` +
                          `📅 抽牌日期：${today}\n` +
                          `🎯 你當日抽中嘅牌係：**${record.cardName} (${record.orientation})**\n` +
                          `⚠️ **塔羅牌一日只能求問一次，禁止重複抽牌！** 請參閱番今日嘅解讀結果喔～`;
        
        await sock.sendMessage(remoteJid, { text: repeatMsg, mentions: [voterKey] }, { quoted: m });
        return;
    }

    if (tarotSessions[voterKey]?.expireTimer) {
        clearTimeout(tarotSessions[voterKey].expireTimer);
    }

    const expireTimer = setTimeout(() => {
        delete tarotSessions[voterKey];
    }, 60000);

    tarotSessions[voterKey] = { step: 'waiting_card', expireTimer };

    const promptText = `🔮 【${senderName} 的專業塔羅牌深度靈導】\n\n` +
                       `⚠️ **溫馨提醒：每人每天只限抽牌一次！**\n` +
                       `塔羅牌是反映你內心潛意識的鏡子。請靜心默想你最近關心的問題，然後直接回覆一個 **0 至 78** 的數字！\n\n` +
                       `💬 *（請直接回覆數字 msg，切勿重新打 !ai 或其他指令喔！）*\n` +
                       `⏱️ 請在 60 秒內輸入數字喔！`;

    await sock.sendMessage(remoteJid, { text: promptText, mentions: [voterKey] }, { quoted: m });

    // 📝 記錄至 AI 記憶庫
    if (activeDb) {
        await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', promptText);
    }
}

// ==========================================
// 2. 執行塔羅解讀與後續追問互動
// ==========================================
async function processTarotChoice(sock, remoteJid, voterKey, senderName, cardNumber, m, ai, systemPrompt, db) {
    const session = tarotSessions[voterKey];
    if (!session || session.step !== 'waiting_card') return false;

    clearTimeout(session.expireTimer);
    const today = getTodayDateStr();
    const activeDb = db || dbService.db;

    // 🛡️ 雙重防護：檢查當天是否已抽過
    if (tarotDailyRecords[voterKey] && tarotDailyRecords[voterKey].dateStr === today) {
        delete tarotSessions[voterKey];
        const record = tarotDailyRecords[voterKey];
        await sock.sendMessage(remoteJid, { 
            text: `🔮 @${senderName}，你今日已經抽過塔羅牌（**${record.cardName}**）囉！塔羅牌一日只能求問一次，請勿重複抽牌。`,
            mentions: [voterKey]
        }, { quoted: m });
        return true;
    }

    // 0 ~ 78 對應處理
    const validNumber = Math.max(0, Math.min(78, cardNumber));
    const cardIndex = validNumber % TAROT_CARDS.length;
    const isReversed = (validNumber % 2 !== 0); // 奇數視為逆位，偶數為正位，確保不同數字結果不同
    const selectedCard = TAROT_CARDS[cardIndex];
    const cardOrientation = isReversed ? "逆位 🔻" : "正位 🔺";
    const activeMeaning = isReversed ? (selectedCard.revKeywords || selectedCard.keywords) : selectedCard.keywords;

    await sock.sendMessage(remoteJid, { react: { text: '🔮', key: m.key } });

    const prompt = `你是一位精通榮格心理學原型與古典塔羅牌的資深專業占卜師，同時具備《皮克敏 Bloom》溫暖管家「皮皮小管家」的身份。

【求問者】：${senderName}
【抽得牌卡】：${selectedCard.name}
【牌面狀態】：${cardOrientation}
【核心象徵】：${activeMeaning}

請嚴格按照以下結構，用道地香港廣東話（廣東話口語）撰寫一份條理分明、具備專業心理學根據且有深度分析的塔羅解讀：

1. 🃏 **牌面深度解析**：精準解釋這張牌在數字 ${validNumber} 與正/逆位下的深層心理學含義。
2. 🔍 **潛意識盲點與挑戰**：指出求問者目前在生活或心境上可能忽略的盲點。
3. 🌱 **小管家專業指引**：給出 1-2 個具體、有建設性的生活與心態建議（可結合適度散步放鬆的意象）。

語氣要專業、溫暖、一針見血，切勿講廢話。`;

    let tarotReading = '';
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: { systemInstruction: systemPrompt }
        });
        tarotReading = response.text;
    } catch (e) {
        tarotReading = `🃏 **牌面**：${selectedCard.name} (${cardOrientation})\n💡 **象徵**：${activeMeaning}\n\n🌱 小管家提醒你：保持平靜，相信內心的力量！`;
    }

    // 💾 記錄至當天抽牌快取中，防止當天重抽
    tarotDailyRecords[voterKey] = {
        dateStr: today,
        cardName: selectedCard.name,
        orientation: cardOrientation,
        reading: tarotReading
    };

    const resultText = `🔮 【${senderName} 的塔羅心理與運勢深度解讀】\n\n` +
                       `🎯 你的心靈選牌（代號 ${validNumber}）：**${selectedCard.name}**\n` +
                       `✨ 牌面狀態：**${cardOrientation}**\n` +
                       `💡 能量關鍵字：${activeMeaning}\n` +
                       `───────────────────\n\n` +
                       `${tarotReading}\n\n` +
                       `💬 **請問針對呢個結果，仲有冇其他想問嘅地方？（直接回覆 msg 即可，若無需提問將於 1 分鐘後自動結束占卜）**`;

    await sock.sendMessage(remoteJid, { text: resultText }, { quoted: m });

    // 📝 記錄至 AI 記憶庫
    if (activeDb) {
        await recordCafeMessage(activeDb, remoteJid, senderName, 'user', `選擇了數字 ${validNumber}`);
        await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', resultText);
    }

    // ⏳ 進入後續追問狀態（1分鐘超時機制）
    const followUpExpireTimer = setTimeout(async () => {
        if (tarotSessions[voterKey]?.step === 'chatting') {
            delete tarotSessions[voterKey];
            try {
                await sock.sendMessage(remoteJid, { text: `⌛ @${senderName}，見你冇其他問題，今日嘅塔羅占卜就到呢度啦！祝你有美好嘅一日 🌱`, mentions: [voterKey] });
            } catch (err) {}
        }
    }, 60 * 1000);

    tarotSessions[voterKey] = {
        step: 'chatting',
        selectedCard,
        cardOrientation,
        expireTimer: followUpExpireTimer
    };

    return true;
}

// ==========================================
// 2.1 處理塔羅牌抽完後的後續追問
// ==========================================
async function processTarotFollowUp(sock, remoteJid, voterKey, senderName, messageContent, m, ai, systemPrompt, db) {
    const session = tarotSessions[voterKey];
    if (!session || session.step !== 'chatting') return false;

    // 重設 1 分鐘計時器
    clearTimeout(session.expireTimer);
    const activeDb = db || dbService.db;

    const followUpExpireTimer = setTimeout(async () => {
        if (tarotSessions[voterKey]?.step === 'chatting') {
            delete tarotSessions[voterKey];
            try {
                await sock.sendMessage(remoteJid, { text: `⌛ @${senderName}，見你冇再追問，今日嘅塔羅占卜自動結束啦！`, mentions: [voterKey] });
            } catch (err) {}
        }
    }, 60 * 1000);

    session.expireTimer = followUpExpireTimer;

    // 讓 AI 進行專業後續解答
    await sock.sendMessage(remoteJid, { react: { text: '💬', key: m.key } });

    const prompt = `你是一位專業的塔羅占卜師與溫暖的皮皮小管家。
求問者：${senderName}
剛才抽到的牌：${session.selectedCard.name} (${session.cardOrientation})
求問者的追問內容："""${messageContent}"""

請用道地香港廣東話（廣東話口語），結合剛才抽到的牌面意象，專業且有依據地回答對方的問題，語氣溫暖貼心。`;

    let replyText = '';
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: { systemInstruction: systemPrompt }
        });
        replyText = response.text;
    } catch (e) {
        replyText = `收到你嘅問題！關於 ${session.selectedCard.name}，小管家建議你保持耐心，順其自然就會搵到答案架啦！`;
    }

    const finalReply = `💬 **【塔羅深度解答】**\n\n${replyText}\n\n*(如需繼續追問請直接回覆 msg，1分鐘內無回覆將自動結束)*`;
    await sock.sendMessage(remoteJid, { text: finalReply }, { quoted: m });

    if (activeDb) {
        await recordCafeMessage(activeDb, remoteJid, senderName, 'user', messageContent);
        await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', finalReply);
    }

    return true;
}

// 3. 海龜湯啟動
async function startTurtleGame(sock, remoteJid, difficulty, m, ai, systemPrompt, db) {
    if (turtleGame.active) {
        await sock.sendMessage(remoteJid, { text: `⚠️ 目前已經有一局海龜湯正在進行中囉！請先猜出答案或等待結束。` }, { quoted: m });
        return;
    }

    const activeDb = db || dbService.db;
    const loadingText = `🐢 【海龜湯】小管家正在編寫一道${difficulty === 'easy' ? '簡單' : '正常'}難度的懸疑謎題，請稍候……\n💬 *(請直接回覆 msg 參與推理，切勿重新打 !ai)*`;
    await sock.sendMessage(remoteJid, { text: loadingText }, { quoted: m });

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

        const storyText = `🐢 【海龜湯開局！】\n\n📌 **【湯面】**\n${turtleGame.story}\n\n💡 **遊戲規則**：大家可以直接回覆 msg 向小管家發問「是/不是/無關」的問題來推理真相！`;
        await sock.sendMessage(remoteJid, { text: storyText });

        if (activeDb) {
            await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', storyText);
        }
    } catch (e) {
        await sock.sendMessage(remoteJid, { text: `❌ 哎呀！海龜湯生成失敗，請稍後再試一次！` });
    }
}

// 4. 猜人名遊戲投票發起
async function startNameVote(sock, remoteJid, senderPhone, senderName, m, db) {
    if (nameGameSession.active) {
        await sock.sendMessage(remoteJid, { text: `⚠️ 目前已經有一場遊戲正在進行中囉！` }, { quoted: m });
        return;
    }

    const activeDb = db || dbService.db;
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
                     `由 ${senderName} 發起！請各位皮友在 30 秒內直接回覆 msg 代號選擇本局玩法：\n` +
                     `【A】AI 隨機出題（發起人指定主題）\n` +
                     `【B】群友匿名出題（私訊小管家 !出題 題目）\n` +
                     `【C】秘密扮演模式（私訊小管家 !扮演 角色名稱）\n\n` +
                     `💬 *(請直接回覆 msg 投票，切勿重新打 !ai)*`;

    await sock.sendMessage(remoteJid, { text: voteText }, { quoted: m });

    if (activeDb) {
        await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', voteText);
    }

    nameGameSession.timer = setTimeout(async () => {
        if (!nameGameSession.active || nameGameSession.step !== 'voting') return;

        const votes = nameGameSession.votes;
        const maxVotes = Math.max(votes.A, votes.B, votes.C);
        let winningMode = 'A';
        if (maxVotes === votes.B && votes.B > votes.A) winningMode = 'B';
        if (maxVotes === votes.C && votes.C > votes.B && votes.C > votes.A) winningMode = 'C';

        nameGameSession.mode = winningMode;
        const mentionTarget = senderPhone ? `${senderPhone}@s.whatsapp.net` : remoteJid;

        let resultText = '';
        if (winningMode === 'A') {
            nameGameSession.step = 'a_waiting_theme';
            resultText = `📊 【投票結算】最高票：【A 模式】\n\n@${senderPhone || senderName} 是本局發起人，請在群組直接回覆 msg 輸入「!主題 [你的主題]」（例如：!主題 動漫角色）來讓小呆出題！`;
            await sock.sendMessage(remoteJid, { text: resultText, mentions: [mentionTarget] });
        } else if (winningMode === 'B') {
            nameGameSession.step = 'b_collecting';
            resultText = `📊 【投票結算】最高票：【B 模式 (群友匿名出題)】\n\n請各位玩家**私訊小管家**回覆 msg 輸入「!出題 [你想出的名字/角色]」！`;
            await sock.sendMessage(remoteJid, { text: resultText });
        } else {
            nameGameSession.step = 'c_waiting_master';
            resultText = `📊 【投票結算】最高票：【C 模式 (秘密扮演模式)】\n\n請隨便一位玩家**私訊小管家**回覆 msg 輸入「!扮演 [你要扮演的角色]」來成為本局主持人！`;
            await sock.sendMessage(remoteJid, { text: resultText });
        }

        if (activeDb) {
            await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', resultText);
        }
    }, 30000);
}

module.exports = {
    tarotSessions,
    turtleGame,
    nameGameSession,
    startTarotPrompt,
    processTarotChoice,
    processTarotFollowUp,
    startTurtleGame,
    startNameVote
};
