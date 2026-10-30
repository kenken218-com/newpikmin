require('dotenv').config();
const { default: makeWASocket, DisconnectReason, Browsers, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
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

const DEFAULT_HOMEWORK_DATA = {
    "Adia": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "AhlA EllY": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Andyandbilly": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Anna": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Az": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "BabyDove": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Cat": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Daisy": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Fiona Chan": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "JL(三貓)": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Katy": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Mabely": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Macus": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "ɯıɔɥǝllǝ": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Milk": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "MomoHo": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Mon": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "N": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Phoebe": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Rachel": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Rhoda": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Rita": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Szesze": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Yanwong": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "馬撚": { phone: "", flower: true, q1: false, q2: false, lastForceOpenDate: null },
    "Ca": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Carmen": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Cc": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Charmain": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Cintia": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Endy.K": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Jade": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "KA": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Ken Kwok": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Michelle": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "V": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "Suki": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "royceee": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null },
    "🐧": { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null }
};

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
        } catch (e) { console.error('❌ 連線 MongoDB 失敗:', e.message); }
    }
}

async function useMongoAuthState() {
    await initDB();
    const collection = db.collection('auth_state');
    const writeData = async (data, id) => {
        try { await collection.updateOne({ _id: id }, { $set: { data: JSON.stringify(data, BufferJSON.replacer) } }, { upsert: true }); } catch (e) {}
    };
    const readData = async (id) => {
        try {
            const doc = await collection.findOne({ _id: id });
            if (doc && doc.data) return JSON.parse(doc.data, BufferJSON.reviver);
        } catch (e) {}
        return null;
    };
    const removeData = async (id) => { try { await collection.deleteOne({ _id: id }); } catch (e) {} };
    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) value = BufferJSON.reviver(value);
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            tasks.push(value ? writeData(value, `${category}-${id}`) : removeData(`${category}-${id}`));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
}

async function loadHomeworkData() {
    if (db) {
        try {
            const doc = await db.collection('homework').findOne({ _id: 'homework_data' });
            if (doc && doc.data) return doc.data;
        } catch (e) {}
    }
    return JSON.parse(JSON.stringify(DEFAULT_HOMEWORK_DATA));
}

async function saveHomeworkData(data) {
    homeworkData = data;
    if (db) {
        try { await db.collection('homework').updateOne({ _id: 'homework_data' }, { $set: { data: data, updatedAt: new Date() } }, { upsert: true }); } catch (e) {}
    }
}

let homeworkData = JSON.parse(JSON.stringify(DEFAULT_HOMEWORK_DATA));
const userRecentMessages = {};

async function backupHomeworkData() {
    if (db) {
        try {
            await db.collection('homework_backup').updateOne(
                { _id: 'latest_backup' },
                { $set: { data: homeworkData, updatedAt: new Date() } },
                { upsert: true }
            );
        } catch (e) {}
    }
}

async function scheduleMultipleDeletions(remoteJid, messageIds, participantJid, delayMs = 50 * 60 * 1000) {
    if (!db) return;
    try {
        const deleteAt = new Date(Date.now() + delayMs);
        const docs = messageIds.map(id => ({ remoteJid, messageId: id, participantJid, deleteAt }));
        await db.collection('scheduled_deletions').insertMany(docs);
    } catch (e) {}
}

async function startDeletionChecker(sock) {
    setInterval(async () => {
        if (!db || !isConnected) return;
        try {
            const now = new Date();
            const collection = db.collection('scheduled_deletions');
            const expiredTasks = await collection.find({ deleteAt: { $lte: now } }).toArray();

            for (const task of expiredTasks) {
                try {
                    await sock.sendMessage(task.remoteJid, {
                        delete: { remoteJid: task.remoteJid, fromMe: false, id: task.messageId, participant: task.participantJid }
                    });
                } catch (err) {}
                await collection.deleteOne({ _id: task._id });
            }
        } catch (e) {}
    }, 30000);
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
    let completedCount = 0, pendingCount = 0;
    let completedList = [], pendingList = [];

    for (const [name, status] of Object.entries(homeworkData)) {
        let symbol = status.flower ? '🌸' : `${status.q1 ? '1️⃣' : ''}${status.q2 ? '2️⃣' : ''}`;
        if (status.flower || status.q1 || status.q2) {
            completedCount++;
            completedList.push(`  • ${name} ${symbol}`);
        } else {
            pendingCount++;
            pendingList.push(`  • ${name}`);
        }
    }

    const deadlines = getDynamicDeadlines();
    let report = `╭──────────────────────╮\n│  🌱 花農群功課手冊公告  │\n╰──────────────────────╯\n\n`;
    report += `📜 【繳交規則 (二選一)】\n 1️⃣ 種花：每兩週分享一次 (10苗以上)\n 2️⃣ 強開：每週兩朵任意白花 (需附2個或以上座標)\n\n`;
    report += `⏳ 【本期自動截止時間】\n 🌸 Option 1 (種花) ── ${deadlines.flowerDeadline}\n 1️⃣ Option 2 (強開1) ── ${deadlines.force1Deadline}\n 2️⃣ Option 2 (強開2) ── ${deadlines.force2Deadline}\n─────────────────────────\n\n`;
    report += `📊 【當前進度統計】\n ✅ 已完成：${completedCount} 人\n ⏳ 未完成：${pendingCount} 人\n─────────────────────────\n\n`;
    report += `🌸 【已完成功課名單】\n` + (completedList.length > 0 ? completedList.join('\n') + '\n\n' : `  （無）\n\n`);
    report += `⚠️ 【尚未完成名單】\n` + (pendingList.length > 0 ? pendingList.join('\n') + '\n\n' : `  🎉 全員已完成！\n\n`);
    report += `💡 溫馨提示：種花分享訊息將於 50 分鐘後自動清理！`;
    return report;
}

app.get('/', (req, res) => {
    if (latestQR) res.send(`<html><head><meta http-equiv="refresh" content="3"></head><body style="text-align: center; margin-top: 50px;"><h2>🌱 請掃描 QR Code</h2><img src="${latestQR}" style="width: 300px; height: 300px;" /></body></html>`);
    else if (isConnected) res.send('<h2>🌱 皮皮小管家運行中！</h2>');
    else res.send('<h2>⏳ Bot 初始化中...</h2>');
});

app.listen(PORT, () => console.log(`🌐 [Web Server] Port ${PORT}`));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// 🛡️ OpenRouter 備用線路更新為 gemma-4-31b:free
async function fetchOpenRouterGemmaFree(fullPrompt) {
    const openRouterKey = process.env.OPENROUTER_API_KEY || "";
    if (!openRouterKey) throw new Error("未設定 OPENROUTER_API_KEY");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": "google/gemma-4-31b:free", 
            "messages": [
                { "role": "system", "content": "你是一位香港皮克敏小管家，請用道地廣東話簡短回覆。" },
                { "role": "user", "content": fullPrompt }
            ]
        })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

async function aiCheckHomeworkAdvanced(combinedMessageText) {
    try {
        const prompt = `你是一個《皮克敏 Bloom》作業審核 AI。請忽視訊息中的閒聊、打菇、時區、問候語等無效內容，專注檢查經緯度座標與花名。

花名定義：包含任何真實花名以及遊戲常見俗稱（如變異、紅主、藍主、黃主、混色、鼠尾草、白花等）。

審核規則：
1. 「FLOWER」：只要包含任何花名或俗稱，且同時有 3 個或以上的經緯度座標。
2. 「FORCE_OPEN_FULL」：包含「強開」或白花名稱，且**剛好包含 2 個或以上經緯度座標**。
3. 「FORCE_OPEN_NEED_MORE」：包含「強開」或白花名稱，但**僅有 1 個經緯度座標**。
4. 「NEED_FLOWER_NAME」：**完全沒有提及任何花名**，但發送了 3 個或以上大量的經緯度座標。
5. 「NONE」：以上皆不符合。

訊息內容：
"""
${combinedMessageText}
"""

請嚴格回傳：FLOWER / FORCE_OPEN_FULL / FORCE_OPEN_NEED_MORE / NEED_FLOWER_NAME / NONE`;

        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash-lite', contents: prompt });
        const result = response.text ? response.text.trim() : 'NONE';
        if (result.includes('FLOWER')) return 'flower';
        if (result.includes('FORCE_OPEN_FULL')) return 'force_open_full';
        if (result.includes('FORCE_OPEN_NEED_MORE')) return 'force_open_need_more';
        if (result.includes('NEED_FLOWER_NAME')) return 'need_flower_name';
        return null;
    } catch (e) { return null; }
}

let turtleGame = {
    active: false,
    waitingDifficulty: false,
    story: "",
    answer: "",
    wrongCount: 0,
    inactivityTimer: null
};

function resetTurtleInactivity(sock, remoteJid) {
    if (turtleGame.inactivityTimer) clearTimeout(turtleGame.inactivityTimer);
    turtleGame.inactivityTimer = setTimeout(async () => {
        if (turtleGame.active) {
            turtleGame.active = false;
            await sock.sendMessage(remoteJid, { text: `🐢 【海龜湯遊戲自動結束】\n\n由於超過 5 分鐘沒有人繼續提問，本局海龜湯自動結束！\n\n📜 正確解答：\n${turtleGame.answer}` });
        }
    }, 5 * 60 * 1000);
}

let nameVoteSession = {
    active: false,
    votes: {},
    timer: null,
    inactivityTimer: null
};

async function connectToWhatsApp() {
    await initDB();
    homeworkData = await loadHomeworkData();

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

    startDeletionChecker(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        if (qr) latestQR = await qrcode.toDataURL(qr);
        if (connection === 'close') { isConnected = false; setTimeout(() => connectToWhatsApp(), 3000); }
        else if (connection === 'open') { latestQR = ''; isConnected = true; console.log('✅ 皮皮小管家已連線！'); }
    });

    sock.ev.on('messages.upsert', async (event) => {
        try {
            for (const m of event.messages) {
                if (!m.message) continue;
                const remoteJid = m.key.remoteJid;
                if (m.key.fromMe) continue;

                const senderJid = m.key.participant || remoteJid;
                const senderPhone = senderJid.split('@')[0].replace(/[^0-9]/g, '');
                const msgObj = m.message;
                const messageContent = (msgObj.conversation || msgObj.extendedTextMessage?.text || msgObj.imageMessage?.caption || '').trim();
                if (!messageContent) continue;

                const senderName = m.pushName || '成員';

                if (messageContent === '!指令' || messageContent === '！指令') {
                    const helpText = `📜 【皮皮小管家 指令說明手冊】\n\n` +
                        `🌸 【花農群 (Flyer) 指令】\n` +
                        `• !id ── 自動綁定你的電話號碼並回應已記錄\n` +
                        `• !功課 ── 查看當前功課繳交手冊與名單\n` +
                        `• !提醒 ── 催繳未完成功課成員（精準 @ 標註）\n` +
                        `• !ai加人 [名字] ── 新增成員至手冊名單\n` +
                        `• !ai刪人 [名字] ── 從手冊名單移除成員\n` +
                        `• !ai清記錄 [名字] ── 重置該成員本期功課\n` +
                        `• !ai復原 ── 還原上一次的功課修改備份\n\n` +
                        `☕ 【咖啡室 (Cafe) 遊戲指令】\n` +
                        `• !遊戲 ── 叫出所有互動遊戲菜單\n` +
                        `• !運勢 (或回覆 1) ── 今日塔羅牌運勢占卜\n` +
                        `• !海龜湯 (或回覆 2) ── 開啟海龜湯（5分鐘無人回應自動結束）\n` +
                        `• !猜人名 (或回覆 3) ── 發起猜人名限時投票`;
                    await sock.sendMessage(remoteJid, { text: helpText }, { quoted: m });
                    continue;
                }

                if (remoteJid === GROUPS.FLYER) {
                    // 🔑 !id 自動綁定並給予感謝回饋
                    if (messageContent === '!id' || messageContent === '！id') {
                        let matchedName = Object.keys(homeworkData).find(n => n.toLowerCase() === senderName.toLowerCase());
                        if (matchedName) {
                            homeworkData[matchedName].phone = senderPhone;
                            await saveHomeworkData(homeworkData);
                            await sock.sendMessage(remoteJid, { text: `🌱 感謝！已記錄資訊：${matchedName} (電話：${senderPhone})` }, { quoted: m });
                        } else {
                            await sock.sendMessage(remoteJid, { text: `🌱 感謝！已記錄資訊：${senderName} (電話：${senderPhone})，未在名單中找到同名記錄。` }, { quoted: m });
                        }
                        continue;
                    }

                    if (messageContent === '!ai復原' || messageContent === '！ai復原') {
                        const backupDoc = await db.collection('homework_backup').findOne({ _id: 'latest_backup' });
                        if (backupDoc && backupDoc.data) {
                            homeworkData = backupDoc.data;
                            await saveHomeworkData(homeworkData);
                            await sock.sendMessage(remoteJid, { text: `🔄 已成功復原至上一次備份的功課狀態！\n\n` + generateHomeworkReport() });
                        } else {
                            await sock.sendMessage(remoteJid, { text: `❌ 找不到任何歷史備份記錄！` });
                        }
                        continue;
                    }

                    if (messageContent.startsWith('!ai加人') || messageContent.startsWith('！ai加人')) {
                        const name = messageContent.replace(/^(!ai加人|！ai加人)/, '').trim();
                        if (name) {
                            await backupHomeworkData();
                            homeworkData[name] = { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null };
                            await saveHomeworkData(homeworkData);
                            await sock.sendMessage(remoteJid, { text: `✅ 已成功新增成員「${name}」！\n\n` + generateHomeworkReport() });
                        }
                        continue;
                    }

                    if (messageContent.startsWith('!ai刪人') || messageContent.startsWith('！ai刪人')) {
                        const name = messageContent.replace(/^(!ai刪人|！ai刪人)/, '').trim();
                        if (homeworkData[name]) {
                            await backupHomeworkData();
                            delete homeworkData[name];
                            await saveHomeworkData(homeworkData);
                            await sock.sendMessage(remoteJid, { text: `🗑️ 已成功移除成員「${name}」！\n\n` + generateHomeworkReport() });
                        }
                        continue;
                    }

                    if (messageContent.startsWith('!ai清除記錄') || messageContent.startsWith('！ai清除記錄') || messageContent.startsWith('!ai清記錄') || messageContent.startsWith('！ai清記錄')) {
                        const name = messageContent.replace(/^(!ai清除記錄|！ai清除記錄|!ai清記錄|！ai清記錄)/, '').trim();
                        let matchedName = Object.keys(homeworkData).find(n => n.toLowerCase() === name.toLowerCase()) || name;
                        if (homeworkData[matchedName]) {
                            await backupHomeworkData();
                            homeworkData[matchedName].flower = false;
                            homeworkData[matchedName].q1 = false;
                            homeworkData[matchedName].q2 = false;
                            await saveHomeworkData(homeworkData);
                            await sock.sendMessage(remoteJid, { text: `🔄 已清空成員「${matchedName}」本期的功課記錄！\n\n` + generateHomeworkReport() });
                        }
                        continue;
                    }

                    if (messageContent === '!提醒' || messageContent === '！提醒') {
                        let pendingPeopleText = [];
                        let mentions = [];

                        for (const [name, status] of Object.entries(homeworkData)) {
                            if (!status.flower && !status.q1 && !status.q2) {
                                if (status.phone) {
                                    const targetJid = `${status.phone}@s.whatsapp.net`;
                                    mentions.push(targetJid);
                                    pendingPeopleText.push(`• @${status.phone} (${name})`);
                                } else {
                                    pendingPeopleText.push(`• ${name} (未輸入!id)`);
                                }
                            }
                        }

                        let text = `🔔 【功課催繳提醒】\n\n以下皮友本期尚未完成功課：\n` + (pendingPeopleText.length > 0 ? pendingPeopleText.join('\n') : `🎉 全員已完成！`);
                        text += `\n\n⚠️ 溫馨提示：本期未完成功課者將於截止後被移除，需等待下下次招人時方可重新加入喔！`;
                        
                        await sock.sendMessage(remoteJid, { text, mentions }, { quoted: m });
                        continue;
                    }

                    if (messageContent === '!功課' || messageContent === '！功課') {
                        await sock.sendMessage(remoteJid, { text: generateHomeworkReport() }, { quoted: m });
                        continue;
                    }

                    if (!userRecentMessages[senderName]) {
                        userRecentMessages[senderName] = { text: '', messageIds: [] };
                    }
                    userRecentMessages[senderName].text += '\n' + messageContent;
                    userRecentMessages[senderName].messageIds.push(m.key.id);

                    if (userRecentMessages[senderName].timer) clearTimeout(userRecentMessages[senderName].timer);

                    const currentSender = senderName;
                    const accumulatedText = userRecentMessages[currentSender].text;
                    const accumulatedMsgIds = [...userRecentMessages[currentSender].messageIds];

                    userRecentMessages[currentSender].timer = setTimeout(async () => {
                        try {
                            const result = await aiCheckHomeworkAdvanced(accumulatedText);
                            let matchedName = Object.keys(homeworkData).find(n => n.toLowerCase() === currentSender.toLowerCase()) || currentSender;
                            
                            if (!homeworkData[matchedName]) {
                                homeworkData[matchedName] = { phone: "", flower: false, q1: false, q2: false, lastForceOpenDate: null };
                            }

                            const alreadyCompleted = homeworkData[matchedName].flower || homeworkData[matchedName].q1 || homeworkData[matchedName].q2;

                            if (result === 'need_flower_name') {
                                if (alreadyCompleted) {
                                    await sock.sendMessage(remoteJid, { text: `🌱 感謝 ${currentSender} 額外分享座標！☕🌸` });
                                } else {
                                    await sock.sendMessage(remoteJid, { text: `🌱 收到 ${currentSender} 嘅座標分享！請問哩度種嘅係咩花呀？（回覆花名即可記錄功課喔！）` });
                                }
                            } else if (result === 'flower' || result === 'force_open_full') {
                                await backupHomeworkData();
                                if (result === 'flower') homeworkData[matchedName].flower = true;
                                else if (!homeworkData[matchedName].flower) {
                                    if (!homeworkData[matchedName].q1) homeworkData[matchedName].q1 = true;
                                    else homeworkData[matchedName].q2 = true;
                                }

                                await saveHomeworkData(homeworkData);

                                if (alreadyCompleted) {
                                    await sock.sendMessage(remoteJid, { text: `🌱 ${currentSender} 早已完成功課，感激你的額外分享！☕🌸` });
                                } else {
                                    await sock.sendMessage(remoteJid, { text: `✅ 收到 ${currentSender} 的功課！已更新手冊：\n\n` + generateHomeworkReport() });
                                }

                                await scheduleMultipleDeletions(remoteJid, accumulatedMsgIds, m.key.participant || remoteJid, 50 * 60 * 1000);
                            }
                        } catch (e) {
                        } finally {
                            delete userRecentMessages[currentSender];
                        }
                    }, 60000);

                    continue;
                }

                if (turtleGame.active) {
                    resetTurtleInactivity(sock, remoteJid);
                    if (messageContent === '!hint' || messageContent === '/提示') {
                        await sock.sendMessage(remoteJid, { text: `💡 【海龜湯提示】\n重點不在於湯好不好飲，而在於他以前在哪裡食過或者經歷過類似嘅事……` }, { quoted: m });
                        continue;
                    }
                }
            }
        } catch (err) {}
    });
}

connectToWhatsApp();
