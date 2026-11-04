// ==========================================
// ⏰ AI 智慧個人提醒服務 (reminderService.js) [時區與跨日修復版]
// ==========================================
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');
const dbService = require('./dbService');

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

    // 1️⃣ 查看我的提醒列表 (!我的提醒 / !提醒列表)
    if (cleanMsg === '!我的提醒' || cleanMsg === '！我的提醒' || cleanMsg === '!提醒列表' || cleanMsg === '！提醒列表') {
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
                const timeStr = new Date(r.remindAt).toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', hour12: false });
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

    // 2️⃣ 取消特定提醒 (!取消提醒 [編號])
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
        return false;
    }

    // 4️⃣ 攔截成員的「!取消」回覆（放棄當前 30 秒內的暫存確認）
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
        const currentTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' });

        // 🤖 透過 Gemini 解析自然語言（強化時區與跨日邏輯）
        const prompt = `
你是一個專業精準的智慧提醒助理。當前香港時間（HKT）是：${currentTimeStr}。
請仔細解析以下使用者輸入的提醒要求，並嚴格以 JSON 格式回傳（不要包含任何 markdown 程式碼反引號，只要純 JSON）：
使用者輸入："${cleanQuery}"

【時間計算嚴格規則】：
1. 所有時間必須以香港時間 (UTC+8) 為基準進行計算。
2. 如果使用者提到「聽日」、「明天」，請將日期正確計算為當前日期的隔天。
3. 如果提到「朝早7點」、「早上7點」，時間應設定為當天或明天的 07:00:00。
4. 絕對不能計算出小於當前時間的過去時間。

請輸出以下 JSON 結構：
{
  "success": true 或 false (如果無法理解時間或內容則為 false),
  "targetTime": "YYYY-MM-DDTHH:mm:ss.sssZ" (請根據上述規則計算出對應的絕對 ISO 時間，確保它是未來時間),
  "message": "提醒的具體事件內容",
  "timeDescription": "一段給人類看的自然時間描述，例如：明天早上 7 點、兩分鐘後"
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
                text: `⚠️ 哎呀！小管家聽唔太明你嘅提醒時間或內容～\n請試下咁講：\`!提醒我 兩分鐘後去飲水\` 或 \`!提醒我 聽日朝早7點起身\`` 
            }, { quoted: m });
            return true;
        }

        let remindAt = new Date(parsed.targetTime);

        // 🛡️ 額外防呆：如果 AI 算出來的時間小於當前時間，但使用者明明說了「聽日/明天」，手動幫它加一天
        if (remindAt <= now && (cleanQuery.includes('聽日') || cleanQuery.includes('明天'))) {
            remindAt.setDate(remindAt.getDate() + 1);
        }

        if (isNaN(remindAt.getTime()) || remindAt <= now) {
            await sock.sendMessage(remoteJid, { text: `⚠️ 設定嘅提醒時間已經過咗，或者時間格式唔正確！` }, { quoted: m });
            return true;
        }

        const timeFormatted = remindAt.toLocaleString('en-US', { 
            dateStyle: 'short', timeStyle: 'short', hour12: false, timeZone: 'Asia/Hong_Kong' 
        });

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
                // 🧹 觸發後立刻從資料庫刪除，絕不佔用空間！
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
