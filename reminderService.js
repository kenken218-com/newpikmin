// ==========================================
// ⏰ AI 智慧個人提醒服務 (reminderService.js) [雙向確認防呆版]
// ==========================================
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');
const dbService = require('./dbService');

// 🛡️ 暫存等待確認的提醒（key: senderJid，value: 提醒資料與計時器）
let pendingReminders = {};

async function handleReminderCommand(sock, m, remoteJid, senderJid, senderPhone, senderName, messageContent, db, ai) {
    // 🛡️ 允許在 Cafe、Admin、Rice 群使用提醒功能
    const isAllowedGroup = (
        remoteJid === GROUPS.CAFE || 
        remoteJid === GROUPS.ADMIN || 
        remoteJid === GROUPS.RICE
    );
    if (!isAllowedGroup) return false;

    const cleanMsg = messageContent.trim();
    const activeDb = db || dbService.db;

    // 1️⃣ 攔截成員的「!確認」回覆
    if (cleanMsg === '!確認' || cleanMsg === '！確認') {
        if (pendingReminders[senderJid]) {
            const pending = pendingReminders[senderJid];
            clearTimeout(pending.timer); // 清除 30 秒過期計時器
            delete pendingReminders[senderJid];

            if (!activeDb) {
                await sock.sendMessage(remoteJid, { text: `❌ 資料庫未連線，儲存失敗。` }, { quoted: m });
                return true;
            }

            try {
                await activeDb.collection('reminders').insertOne({
                    remoteJid: pending.remoteJid,
                    senderJid,
                    senderPhone,
                    senderName,
                    message: pending.message,
                    remindAt: pending.remindAt,
                    createdAt: new Date()
                });

                await sock.sendMessage(remoteJid, { 
                    text: `✅ 確認成功！小管家已經幫你記低：\n⏰ **${pending.timeDescription}** ── 「${pending.message}」` 
                }, { quoted: m });
            } catch (e) {
                console.error('❌ 儲存提醒到資料庫失敗:', e);
                await sock.sendMessage(remoteJid, { text: `❌ 儲存提醒發生錯誤，請稍後再試！` }, { quoted: m });
            }
            return true;
        }
        return false; // 如果沒有待確認的提醒，就讓其他邏輯處理
    }

    // 2️⃣ 攔截成員的「!取消」回覆
    if (cleanMsg === '!取消' || cleanMsg === '！取消') {
        if (pendingReminders[senderJid]) {
            clearTimeout(pendingReminders[senderJid].timer);
            delete pendingReminders[senderJid];
            await sock.sendMessage(remoteJid, { text: `❌ 已經取消本次提醒設定。` }, { quoted: m });
            return true;
        }
        return false;
    }

    // 3️⃣ 檢查是否為新提醒指令
    const hasPrefix = /^[!！]/.test(messageContent);
    const reminderKeywords = ['提醒', '提我', '記得提', '幫我記', '話我知'];
    const cleanQuery = messageContent.replace(/^[!！]\s*/, '').trim();
    const containsKeyword = reminderKeywords.some(keyword => cleanQuery.includes(keyword));

    if (!hasPrefix || !containsKeyword) return false;

    try {
        const now = new Date();
        const currentTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' });

        // 🤖 透過 Gemini 解析自然語言
        const prompt = `
你是一個智慧提醒助理。當前香港時間是：${currentTimeStr}。
請解析以下使用者輸入的提醒要求，並嚴格以 JSON 格式回傳（不要包含任何 markdown 程式碼反引號，只要純 JSON）：
使用者輸入："${cleanQuery}"

請輸出以下 JSON 結構：
{
  "success": true 或 false (如果無法理解時間或內容則為 false),
  "targetTime": "YYYY-MM-DDTHH:mm:ss.sssZ" (請根據當前時間計算出提醒觸發的絕對 ISO 時間，時區為香港 HKT / UTC+8),
  "message": "提醒的具體事件內容",
  "timeDescription": "一段給人類看的自然時間描述，例如：兩分鐘後、明天早上 7 點、11月6號"
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
        });

        const rawText = response.text ? response.text.trim() : '';
        const jsonString = rawText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(jsonString);

        if (!parsed.success || !parsed.targetTime || !parsed.message) {
            await sock.sendMessage(remoteJid, { 
                text: `⚠️ 哎呀！小管家聽唔太明你嘅提醒時間或內容～\n請試下咁講：\`!提醒我 兩分鐘後去飲水\` 或 \`!提醒我 明早7點開會\`` 
            }, { quoted: m });
            return true;
        }

        const remindAt = new Date(parsed.targetTime);
        if (isNaN(remindAt.getTime()) || remindAt <= now) {
            await sock.sendMessage(remoteJid, { text: `⚠️ 設定嘅提醒時間已經過咗，或者時間格式唔正確！` }, { quoted: m });
            return true;
        }

        const timeFormatted = remindAt.toLocaleTimeString('en-US', { 
            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
        });

        // 🛡️ 清除該成員舊的未確認計時器（如果有的話）
        if (pendingReminders[senderJid]) {
            clearTimeout(pendingReminders[senderJid].timer);
        }

        // ⏳ 設定 30 秒逾期自動清除暫存
        const timer = setTimeout(() => {
            delete pendingReminders[senderJid];
        }, 30000);

        // 📌 暫存起來，等待成員回覆 !確認
        pendingReminders[senderJid] = {
            remoteJid,
            message: parsed.message,
            remindAt,
            timeDescription: parsed.timeDescription,
            timer
        };

        // 📤 發送確認預覽邀請
        await sock.sendMessage(remoteJid, { 
            text: `🌱 **【請確認提醒內容】**\n⏰ 時間：${parsed.timeDescription} (約 ${timeFormatted})\n📝 內容：${parsed.message}\n\n💡 請在 **30 秒內** 回覆 **!確認** 嚟完成設定，或回覆 **!取消** 嚟放棄！` 
        }, { quoted: m });

    } catch (e) {
        console.error('❌ AI 解析提醒失敗:', e);
        await sock.sendMessage(remoteJid, { text: `❌ 設定提醒發生錯誤，請稍後再試！` }, { quoted: m });
    }

    return true;
}

// 背景輪詢檢查器：每 15 秒檢查一次是否有到期的提醒
let reminderCheckerInitialized = false;

function startReminderChecker(sock, db, getIsConnected) {
    if (reminderCheckerInitialized) return;
    reminderCheckerInitialized = true;

    setInterval(async () => {
        if (!db || !getIsConnected()) return;
        try {
            const now = new Date();
            const collection = db.collection('reminders');
            const dueReminders = await collection.find({ remindAt: { $lte: now } }).toArray();

            for (const rem of dueReminders) {
                try {
                    const mentionTarget = rem.senderPhone ? `${rem.senderPhone}@s.whatsapp.net` : rem.senderJid;
                    const text = `⏰ @${mentionTarget.split('@')[0]} 時間到囉！\n你之前叫小管家提醒你：\n「${rem.message}」`;
                    
                    await sock.sendMessage(rem.remoteJid, {
                        text,
                        mentions: [mentionTarget]
                    });
                } catch (err) {
                    console.error('❌ 發送提醒通知失敗:', err);
                }
                await collection.deleteOne({ _id: rem._id });
            }
        } catch (e) {
            console.error('❌ 提醒輪詢檢查失敗:', e);
        }
    }, 15000);
}

module.exports = {
    handleReminderCommand,
    startReminderChecker
};
