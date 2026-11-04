// ==========================================
// ⏰ 定時任務與清理服務 (schedulerService.js) [修正版]
// ==========================================
const cron = require('node-cron');
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');

let cronInitialized = false;
let deletionCheckerInitialized = false;

function startCronJobs(sock, ai) {
    if (cronInitialized) return; // 🛡️ 防止重連重複註冊
    cronInitialized = true;

    // ☀️ 每天早上 8:00 發送早安問候
    cron.schedule('0 8 * * *', async () => {
        try {
            console.log('⏰ 正在生成早安問候語...');
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite', // 🛡️ 修正為專案通用的穩定模型
                contents: "生成一句充滿皮克敏 Bloom 風格、溫馨且帶有香港廣東話特色的早安問候語。",
                config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
            });
            const text = response.text ? response.text.trim() : '🌱 大家早安！今天又是充滿活力種花的一天！';
            
            await sock.sendMessage(GROUPS.CAFE, { text: `【☕ 早安咖啡時間】\n\n${text}` });
            console.log('✅ 早安問候語發送成功！');
        } catch (err) {
            // 🛡️ 把詳細錯誤訊息印出來，方便排查
            console.error('❌ 早安排程執行失敗：', err.message || err);
        }
    }, { timezone: "Asia/Hong_Kong" });

    // 🌙 每天晚上 11:20 發送晚安問候（配合你 23:30 的 AI 學習，時間錯開一點點）
    cron.schedule('20 23 * * *', async () => {
        try {
            console.log('🌙 正在生成晚安問候語...');
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite', // 🛡️ 修正為專案通用的穩定模型
                contents: "生成一句充滿皮克敏 Bloom 風格、溫馨且帶有香港廣東話特色的晚安問候語。",
                config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
            });
            const text = response.text ? response.text.trim() : '🌱 大家晚安！皮克敏夥伴們要好好休息了～';
            
            await sock.sendMessage(GROUPS.CAFE, { text: `【🌙 晚安結算】\n\n${text}` });
            console.log('✅ 晚安問候語發送成功！');
        } catch (err) {
            console.error('❌ 晚安排程執行失敗：', err.message || err);
        }
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
                } catch (err) {
                    console.error('❌ 刪除訊息失敗：', err);
                }
                await collection.deleteOne({ _id: task._id });
            }
        } catch (e) {
            console.error('❌ 訊息清理排程失敗：', e);
        }
    }, 30000);
}

module.exports = {
    startCronJobs,
    startDeletionChecker
};
