// ==========================================
// ⏰ AI 智慧個人提醒服務 (reminderService.js) [時區鎖定與排版完美版]
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
        if (!activeDb) {
            await sock.sendMessage(remoteJid, { text: `❌ 資料庫未連線。` }, { quoted: m });
            return true;
        }
        try {
            const myReminders = await activeDb.collection('reminders').find({ senderJid }).sort({ remindAt: 1 }).toArray();
            if (myReminders.length === 0) {
                await sock.sendMessage(remoteJid, { text: `🌱 你目前沒有任何設定中的待辦提醒喔！` }, { quoted: m });
                return true;
            }

            let listText = `📋 **【你目前的待辦提醒列表】**\n`;
            myReminders.forEach((r, idx) => {
                // 美化時間顯示
                const parts = new Intl.DateTimeFormat('zh-HK', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(r.remindAt));
                const findPart = (type) => parts.find(p => p.type === type).value;
                const timeStr = `${findPart('year')}年${findPart('month')}月${findPart('day')}日 ${findPart('hour')}:${findPart('minute')}`;
                
                listText += `\n${idx + 1}. ⏰ **${timeStr}**\n    📝 「${r.message}」`;
            });
            listText += `\n\n💡 如果想取消某個提醒，請輸入 \`!取消提醒 [編號]\`（例如：\`!取消提醒 1\`）`;
            await sock.sendMessage(remoteJid, { text: listText }, { quoted: m });
        } catch (e) {
            console.error('❌ 查詢提醒列表失敗:', e);
            await sock.sendMessage(remoteJid, { text: `❌ 查詢失敗，請稍後再試！` }, { quoted: m });
        }
        return true;
    }

    // 2️⃣ 取消特定提醒
    if (cleanMsg.startsWith('!取消提醒') || cleanMsg.startsWith('！取消提醒')) {
        if (!activeDb) {
            await sock.sendMessage(remoteJid, { text: `❌ 資料庫未連線。` }, { quoted: m });
            return true;
        }
        try {
            const arg = cleanMsg.replace(/^[!！]取消提醒\s*/, '').trim();
            const index = parseInt(arg, 10);
            if (isNaN(index) || index <= 0) {
                await sock.sendMessage(remoteJid, { text: `⚠️ 請輸入正確的編號！例如：\`!取消提醒 1\`\n（提示：可先輸入 \`!我的提醒\` 查看清單與編號）` }, { quoted: m });
                return true;
            }

            const myReminders = await activeDb.collection('reminders').find({ senderJid }).sort({ remindAt: 1 }).toArray();
            if (index > myReminders.length) {
                await sock.sendMessage(remoteJid, { text: `⚠️ 找不到編號 ${index} 的提醒！請先輸入 \`!我的提醒\` 確認清單。` }, { quoted: m });
                return true;
            }

            const target = myReminders[index - 1];
            await activeDb.collection('reminders').deleteOne({ _id: target._id });
            await sock.sendMessage(remoteJid, { text: `✅ 已經成功幫你取消提醒：\n「${target.message}」` }, { quoted: m });
        } catch (e) {
            console.error('❌ 取消提醒失敗:', e);
            await sock.sendMessage(remoteJid, { text: `❌ 取消失敗，請稍後再試！` }, { quoted: m });
        }
        return true;
    }

    // 3️⃣ 攔截成員的「!確認」回覆
    if (cleanMsg === '!確認' || cleanMsg === '！確認') {
        if (pendingReminders[senderJid]) {
            const pending = pendingReminders[senderJid];
            clearTimeout(pending.timer);
            delete pendingReminders[senderJid];

            if (!activeDb) {
                await sock.sendMessage(remoteJid, { text: `❌ 資料庫未連線，儲存失敗。` }, { quoted: m });
                return true;
            }

            try {
                await activeDb.collection('reminders').insertOne({
                    remoteJid,
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
        // 獲取絕對精準的 HKT 當前時間字串
        const currentTimeStr = now.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });

        const prompt = `
你是一個專業精準的智慧提醒助理。當前香港時間（HKT）是：${currentTimeStr}。
請仔細解析以下使用者輸入的提醒要求，並嚴格以 JSON 格式回傳（不要包含任何 markdown 程式碼反引號，只要純 JSON）：
使用者輸入："${cleanQuery}"

【粵語時間詞彙解析規則】：
- 「今晚」= 今日夜晚。
- 「聽晚」/「明晚」= 明日夜晚。
- 「後晚」= 後日夜晚。
- 「夜晚 11 點」請務必轉換為 24 小時制（即 23:00）。
- 「下午 3 點」請轉換為 15:00。
- 「今晚 12 點」請視為明日的 00:00。

【時間計算嚴格規則】：
1. 所有時間必須以香港時間 (UTC+8) 為基準進行計算。
2. 如果使用者提到「聽朝」、「明早」、「聽日」、「明天」，請將日期計算為當前日期的**隔天**。
3. 如果使用者提到「後日」、「大後天」、「後晚」，請計算為**後兩天**。
4. 請輸出「香港時間」的字串格式，**不要加上 Z 或任何時區後綴**，格式必須為 "YYYY-MM-DDTHH:mm:ss"。

請輸出以下 JSON 結構：
{
  "success": true 或 false,
  "targetTime": "YYYY-MM-DDTHH:mm:ss" (請嚴格依照上述要求輸出，例如 "2024-05-20T23:00:00"),
  "message": "提醒的具體事件內容",
  "timeDescription": "一段給人類看的自然時間描述"
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash', // 使用穩定支援的模型
            contents: prompt,
            config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
        });

        const rawText = response.text ? response.text.trim() : '';
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("AI 未回傳有效的 JSON 格式");
        const parsed = JSON.parse(match[0]);

        if (!parsed.success || !parsed.targetTime || !parsed.message) {
            await sock.sendMessage(remoteJid, { 
                text: `⚠️ 哎呀！小管家聽唔太明你嘅提醒時間或內容～\n請試下咁講：\`!提醒我 兩分鐘後去飲水\` 或 \`!提醒我 聽朝7點起身\`` 
            }, { quoted: m });
            return true;
        }

        // 🛡️ 【時區鎖定】強制將 AI 算出的時間視為香港時間 (+08:00)
        let targetTimeStr = parsed.targetTime;
        if (!targetTimeStr.includes('+') && !targetTimeStr.includes('Z')) {
            targetTimeStr += '+08:00'; 
        }
        let remindAt = new Date(targetTimeStr);

        // 🛡️ 【超級強力防呆 1】日夜修正
        const hasNightKeyword = /夜晚|晚上|今晚|聽晚|明晚|後晚|大後晚|夜|下午|傍晚|PM|pm/i.test(cleanQuery);
        const hasMorningKeyword = /朝|早|AM|am/i.test(cleanQuery);
        
        // 取得轉換為 HKT 後的小時數，避免伺服器 UTC 干擾
        let hktHours = parseInt(remindAt.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', hour: 'numeric', hour12: false }), 10);

        if (hasNightKeyword) {
            if (hktHours < 12 && hktHours !== 0) {
                remindAt.setHours(remindAt.getHours() + 12);
            }
            if (cleanQuery.includes('12') && hktHours === 12 && hasNightKeyword) {
                remindAt.setHours(remindAt.getHours() + 12); // 今晚 12 點 = 明日 00:00
            }
        }
        
        // 🛡️ 【超級強力防呆 2】日期修正 (聽朝/後日/聽晚/後晚)
        const hasAfterTomorrowKeyword = /後日|大後日|後晚|大後晚/.test(cleanQuery);
        const hasTomorrowKeyword = /聽日|聽朝|聽晚|明日|明早|明晚|明天/.test(cleanQuery);

        if (hasAfterTomorrowKeyword || hasTomorrowKeyword) {
            const expectedDaysToAdd = hasAfterTomorrowKeyword ? 2 : 1;
            let expectedDate = new Date(now.getTime() + expectedDaysToAdd * 24 * 60 * 60 * 1000);
            
            // 保留原本算出的時分
            const hktTimeParts = remindAt.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false }).split(':');
            expectedDate.setHours(parseInt(hktTimeParts[0], 10), parseInt(hktTimeParts[1], 10), 0, 0);
            
            // 如果天數不對，強制覆蓋
            const expectedDayStr = expectedDate.toLocaleDateString('en-US', { timeZone: 'Asia/Hong_Kong' });
            const actualDayStr = remindAt.toLocaleDateString('en-US', { timeZone: 'Asia/Hong_Kong' });
            
            if (expectedDayStr !== actualDayStr) {
                remindAt = expectedDate;
            }
        }

        // 🛡️ 【超級強力防呆 3】過期順延與容錯 (加入 2 分鐘容錯)
        const timeDiffMs = remindAt.getTime() - now.getTime();
        if (timeDiffMs < -120000) { // 小於 -2 分鐘（已經過去超過兩分鐘）
            if (!/今日|今天|今晚/.test(cleanQuery)) {
                remindAt.setDate(remindAt.getDate() + 1); // 自動順延一天
            } else {
                await sock.sendMessage(remoteJid, { text: `⚠️ 設定嘅時間（${parsed.timeDescription}）已經過咗啦，請設定未來嘅時間喔！` }, { quoted: m });
                return true;
            }
        }

        // 🛡️ 【日期美化】解決 11/6/26 這種怪異格式
        const parts = new Intl.DateTimeFormat('zh-HK', {
            timeZone: 'Asia/Hong_Kong',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(remindAt);
        const findPart = (type) => parts.find(p => p.type === type).value;
        const timeFormatted = `${findPart('year')}年${findPart('month')}月${findPart('day')}日 ${findPart('hour')}:${findPart('minute')}`;

        if (pendingReminders[senderJid]) {
            clearTimeout(pendingReminders[senderJid].timer);
        }

        const timer = setTimeout(() => {
            delete pendingReminders[senderJid];
        }, 30000);

        pendingReminders[senderJid] = {
            remoteJid,
            message: parsed.message,
            remindAt,
            timeDescription: parsed.timeDescription,
            timer
        };

        await sock.sendMessage(remoteJid, { 
            text: `🌱 **【請確認提醒內容】**\n⏰ 時間：${parsed.timeDescription} (${timeFormatted})\n📝 內容：${parsed.message}\n\n💡 請在 **30 秒內** 回覆 **!確認** 嚟完成設定，或回覆 **!取消** 嚟放棄！` 
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
