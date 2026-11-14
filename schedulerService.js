// ==========================================
// ⏰ 定時任務與清理服務 (schedulerService.js) [防斷線失效終極修正版]
// ==========================================
const cron = require('node-cron');
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');

let cronInitialized = false;
let deletionCheckerInitialized = false;

function startCronJobs(getSock, ai) {
    if (cronInitialized) return;
    cronInitialized = true;

    // ☀️ 每天早上 8:00 發送早安問候
    cron.schedule('0 8 * * *', async () => {
        const sock = typeof getSock === 'function' ? getSock() : getSock;
        if (!sock) return;
        try {
            console.log('⏰ 正在生成早安問候語...');
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite',
                contents: "生成一句充滿皮克敏 Bloom 風格、溫馨且帶有香港廣東話特色的早安問候語。",
                config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
            });
            const text = response.text ? response.text.trim() : '🌱 大家早安！今天又是充滿活力種花的一天！';
            
            await sock.sendMessage(GROUPS.CAFE, { text: `【☕ 早安咖啡時間】\n\n${text}` });
            console.log('✅ 早安問候語發送成功！');
        } catch (err) {
            console.error('❌ 早安排程執行失敗：', err.message || err);
        }
    }, { timezone: "Asia/Hong_Kong" });

    // 🌙 每天晚上 11:20 發送晚安問候
    cron.schedule('20 23 * * *', async () => {
        const sock = typeof getSock === 'function' ? getSock() : getSock;
        if (!sock) return;
        try {
            console.log('🌙 正在生成晚安問候語...');
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite',
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

function startDeletionChecker(getSock, db, getIsConnected) {
    if (deletionCheckerInitialized) return;
    deletionCheckerInitialized = true;

    setInterval(async () => {
        const sock = typeof getSock === 'function' ? getSock() : getSock;
        if (!sock || !db || !getIsConnected()) return;
        try {
            const now = new Date();
            const collection = db.collection('scheduled_deletions');
            const expiredTasks = await collection.find({ deleteAt: { $lte: now } }).toArray();

            for (const task of expiredTasks) {
                try {
                    const deleteKey = {
                        remoteJid: task.remoteJid,
                        fromMe: false,
                        id: task.messageId
                    };
                    // 只有當 participantJid 真的是個人 JID（不是群組 @g.us）時才帶入
                    if (task.participantJid && !task.participantJid.endsWith('@g.us')) {
                        deleteKey.participant = task.participantJid;
                    }

                    await sock.sendMessage(task.remoteJid, { delete: deleteKey });
                    console.log(`🧹 已成功清理過期種花訊息: ${task.messageId}`);
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
