// ==========================================
// ⏰ 個人自訂提醒服務 (reminderService.js) - 限 Coffee 群
// ==========================================
const { GROUPS } = require('./config');

// 解析時間字串，支援 "2小時", "30分鐘", "1.5小時", "45分鐘後" 等格式
function parseTimeString(timeStr) {
    const regex = /(\d+(?:\.\d+)?)\s*(小時|時|h|分鐘|分|m)/gi;
    let totalMs = 0;
    let match;
    let found = false;

    while ((match = regex.exec(timeStr)) !== null) {
        found = true;
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        if (unit.includes('小') || unit.includes('時') || unit === 'h') {
            totalMs += value * 60 * 60 * 1000;
        } else if (unit.includes('分') || unit === 'm') {
            totalMs += value * 60 * 1000;
        }
    }
    return found ? totalMs : null;
}

async function handleReminderCommand(sock, m, remoteJid, senderJid, senderPhone, senderName, messageContent, db) {
// 🛡️ 允許在 Cafe、Admin、Rice 群使用提醒功能
    const isAllowedGroup = (
        remoteJid === GROUPS.CAFE || 
        remoteJid === GROUPS.ADMIN || 
        remoteJid === GROUPS.RICE
    );
    if (!isAllowedGroup) return false;

    const cmdRegex = /^[!！]提醒我\s+(.+)$/;
    const match = messageContent.match(cmdRegex);
    if (!match) return false;

    const contentArg = match[1].trim(); // 例如: "2小時 記得收衣服"
    const parts = contentArg.split(/\s+/);
    
    if (parts.length < 2) {
        await sock.sendMessage(remoteJid, { 
            text: `⚠️ 格式錯誤！請使用：\n!提醒我 [時間] [提醒內容]\n例如：!提醒我 2小時 記得收衣服` 
        }, { quoted: m });
        return true;
    }

    const timeStr = parts[0];
    const reminderMsg = parts.slice(1).join(' ');
    const durationMs = parseTimeString(timeStr);

    if (!durationMs || durationMs <= 0) {
        await sock.sendMessage(remoteJid, { 
            text: `⚠️ 無法識別時間格式「${timeStr}」！請使用類似「30分鐘」或「2小時」的格式。` 
        }, { quoted: m });
        return true;
    }

    const remindAt = new Date(Date.now() + durationMs);

    if (!db) {
        await sock.sendMessage(remoteJid, { text: `❌ 資料庫未連線，無法設定提醒。` }, { quoted: m });
        return true;
    }

    try {
        await db.collection('reminders').insertOne({
            remoteJid,
            senderJid,
            senderPhone,
            senderName,
            message: reminderMsg,
            remindAt,
            createdAt: new Date()
        });

        const timeFormatted = remindAt.toLocaleTimeString('en-US', { 
            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
        });

        await sock.sendMessage(remoteJid, { 
            text: `⏰ 設定成功！小呆會在約 **${timeStr}後**（即香港時間約 ${timeFormatted}）提醒你：\n「${reminderMsg}」` 
        }, { quoted: m });
    } catch (e) {
        await sock.sendMessage(remoteJid, { text: `❌ 設定提醒失敗，請稍後再試！` }, { quoted: m });
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
                    const text = `⏰ @${mentionTarget.split('@')[0]} 時間到囉！\n你之前叫小呆提醒你：\n「${rem.message}」`;
                    
                    await sock.sendMessage(rem.remoteJid, {
                        text,
                        mentions: [mentionTarget]
                    });
                } catch (err) {}
                await collection.deleteOne({ _id: rem._id });
            }
        } catch (e) {}
    }, 15000);
}

module.exports = {
    handleReminderCommand,
    startReminderChecker
};
