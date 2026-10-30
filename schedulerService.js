// ==========================================
// ⏰ 定時任務與清理服務 (schedulerService.js)
// ==========================================
const cron = require('node-cron');
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');

let cronInitialized = false;
let deletionCheckerInitialized = false;

function startCronJobs(sock, ai) {
    if (cronInitialized) return; // 🛡️ 防止重連重複註冊
    cronInitialized = true;

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

function startDeletionChecker(sock, db, getIsConnected) {
    if (deletionCheckerInitialized) return; // 🛡️ 防止重連重複註冊
    deletionCheckerInitialized = true;

    setInterval(async () => {
        if (!db || !getIsConnected()) return;
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

module.exports = {
    startCronJobs,
    startDeletionChecker
};