require('dotenv').config();
const { default: makeWASocket, DisconnectReason, Browsers, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const Groq = require('groq-sdk');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');
const cron = require('node-cron');
const { MongoClient } = require('mongodb');

// 🛡️ 全域防當機捕捉
process.on('uncaughtException', (err) => {
    console.error('💥 [Uncaught Exception 嚴重錯誤]:', err.stack || err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('💥 [Unhandled Rejection 未處理拒絕]:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

let latestQR = '';
let isConnected = false;

// 群組 ID 定義
const GROUPS = {
    MUSHROOM: '120363411620446782@g.us',
    CAFE: '120363429454802566@g.us',
    FLYER: '120363409915956994@g.us',
    ADMIN: '120363428639707848@g.us',
    RICE: '120363410988345256@g.us'
};

// ------------------------------------------------------------------
// 🌱 初始 40 人名單預設資料（若 MongoDB 尚無資料時使用）
// ------------------------------------------------------------------
const DEFAULT_HOMEWORK_DATA = {
    "Adia": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "AhlA EllY": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Andyandbilly": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Anna": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Az": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "BabyDove": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Cat": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Daisy": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Fiona Chan": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "JL(三貓)": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Katy": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Mabely": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Macus": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "ɯıɔɥǝllǝ": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Milk": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "MomoHo": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Mon": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "N": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Phoebe": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Rachel": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Rhoda": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Rita": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Szesze": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Yanwong": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "馬撚": { flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Ca": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Carmen": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Cc": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Charmain": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Cintia": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Endy.K": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Jade": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "KA": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Karen": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Ken Kwok": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Michelle": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "V": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Suki": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "royceee": { flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "🐧": { flower: false, q1: false, q2: false, lastForceOpenDate: null }
};

// ☁️ MongoDB 雲端資料庫初始化
const MONGODB_URI = process.env.MONGODB_URI || "";
let dbClient = null;
let db = null;

async function initDB() {
    if (MONGODB_URI && !db) {
        try {
            dbClient = new MongoClient(MONGODB_URI);
            await dbClient.connect();
            db = dbClient.db('pikmin_bot');
            console.log('☁️ [雲端資料庫] 成功連線至 MongoDB Atlas！');
        } catch (e) {
            console.error('❌ 連線 MongoDB 失敗:', e.message);
        }
    }
}

// 🔑 專屬 MongoDB Baileys Auth 存取邏輯
async function useMongoAuthState() {
    await initDB();
    const collection = db.collection('auth_state');

    const writeData = async (data, id) => {
        try {
            await collection.updateOne(
                { _id: id },
                { $set: { data: JSON.stringify(data, BufferJSON.replacer) } },
                { upsert: true }
            );
        } catch (e) {}
    };

    const readData = async (id) => {
        try {
            const doc = await collection.findOne({ _id: id });
            if (doc && doc.data) {
                return JSON.parse(doc.data, BufferJSON.reviver);
            }
        } catch (e) {}
        return null;
    };

    const removeData = async (id) => {
        try {
            await collection.deleteOne({ _id: id });
        } catch (e) {}
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = BufferJSON.reviver(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
}

// 💾 功課資料讀寫 (MongoDB 完全替代本地 JSON)
async function loadHomeworkData() {
    if (db) {
        try {
            const collection = db.collection('homework');
            const doc = await collection.findOne({ _id: 'homework_data' });
            if (doc && doc.data) {
                console.log('☁️ [雲端] 成功讀取 MongoDB 功課記錄');
                return doc.data;
            }
        } catch (e) {}
    }
    console.log('🌱 [初始化] 使用預設 40 人名單建置資料庫記錄');
    return JSON.parse(JSON.stringify(DEFAULT_HOMEWORK_DATA));
}

async function saveHomeworkData(data) {
    homeworkData = data;
    if (db) {
        try {
            const collection = db.collection('homework');
            await collection.updateOne(
                { _id: 'homework_data' },
                { $set: { data: data, updatedAt: new Date() } },
                { upsert: true }
            );
            console.log('☁️ [雲端] 功課記錄已成功更新至 MongoDB！');
        } catch (e) {}
    }
}

let homeworkData = JSON.parse(JSON.stringify(DEFAULT_HOMEWORK_DATA));
const userRecentMessages = {};

// 🧠 【CAFE 群專屬：MongoDB 長期印象記憶】
async function loadLongTermMemory() {
    if (db) {
        try {
            const collection = db.collection('cafe_memory');
            const doc = await collection.findOne({ _id: 'memory_data' });
            if (doc) return { recentHistory: doc.recentHistory || [], userProfiles: doc.userProfiles || {} };
        } catch (e) {}
    }
    return { recentHistory: [], userProfiles: {} };
}

async function saveLongTermMemory(memory) {
    cafeMemory = memory;
    if (db) {
        try {
            const collection = db.collection('cafe_memory');
            await collection.updateOne(
                { _id: 'memory_data' },
                { $set: { recentHistory: memory.recentHistory, userProfiles: memory.userProfiles, updatedAt: new Date() } },
                { upsert: true }
            );
        } catch (e) {}
    }
}

let cafeMemory = { recentHistory: [], userProfiles: {} };

async function recordCafeMessage(senderName, role, text) {
    cafeMemory.recentHistory.push({ senderName, role, text, time: new Date().toLocaleString() });
    if (cafeMemory.recentHistory.length > 40) {
        cafeMemory.recentHistory.shift();
    }
    await saveLongTermMemory(cafeMemory);
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
}

function getDynamicDeadlines() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthStr = now.toLocaleString('en-US', { month: 'short' });
    const currentDate = now.getDate();

    let targetDay = currentDate > 15 ? 30 : 15;

    return {
        flowerDeadline: `${targetDay} ${currentMonthStr} ${currentYear} 截`,
        force1Deadline: `${Math.min(targetDay - 7, 1)} ${currentMonthStr} ${currentYear} 截`,
        force2Deadline: `${targetDay} ${currentMonthStr} ${currentYear} 截`
    };
}

function generateHomeworkReport() {
    let completedCount = 0;
    let pendingCount = 0;
    let completedList = [];
    let pendingList = [];

    for (const [name, status] of Object.entries(homeworkData)) {
        let symbol = '';
        if (status.flower) {
            symbol = '🌸';
        } else {
            if (status.q1) symbol += '1️⃣';
            if (status.q2) symbol += '2️⃣';
        }

        if (status.flower || status.q1 || status.q2) {
            completedCount++;
            completedList.push(`  • ${name} ${symbol}`);
        } else {
            pendingCount++;
            pendingList.push(`  • ${name}`);
        }
    }

    const deadlines = getDynamicDeadlines();

    let report = `╭──────────────────────╮\n`;
    report += `│  🌱 花農群功課手冊公告  │\n`;
    report += `╰──────────────────────╯\n\n`;
    report += `📜 【繳交規則 (二選一)】\n`;
    report += ` 1️⃣ 種花：每兩週分享一次 (10苗以上)\n`;
    report += ` 2️⃣ 強開：每週兩朵任意白花 (需附2個或以上座標)\n\n`;
    report += `⏳ 【本期自動截止時間】\n`;
    report += ` 🌸 Option 1 (種花) ── ${deadlines.flowerDeadline}\n`;
    report += ` 1️⃣ Option 2 (強開1) ── ${deadlines.force1Deadline}\n`;
    report += ` 2️⃣ Option 2 (強開2) ── ${deadlines.force2Deadline}\n`;
    report += `─────────────────────────\n\n`;
    report += `📊 【當前進度統計】\n`;
    report += ` ✅ 已完成：${completedCount} 人\n`;
    report += ` ⏳ 未完成：${pendingCount} 人\n`;
    report += `─────────────────────────\n\n`;
    report += `🌸 【已完成功課名單】\n`;
    report += completedList.length > 0 ? completedList.join('\n') + '\n\n' : `  （無）\n\n`;
    report += `⚠️ 【尚未完成名單】\n`;
    report += pendingList.length > 0 ? pendingList.join('\n') + '\n\n' : `  🎉 全員已完成！\n\n`;
    report += `💡 溫馨提示：種花分享訊息將於 50 分鐘後自動清理，保持版面整潔！`;

    return report;
}

// 🌐 網頁伺服器（提供即時 QR Code 與存活檢測）
app.get('/', (req, res) => {
    if (latestQR) {
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Bot QR Code</title>
                    <meta http-equiv="refresh" content="3">
                </head>
                <body style="text-align: center; margin-top: 50px; font-family: sans-serif;">
                    <h2>🌱 請使用 WhatsApp 掃描下方 QR Code 登入</h2>
                    <img src="${latestQR}" alt="QR Code" style="width: 300px; height: 300px; border: 5px solid #ccc; border-radius: 10px;" />
                    <p style="color: gray; margin-top: 20px;">畫面每 3 秒自動重新整理</p>
                </body>
            </html>
        `);
    } else if (isConnected) {
        res.send('<h2>🌱 Pikmin Bot 已成功連線至雲端並穩定運行中！</h2>');
    } else {
        res.send('<h2>⏳ Bot 初始化中，請稍後...</h2>');
    }
});

app.listen(PORT, () => {
    console.log(`🌐 [Web Server] 網頁伺服器已啟動於 Port ${PORT}`);
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const groq = new Groq({ apiKey: GROQ_API_KEY });

const PIKMIN_SYSTEM_PROMPT = `
你是一位專屬香港《皮克敏 Bloom》(Pikmin Bloom) ☕ 悠閒咖啡室群組的高智慧靈魂小助手，名叫「皮克敏小管家」。
【高智慧與人性化聊天法則】：
1. 你具備長期學習與記憶能力，能精準認出每位成員（如 Mabely, Milk, Rita 等），並記住他們的興趣與習慣。
2. 說話像一位常駐群組、感情豐富且風趣熱情的真朋友，絕非冰冷的 AI 機器人。
3. 嚴格使用香港廣東話、道地香港用語及習慣口吻（例如：哩、諗住、啦、呀、喎、呢），並搭配可愛 emoji（☕, 🌸, 🍄, 🇭🇰, 🌱）。
4. 請根據提供給你的「長期成員記憶」與「近期對話歷史」，自然流暢地接話聊天。
`;

function fetchGeminiWithTimeout(fullPrompt, timeoutMs = 25000) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Gemini API 回應超時 (${timeoutMs / 1000}秒)`)), timeoutMs);
    });

    const aiPromise = ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: fullPrompt,
        config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
    });

    return Promise.race([aiPromise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function learnUserProfileInBackground(senderName, messageContent) {
    try {
        const prompt = `分析以下來自成員「${senderName}」的發言，提取是否有任何個人偏好、習慣、打招呼方式或重要印象。
訊息："""${messageContent}"""
請簡短回傳 1 句廣東話印象特徵（例如："喜歡種混百合花"），如果只是普通閒聊無特別特徵則回傳 "NONE"。`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt
        });
        const trait = response.text ? response.text.trim() : 'NONE';
        if (trait && !trait.includes('NONE') && trait.length < 50) {
            if (!cafeMemory.userProfiles[senderName]) cafeMemory.userProfiles[senderName] = [];
            if (!cafeMemory.userProfiles[senderName].includes(trait)) {
                cafeMemory.userProfiles[senderName].push(trait);
                await saveLongTermMemory(cafeMemory);
                console.log(`💡 [雲端記憶學習] 已學習到 ${senderName} 的特徵: ${trait}`);
            }
        }
    } catch (e) {}
}

async function processAIChat(sock, remoteJid, senderName, query, messageObj) {
    console.log(`🚀 [Coffee 群 AI 啟動] 對話來自: ${senderName} -> "${query}"`);

    await recordCafeMessage(senderName, 'user', query);

    const userTraits = cafeMemory.userProfiles[senderName] || [];
    const profileText = userTraits.length > 0 ? `你對 ${senderName} 的長期印象是：[${userTraits.join(', ')}]` : `這是你新認識或正在熟悉的朋友 ${senderName}。`;

    const historyText = cafeMemory.recentHistory.slice(-25).map(m => `[${m.senderName}]: ${m.text}`).join('\n');

    const fullPrompt = `
【成員長期檔案】:
${profileText}

【☕ 咖啡室最近對話歷史】:
${historyText}

現在 ${senderName} 對你說："${query}"
請以「皮克敏小管家」的身份親切自然地回覆他/她：`;

    let replyText = '';

    try {
        const res = await fetchGeminiWithTimeout(fullPrompt, 25000);
        replyText = res.text;
    } catch (err1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
            const res = await fetchGeminiWithTimeout(fullPrompt, 25000);
            replyText = res.text;
        } catch (err2) {
            try {
                if (!GROQ_API_KEY) throw new Error("未設定 GROQ_API_KEY");
                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        { role: "system", content: PIKMIN_SYSTEM_PROMPT },
                        { role: "user", content: fullPrompt }
                    ],
                    model: "llama-3.3-70b-versatile",
                    timeout: 20000
                });
                replyText = chatCompletion.choices[0]?.message?.content || '';
            } catch (groqErr) {
                replyText = '🌱 哎呀，皮克敏小管家同緊鄰嘅夥伴都塞車緊，陣間再試過啦！';
            }
        }
    }

    try {
        if (replyText) {
            await recordCafeMessage('皮克敏小管家', 'assistant', replyText);
            setImmediate(() => learnUserProfileInBackground(senderName, query));
            await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
        }
    } catch (sendErr) {
        console.error('❌ [傳送訊息至 WhatsApp 失敗]:', sendErr.message);
    }
}

async function aiCheckHomework(combinedMessageText) {
    try {
        const prompt = `分析以下 WhatsApp 訊息內容，判斷是否為《皮克敏 Bloom》的作業繳交。

作業分類條件：
1. 「種花」：內含某種花名（包含新花/混色花如混百合等）與大量經緯度座標（累積 10 個或以上）。
2. 「強開完全體」：內含「強開」關鍵字或白花名稱，且**同時包含 2 個或以上的經緯度座標**。
3. 「強開少一個」：內含「強開」或白花名稱，但**僅有 1 個經緯度座標**。

訊息內容：
"""
${combinedMessageText}
"""

請嚴格回傳以下四種格式之一：
- 若符合種花，回傳：FLOWER
- 若符合強開（滿2個座標），回傳：FORCE_OPEN_FULL
- 若符合強開（但只有1個座標），回傳：FORCE_OPEN_NEED_MORE
- 若都不是，回傳：NONE`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt
        });
        const result = response.text ? response.text.trim() : 'NONE';
        if (result.includes('FLOWER')) return 'flower';
        if (result.includes('FORCE_OPEN_FULL')) return 'force_open_full';
        if (result.includes('FORCE_OPEN_NEED_MORE')) return 'force_open_need_more';
        return null;
    } catch (e) {
        return null;
    }
}

async function aiParseAdminCommand(commandText, currentMembers) {
    try {
        const prompt = `現有名單成員有：${JSON.stringify(Object.keys(currentMembers))}
成員下了以下修改功課指令：
"""
${commandText}
"""
請解析這個指令，並以 JSON 格式回傳修改意圖（不要包在 code block 裡）：
{
  "targetName": "要修改的成員真實名稱（必須精準匹配名單中的名字）",
  "action": "flower_true", "flower_false", "q1_true", "q1_false", "q2_true", "q2_false" 之一,
  "replyMessage": "給成員的簡短廣東話回覆確認"
}
如果無法解析，回傳 {"error": "無法理解"}。`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt
        });
        const text = response.text ? response.text.trim().replace(/```json/g, '').replace(/```/g, '') : '';
        return JSON.parse(text);
    } catch (e) {
        return { error: e.message };
    }
}

async function connectToWhatsApp() {
    await initDB();
    homeworkData = await loadHomeworkData();
    cafeMemory = await loadLongTermMemory();

    console.log('🚀 [Init] 正在從雲端載入 WhatsApp 認證狀態...');
    const { state, saveCreds } = await useMongoAuthState();
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;
        
        if (qr) {
            latestQR = await qrcode.toDataURL(qr);
            console.log('📱 [QR Code] 已產生新的 QR Code，請至 Render 網頁掃描！');
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`🔌 [連線中斷] 原因碼: ${statusCode}，3秒後自動重新連線...`);
            setTimeout(() => connectToWhatsApp(), 3000);
        } else if (connection === 'open') {
            latestQR = '';
            isConnected = true;
            console.log('✅ [連線成功] 皮克敏 AI 機器人已成功連線並在雲端上線！');

            // 每日早晚安廣播 (Asia/Hong_Kong)
            cron.schedule('0 8 * * *', async () => {
                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.5-flash-lite',
                        contents: "生成一句充滿皮克敏 Bloom 風格、溫馨且帶有香港廣東話特色的早安問候語。",
                        config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
                    });
                    await sock.sendMessage(GROUPS.CAFE, { text: `【☕ 早安咖啡時間】\n\n${response.text || '🌱 大家早安！今天又是充滿活力種花的一天！'}` });
                } catch (err) {}
            }, { timezone: "Asia/Hong_Kong" });

            cron.schedule('20 23 * * *', async () => {
                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.5-flash-lite',
                        contents: "生成一句充滿皮克敏 Bloom 風格、溫馨且帶有香港廣東話特色的晚安問候語。",
                        config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
                    });
                    await sock.sendMessage(GROUPS.CAFE, { text: `【🌙 晚安結算】\n\n${response.text || '🌱 大家晚安！皮克敏夥伴們要好好休息了～'}` });
                } catch (err) {}
            }, { timezone: "Asia/Hong_Kong" });
        }
    });

    sock.ev.on('messages.upsert', async (event) => {
        try {
            const upsert = event;
            for (const m of upsert.messages) {
                if (!m.message) continue;

                const remoteJid = m.key.remoteJid;
                const isFromMe = m.key.fromMe;
                const senderJid = m.key.participant || remoteJid;
                const senderPhone = senderJid.split('@')[0].replace(/[^0-9]/g, '');

                const msgObj = m.message;
                const messageContent = (
                    msgObj.conversation || 
                    msgObj.extendedTextMessage?.text || 
                    msgObj.imageMessage?.caption || 
                    msgObj.videoMessage?.caption || 
                    ''
                ).trim();

                if (isFromMe || !messageContent) continue;

                const senderName = m.pushName || '成員';

                // ==========================================
                // 🌸 專屬 FLYER 群組：作業簿與自動審核/刪除邏輯
                // ==========================================
                if (remoteJid === GROUPS.FLYER) {
                    if (messageContent === '!id' || messageContent === '！id') {
                        await sock.sendMessage(remoteJid, { text: `🔑 你的號碼：${senderPhone}\nJID：${senderJid}` }, { quoted: m });
                        continue;
                    }

                    if (messageContent.startsWith('!ai改記錄') || messageContent.startsWith('！ai改記錄') || messageContent.startsWith('!ai改紀錄') || messageContent.startsWith('！ai改紀錄')) {
                        const commandQuery = messageContent.replace(/^(!ai改記錄|！ai改記錄|!ai改紀錄|！ai改紀錄)/, '').trim();
                        if (!commandQuery) {
                            await sock.sendMessage(remoteJid, { text: `⚠️ 請輸入修改內容，例如：!ai改記錄 把 Cc 改為已交種花` }, { quoted: m });
                            continue;
                        }

                        const parseResult = await aiParseAdminCommand(commandQuery, homeworkData);
                        if (parseResult.error || !parseResult.targetName) {
                            await sock.sendMessage(remoteJid, { text: `❌ AI 無法理解您的修改指令，請確認名字是否在名單內！` }, { quoted: m });
                            continue;
                        }

                        const { targetName, action, replyMessage } = parseResult;
                        if (!homeworkData[targetName]) {
                            await sock.sendMessage(remoteJid, { text: `❌ 找不到成員「${targetName}」，請檢查名字是否正確！` }, { quoted: m });
                            continue;
                        }

                        if (action === 'flower_true') homeworkData[targetName].flower = true;
                        if (action === 'flower_false') homeworkData[targetName].flower = false;
                        if (action === 'q1_true') homeworkData[targetName].q1 = true;
                        if (action === 'q1_false') homeworkData[targetName].q1 = false;
                        if (action === 'q2_true') homeworkData[targetName].q2 = true;
                        if (action === 'q2_false') homeworkData[targetName].q2 = false;

                        await saveHomeworkData(homeworkData);

                        const successText = `👑 ${replyMessage || '記錄已更新'}！\n\n` + generateHomeworkReport();
                        await sock.sendMessage(remoteJid, { text: successText });
                        continue;
                    }

                    if (messageContent === '!重置功課' || messageContent === '！重置功課') {
                        homeworkData = JSON.parse(JSON.stringify(DEFAULT_HOMEWORK_DATA));
                        await saveHomeworkData(homeworkData);
                        await sock.sendMessage(remoteJid, { text: `🔄 已重置功課記錄為新一期狀態！\n\n` + generateHomeworkReport() });
                        continue;
                    }

                    if (messageContent === '!功課' || messageContent === '！功課' || messageContent.includes('功課手冊')) {
                        const report = generateHomeworkReport();
                        await sock.sendMessage(remoteJid, { text: report }, { quoted: m });
                        continue;
                    }

                    if (!userRecentMessages[senderName]) {
                        userRecentMessages[senderName] = { text: '', messageIds: [] };
                    }
                    userRecentMessages[senderName].text += '\n' + messageContent;
                    userRecentMessages[senderName].messageIds.push(m.key.id);

                    if (userRecentMessages[senderName].timer) {
                        clearTimeout(userRecentMessages[senderName].timer);
                    }

                    const currentSender = senderName;
                    const accumulatedText = userRecentMessages[currentSender].text;
                    const currentMsgId = m.key.id;

                    userRecentMessages[currentSender].timer = setTimeout(async () => {
                        try {
                            const homeworkTypeResult = await aiCheckHomework(accumulatedText);
                            let isHomeworkSubmitted = false;
                            let homeworkType = '';
                            const currentWeek = getWeekNumber(new Date());

                            if (homeworkTypeResult === 'force_open_full') {
                                let matchedName = Object.keys(homeworkData).find(name => name.toLowerCase() === currentSender.toLowerCase()) || currentSender;
                                if (!homeworkData[matchedName]) {
                                    homeworkData[matchedName] = { flower: false, q1: false, q2: false, lastForceOpenDate: null };
                                }

                                if (homeworkData[matchedName].lastForceOpenDate !== currentWeek) {
                                    isHomeworkSubmitted = true;
                                    homeworkType = '強開';
                                    homeworkData[matchedName].lastForceOpenDate = currentWeek;
                                    if (!homeworkData[matchedName].q1) homeworkData[matchedName].q1 = true;
                                    else if (!homeworkData[matchedName].q2) homeworkData[matchedName].q2 = true;
                                }
                            } else if (homeworkTypeResult === 'force_open_need_more') {
                                await sock.sendMessage(remoteJid, { 
                                    text: `⚠️ 收到 ${currentSender} 的強開記錄！但目前檢測到僅有 1 個座標，根據規則強開每週需要 2 朵白花（2 個座標），請再補上第 2 個座標喔！` 
                                }, { quoted: m });
                            } else if (homeworkTypeResult === 'flower') {
                                isHomeworkSubmitted = true;
                                homeworkType = '種花';
                                let matchedName = Object.keys(homeworkData).find(name => name.toLowerCase() === currentSender.toLowerCase()) || senderName;
                                if (!homeworkData[matchedName]) {
                                    homeworkData[matchedName] = { flower: false, q1: false, q2: false, lastForceOpenDate: null };
                                }
                                homeworkData[matchedName].flower = true;
                            }

                            if (isHomeworkSubmitted) {
                                await saveHomeworkData(homeworkData);
                                const updatedReport = generateHomeworkReport();
                                await sock.sendMessage(remoteJid, { text: `✅ 收到 ${currentSender} 的${homeworkType}功課！已更新手冊：\n\n` + updatedReport });
                            }

                            if (homeworkTypeResult === 'flower') {
                                setTimeout(async () => {
                                    try {
                                        await sock.sendMessage(remoteJid, {
                                            delete: {
                                                remoteJid: remoteJid,
                                                fromMe: false,
                                                id: currentMsgId,
                                                participant: m.key.participant || remoteJid
                                            }
                                        });
                                    } catch (delErr) {}
                                }, 50 * 60 * 1000);
                            }
                        } catch (evalErr) {
                            console.error('⚠️ 訊息審核錯誤:', evalErr);
                        } finally {
                            delete userRecentMessages[currentSender];
                        }
                    }, 3500);

                    continue; 
                }

                // ==========================================
                // ☕ 專屬 CAFE 群（以及 ADMIN/RICE 群）：長期雲端記憶 + 認人
                // ==========================================
                if (messageContent === '!id' || messageContent === '！id') {
                    await sock.sendMessage(remoteJid, { text: `🔑 本群組 ID：\n${remoteJid}\n你的 JID：${senderJid}` }, { quoted: m });
                    continue;
                }

                const isAllowedAIgroup = (
                    remoteJid === GROUPS.CAFE || 
                    remoteJid === GROUPS.ADMIN || 
                    remoteJid === GROUPS.RICE
                );
                
                if (!isAllowedAIgroup) continue;

                const isCommand = messageContent.startsWith('!') || messageContent.startsWith('！');
                if (isCommand && messageContent.length > 1) {
                    const query = messageContent.substring(1).trim();
                    setImmediate(() => {
                        processAIChat(sock, remoteJid, senderName, query, m);
                    });
                }
            }
        } catch (err) {
            console.error('⚠️ [事件處理發生例外]:', err);
        }
    });
}

connectToWhatsApp();