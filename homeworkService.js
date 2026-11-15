// ==========================================
// 🌸 花農群功課手冊服務 (homeworkService.js) [分段發送與嚴格防誤判完整版]
// ==========================================

// 💡 本期開始時間由 homeworkData.__periodStart 決定（!整期重置 時寫入）
//    若沒有記錄，才回退到原本的 10/31 預設
function getDynamicDeadlines(periodStartIso) {
    const base = periodStartIso
        ? new Date(periodStartIso)
        : new Date(new Date().getFullYear(), 9, 31); // 舊預設：今年 10/31（月份從 0 開始，9 = 10月）

    const forceDeadlineDate = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    const flowerDeadlineDate = new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000);

    const formatDate = (date) => {
        const day = date.getDate();
        const monthStr = date.toLocaleString('en-US', { month: 'short' });
        const year = date.getFullYear();
        return `${day} ${monthStr} ${year} 截`;
    };

    return {
        flowerDeadline: formatDate(flowerDeadlineDate),
        force1Deadline: formatDate(forceDeadlineDate),
        force2Deadline: formatDate(flowerDeadlineDate)
    };
}

function generateHomeworkReport(homeworkData) {
    let completedCount = 0, pendingCount = 0;
    let completedList = [], pendingList = [];

    for (const [name, status] of Object.entries(homeworkData)) {
        // 👈 跳過 meta 欄位（如 __periodStart），避免被當成成員
        if (name.startsWith('__')) continue;

        let symbol = status.flower ? '🌸' : `${status.q1 ? '1️⃣' : ''}${status.q2 ? '2️⃣' : ''}`;
        if (status.flower || status.q1 || status.q2) {
            completedCount++;
            completedList.push(`  • ${name} ${symbol}`);
        } else {
            pendingCount++;
            pendingList.push(`  • ${name}`);
        }
    }

    // 👈 從 homeworkData.__periodStart 讀本期起點
    const deadlines = getDynamicDeadlines(homeworkData.__periodStart);

    let report = `╭──────────────────────╮\n│  🌱 花農群功課手冊公告  │\n╰──────────────────────╯\n\n`;
    report += `📜 【繳交規則 (二選一)】\n 1️⃣ 種花：每兩週分享一次 (10苗以上)\n 2️⃣ 強開：每週兩朵任意白花 (需附2個或以上座標)\n\n`;
    report += `⏳ 【本期自動截止時間】\n 🌸 Option 1 (種花) ── ${deadlines.flowerDeadline}\n 1️⃣ Option 2 (強開1) ── ${deadlines.force1Deadline}\n 2️⃣ Option 2 (強開2) ── ${deadlines.force2Deadline}\n─────────────────────────\n\n`;
    report += `📊 【當前進度統計】\n ✅ 已完成：${completedCount} 人\n ⏳ 未完成：${pendingCount} 人\n─────────────────────────\n\n`;
    report += `🌸 【已完成功課名單】\n` + (completedList.length > 0 ? completedList.join('\n') + '\n\n' : `  （無）\n\n`);
    report += `⚠️ 【尚未完成名單】\n` + (pendingList.length > 0 ? pendingList.join('\n') + '\n\n' : `  🎉 全員已完成！\n\n`);
    report += `💡 溫馨提示：種花分享訊息將於 50 分鐘後自動清理！`;
    return report;
}

async function aiCheckHomeworkAdvanced(combinedMessageText, ai) {
    try {
        const prompt = `你是一個資深的《皮克敏 Bloom (Pikmin Bloom)》花農功課審核 AI。請仔細分析以下累積的訊息內容是否為玩家繳交的功課。

【💡 核心包容規則（支援分段發送）】：
玩家經常會「分多行」或「分開幾則訊息」發送功課（例如先發花名，再發座標；或者先發座標，再補花名）。
只要這段累積訊息的**整體內容中**，既包含「花名/品種/混色描述」，也同時包含「對應的經緯度座標（數字串）」，就必須視為一次**完整且合格**的功課繳交！

【重要鐵律（防誤判）】：
絕不能單憑「文字中出現花名」就當作已種花。如果訊息中只有花名或閒聊，但**絕對沒有附上任何經緯度座標**，絕對不能判定為功課！

【重要排除規則】：
如果訊息內容包含 Facebook, FB, Threads, 脆, IG, 網址連結（http/https），請直接判定為「SOCIAL_SHARE」。

【審核判定規則】：
1. 「SOCIAL_SHARE」：含有社群分享連結。
2. 「FLOWER」：整體內容同時包含花名/品種描述 **且** 包含 3 個或以上經緯度座標。
3. 「FORCE_OPEN_FULL」：整體內容含「強開」或白花名稱 **且** 包含 2 個或以上經緯度座標。
4. 「FORCE_OPEN_NEED_MORE」：含強開或白花名稱，但僅有 1 個座標。
5. 「NEED_FLOWER_NAME」：有提供 2 個或以上座標，但整段訊息完全找不到任何花名或顏色。
6. 「NONE」：純聊天、純打菇、或單純只有花名但**絕對沒有任何座標**的閒聊。

訊息內容：
"""
${combinedMessageText}
"""

請嚴格只回傳以下其中一個標籤（不要有任何多餘文字或標點）：
SOCIAL_SHARE / FLOWER / FORCE_OPEN_FULL / FORCE_OPEN_NEED_MORE / NEED_FLOWER_NAME / NONE`;

        const response = await ai.models.generateContent({ 
            model: 'gemini-3.5-flash-lite', 
            contents: prompt 
        });
        
        const result = response.text ? response.text.trim().toUpperCase() : 'NONE';

// 🧮 用正則表達式「硬性計算」這則訊息到底有幾個座標
const coordMatches = combinedMessageText.match(/[-+]?\d{1,3}\.\d+,\s*[-+]?\d{1,3}\.\d+/g) || [];
const coordCount = coordMatches.length;

console.log(`🤖 AI 原始判斷: ${result} | 🧮 程式實際算出座標數: ${coordCount}`);

if (result.includes('SOCIAL_SHARE')) return 'social_share';

// 🚨 強開的防呆：就算 AI 說可以，程式看到少於 2 個座標一樣退回！
if (result.includes('FORCE_OPEN') || combinedMessageText.includes('強開')) {
    return coordCount >= 2 ? 'force_open_full' : 'force_open_need_more';
}

// 🚨 種花的防呆：順便修復之前 NEED_FLOWER_NAME 被誤判成 FLOWER 的 Bug
if (result.includes('FLOWER') || result.includes('NEED_FLOWER_NAME')) {
    if (result.includes('NEED_FLOWER_NAME')) return 'need_flower_name';
    return coordCount >= 3 ? 'flower' : 'need_flower_name';
}

return null;
    }
}

module.exports = {
    generateHomeworkReport,
    aiCheckHomeworkAdvanced
};
