// ==========================================
// ⏰ 定時任務與清理服務 (schedulerService.js) [早安隨機防斷線版]
// ==========================================
const cron = require('node-cron');
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');

let cronInitialized = false;
let deletionCheckerInitialized = false;

function startCronJobs(getSock, ai, db) { // 👈 注意：這裡新增了 db 參數
    if (cronInitialized) return;
    cronInitialized = true;

    // ☀️ 每天早上 07:00 ~ 07:59 之間隨機時間發送早安
    cron.schedule('*/5 7 * * *', async () => {
        const sock = typeof getSock === 'function' ? getSock() : getSock;
        if (!sock || !db) return;

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
        const doneFlagId = `morning_done_${todayStr}`;
        const randMinFlagId = `morning_rand_${todayStr}`;

        try {
            // 1. 檢查今天是否已發過
            const doneFlag = await db.collection('bot_flags').findOne({ _id: doneFlagId });
            if (doneFlag) return;

            // 2. 如果還沒抽籤，先抽一個 0~55 之間的 5 的倍數作為目標分鐘
            let randDoc = await db.collection('bot_flags').findOne({ _id: randMinFlagId });
            if (!randDoc) {
                const randomIndex = Math.floor(Math.random() * 12); // 0~11
                const targetMinute = randomIndex * 5; // 0, 5, 10... 55
                await db.collection('bot_flags').insertOne({ _id: randMinFlagId, targetMinute });
                randDoc = { targetMinute };
            }

            // 3. 取得香港當前分鐘數
            const now = new Date();
            const hkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
            const currentMinute = hkTime.getMinutes();

            // 4. 如果還沒到目標分鐘，且不是最後保底（55分），就繼續等
            if (currentMinute < randDoc.targetMinute && currentMinute !== 55) return;

            // 5. 執行發送早安
            console.log(`☀️ [早安排程] 敏敏在 07:${String(currentMinute).padStart(2, '0')} 醒來發送早安～`);
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite',
                contents: "生成一句充滿皮克敏 Bloom 風格、溫馨且帶有香港廣東話特色的早安問候語。",
                config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
            });
            const text = response.text ? response.text.trim() : '🌱 大家早安！今天又是充滿活力種花的一天！';
            
            await sock.sendMessage(GROUPS.CAFE, { text: `【☕ 早安咖啡時間】\n\n${text}` });
            
            // 6. 標記為已發送
            await db.collection('bot_flags').updateOne(
                { _id: doneFlagId }, { $set: { executedAt: new Date() } }, { upsert: true }
            );

        } catch (err) {
            console.error('❌ 早安排程執行失敗：', err.message || err);
        }
    }, { timezone: "Asia/Hong_Kong" });

    // ⚠️ 注意：原本的 23:20 固定晚安已經被刪除，統一由 aiService.js 處理！
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