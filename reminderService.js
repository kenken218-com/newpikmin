// ==========================================
// ⏰ AI 智慧個人提醒服務 (reminderService.js) [正則強制防呆版]
// ==========================================
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');
const dbService = require('./dbService');

let pendingReminders = {};

async function handleReminderCommand(sock, m, remoteJid, senderJid, senderPhone, senderName, messageContent, db, ai) {
    const isAllowedGroup = (
        remoteJid === GROUPS.CAFE || 
        remoteJid === GROUPS.ADMIN || 
        remoteJid === GROUPS.RICE
    );
    if (!isAllowedGroup) return false;

    const cleanMsg = messageContent.trim();
    const activeDb = db || dbService.db;

    // 1️⃣ 查看我的提醒列表
    if (['!我的提醒', '！我的提醒', '!提醒列表', '！提醒列表'].includes(cleanMsg)) {
        if (!activeDb) return true;
        try {
            const myReminders = await activeDb.collection('reminders').find({ senderJid }).sort({ remindAt: 1 }).toArray();
            if (myReminders.length === 0) {
                await sock.sendMessage(remoteJid, { text: `🌱 你目前沒有任何設定中的待辦提醒喔！` }, { quoted: m });
                return true;
            }

            let listText = `📋 **【你目前的待辦提醒列表】**\n`;
            myReminders.forEach((r, idx) => {
                const parts = new Intl.DateTimeFormat('zh-HK', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(r.remindAt));
                const findPart = (type) => parts.find(p => p.type === type).value;
                const timeStr = `${findPart('year')}年${findPart('month')}月${findPart('day')}日 ${findPart('hour')}:${findPart('minute')}`;
                
                listText += `\n${idx + 1}. ⏰ **${timeStr}**\n    📝 「${r.message}」`;
            });
            listText += `\n\n💡 如果想取消某個提醒，請輸入 \`!取消提醒 [編號]\``;
            await sock.sendMessage(remoteJid, { text: listText }, { quoted: m });
        } catch (e) {
            console.error('❌ 查詢提醒列表失敗:', e);
        }
        return true;
    }

    // 2️⃣ 取消特定提醒
    if (cleanMsg.startsWith('!取消提醒') || cleanMsg.startsWith('！取消提醒')) {
        if (!activeDb) return true;
        try {
            const arg = cleanMsg.replace(/^[!！]取消提醒\s*/, '').trim();
            const index = parseInt(arg, 10);
            if (isNaN(index) || index <= 0) {
                await sock.sendMessage(remoteJid, { text: `⚠️ 請輸入正確的編號！例如：\`!取消提醒 1\`` }, { quoted: m });
                return true;
            }
            const myReminders = await activeDb.collection('reminders').find({ senderJid }).sort({ remindAt: 1 }).toArray();
            if (index > myReminders.length) {
                await sock.sendMessage(remoteJid, { text: `⚠️ 找不到編號 ${index} 的提醒！` }, { quoted: m });
                return true;
            }
            const target = myReminders[index - 1];
            await activeDb.collection('reminders').deleteOne({ _id: target._id });
            await sock.sendMessage(remoteJid, { text: `✅ 已經成功幫你取消提醒：\n「${target.message}」` }, { quoted: m });
        } catch (e) {}
        return true;
    }

    // 3️⃣ 攔截成員的「!確認」回覆
    if (cleanMsg === '!確認' || cleanMsg === '！確認') {
        if (pendingReminders[senderJid]) {
            const pending = pendingReminders[senderJid];
            clearTimeout(pending.timer);
            delete pendingReminders[senderJid];

            if (!activeDb) return true;

            try {
                await activeDb.collection('reminders').insertOne({
                    remoteJid, senderJid, senderPhone, senderName,
                    message: pending.message,
                    remindAt: pending.remindAt,
                    createdAt: new Date()
                });
                await sock.sendMessage(remoteJid, { 
                    text: `✅ 確認成功！小管家已經幫你記低：\n⏰ **${pending.timeDescription}** ── 「${pending.message}」` 
                }, { quoted: m });
            } catch (e) {
                console.error('❌ 儲存提醒到資料庫失敗:', e);
            }
            return true;
        }
        return false;
    }

    // 4️⃣ 攔截成員的「!取消」回覆
    if (cleanMsg === '!取消' || cleanMsg === '！取消') {
        if (pendingReminders[senderJid]) {
            clearTimeout(pendingReminders[senderJid].timer);
            delete pendingReminders[senderJid];
            await sock.sendMessage(remoteJid, { text: `❌ 已經取消本次提醒設定。` }, { quoted: m });
            return true;
        }
        return false;
    }

    // 5️⃣ 檢查是否為新提醒指令
    const hasPrefix = /^[!！]/.test(messageContent);
    const reminderKeywords = ['提醒', '提我', '記得提', '幫我記', '話我知'];
    const cleanQuery = messageContent.replace(/^[!！]\s*/, '').trim();
    const containsKeyword = reminderKeywords.some(keyword => cleanQuery.includes(keyword));

    if (!hasPrefix || !containsKeyword) return false;

    try {
        const now = new Date();
        const currentTimeStr = now.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });

        const prompt = `
你是一個專業精準的智慧提醒助理。當前香港時間（HKT）是：${currentTimeStr}。
請仔細解析以下使用者輸入的提醒要求，並嚴格以 JSON 格式回傳（不要包含任何 markdown 程式碼反引號，只要純 JSON）：
使用者輸入："${cleanQuery}"

【時間計算嚴格規則】：
1. 如果使用者提到「聽朝」、「明早」、「聽日」、「明天」，請將日期計算為當前日期的隔天。
2. 如果使用者提到「後日」、「大後天」、「後晚」，請計算為後兩天。
3. 請輸出「香港時間」的字串格式，不要加上 Z 或任何時區後綴，格式必須為 "YYYY-MM-DDTHH:mm:ss"。

請輸出以下 JSON 結構：
{
  "success": true 或 false,
  "targetTime": "YYYY-MM-DDTHH:mm:ss",
  "message": "提醒的具體事件內容",
  "timeDescription": "一段給人類看的自然時間描述"
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite', // 使用你確認能用的模型
            contents: prompt,
            config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
        });

        const rawText = response.text ? response.text.trim() : '';
        let parsed = null;
        
        try {
            const match = rawText.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
        } catch (jsonErr) {
            console.warn('⚠️ JSON 解析失敗:', rawText);
        }

        let remindAt = null;
        let messageText = parsed?.message || cleanQuery.replace(/提醒我|提我/g, '').trim();
        let timeDesc = parsed?.timeDescription || '你指定的時間';

        // 🛡️ 【核心無敵防呆】用正則表達式強制抓取「數字+點」！
        // 只要用戶打了數字，我們就不管 AI 算出甚麼鬼，自己算！
        const timeMatch = cleanQuery.match(/(\d{1,2})[點点:時时]\s*(\d{0,2})?[分]?/);
        if (timeMatch) {
            let hour = parseInt(timeMatch[1], 10);
            let minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
            
            // 判斷日夜
            const hasNight = /夜晚|晚上|今晚|聽晚|明晚|後晚|大後晚|夜|下午|傍晚|PM|pm/i.test(cleanQuery);
            const hasMorning = /朝|早|AM|am/i.test(cleanQuery);
            
            // 強制轉換 24 小時制
            if (hasNight && hour < 12) hour += 12;
            if (hasMorning && hour >= 12) hour -= 12;

            // 處理天數偏移
            let daysToAdd = 0;
            if (/聽日|聽朝|聽晚|明日|明早|明晚|明天/.test(cleanQuery)) daysToAdd = 1;
            if (/後日|大後日|後晚|大後晚/.test(cleanQuery)) daysToAdd = 2;

            // 以 HKT 為基準建立時間字串
            const nowHKT = new Date(now.getTime() + 8 * 3600000);
            let targetYear = nowHKT.getUTCFullYear();
            let targetMonth = nowHKT.getUTCMonth();
            let targetDay = nowHKT.getUTCDate() + daysToAdd;
            
            const dateString = `${targetYear}-${String(targetMonth+1).padStart(2,'0')}-${String(targetDay).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+08:00`;
            remindAt = new Date(dateString);

            // 如果算出來的時間比現在早，且用戶沒特別說是「今天/今晚」，自動順延到明天
            if (remindAt <= now) {
                if (!/今日|今天|今晚/.test(cleanQuery)) {
                    remindAt = new Date(remindAt.getTime() + 24 * 3600000);
                } else {
                    remindAt = new Date(remindAt.getTime() + 24 * 3600000);
                    timeDesc = `${timeDesc} (今晚已過，自動順延至明天)`;
                }
            }
        } 
        
        // 如果正則抓不到時間（例如用戶只說「兩分鐘後」），或者直接依賴 AI 的解析
        if (!remindAt || isNaN(remindAt.getTime())) {
            if (cleanQuery.includes('兩分鐘') || cleanQuery.includes('2分鐘')) {
                remindAt = new Date(now.getTime() + 2 * 60 * 1000);
                timeDesc = '2 分鐘後';
            } else if (cleanQuery.includes('五分鐘') || cleanQuery.includes('5分鐘')) {
                remindAt = new Date(now.getTime() + 5 * 60 * 1000);
                timeDesc = '5 分鐘後';
            } else if (parsed && parsed.success && parsed.targetTime) {
                let targetTimeStr = parsed.targetTime;
                if (!targetTimeStr.includes('+') && !targetTimeStr.includes('Z')) targetTimeStr += '+08:00'; 
                remindAt = new Date(targetTimeStr);
                if (remindAt <= now) remindAt = new Date(remindAt.getTime() + 24 * 3600000);
            }
        }

        // 最終檢查
        if (!remindAt || isNaN(remindAt.getTime())) {
            await sock.sendMessage(remoteJid, { 
                text: `⚠️ 哎呀！小管家聽唔太明時間～\n請試下咁講：\`!提醒我 聽朝7點起身\` 或 \`!提醒我 今晚11點加步數\`` 
            }, { quoted: m });
            return true;
        }

        // 美化時間格式
        const parts = new Intl.DateTimeFormat('zh-HK', {
            timeZone: 'Asia/Hong_Kong', year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(remindAt);
        const findPart = (type) => parts.find(p => p.type === type).value;
        const timeFormatted = `${findPart('year')}年${findPart('month')}月${findPart('day')}日 ${findPart('hour')}:${findPart('minute')}`;

        if (pendingReminders[senderJid]) clearTimeout(pendingReminders[senderJid].timer);

        const timer = setTimeout(() => { delete pendingReminders[senderJid]; }, 30000);

        pendingReminders[senderJid] = {
            remoteJid,
            message: messageText,
            remindAt,
            timeDescription: timeDesc,
            timer
        };

        await sock.sendMessage(remoteJid, { 
            text: `🌱 **【請確認提醒內容】**\n⏰ 時間：${timeDesc} (${timeFormatted})\n📝 內容：${messageText}\n\n💡 請在 **30 秒內** 回覆 **!確認** 嚟完成設定，或回覆 **!取消** 嚟放棄！` 
        }, { quoted: m });

    } catch (e) {
        console.error('❌ 解析提醒發生嚴重錯誤:', e.message);
        await sock.sendMessage(remoteJid, { text: `❌ 系統忙碌中，請稍後再試！` }, { quoted: m });
    }

    return true;
}

// 背景輪詢檢查器
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
                    await sock.sendMessage(rem.remoteJid, { text, mentions: [mentionTarget] });
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
