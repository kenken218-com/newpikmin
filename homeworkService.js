// ==========================================
// 🌸 花農群功課手冊服務 (homeworkService.js)
// ==========================================

function getDynamicDeadlines() {
    const now = new Date(); // 以今天（2026年10月31日）為起點
    
    // 強開為 7 天後
    const forceDeadlineDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    // 種花為 14 天後 (兩週)
    const flowerDeadlineDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

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
        let symbol = status.flower ? '🌸' : `${status.q1 ? '1️⃣' : ''}${status.q2 ? '2️⃣' : ''}`;
        if (status.flower || status.q1 || status.q2) {
            completedCount++;
            completedList.push(`  • ${name} ${symbol}`);
        } else {
            pendingCount++;
            pendingList.push(`  • ${name}`);
        }
    }

    const deadlines = getDynamicDeadlines();
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
        const prompt = `你是一個《皮克敏 Bloom》作業審核 AI。請忽視閒聊、打菇、時區等無效內容，專注檢查經緯度座標與花名。
花名定義：包含任何真實花名以及遊戲常見俗稱（如變異、紅主、藍主、黃主、混色、鼠尾草、白花等）。
審核規則：
1. 「FLOWER」：含花名或俗稱，且同時有 3 個或以上經緯度座標。
2. 「FORCE_OPEN_FULL」：含「強開」或白花名稱，且剛好包含 2 個或以上經緯度座標。
3. 「FORCE_OPEN_NEED_MORE」：含「強開」或白花名稱，但僅有 1 個經緯度座標。
4. 「NEED_FLOWER_NAME」：完全沒有提及花名，但發送了 3 個或以上座標。
5. 「NONE」：不符合。
訊息：\n"""\n${combinedMessageText}\n"""\n請嚴格回傳：FLOWER / FORCE_OPEN_FULL / FORCE_OPEN_NEED_MORE / NEED_FLOWER_NAME / NONE`;

        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        const result = response.text ? response.text.trim() : 'NONE';
        if (result.includes('FLOWER')) return 'flower';
        if (result.includes('FORCE_OPEN_FULL')) return 'force_open_full';
        if (result.includes('FORCE_OPEN_NEED_MORE')) return 'force_open_need_more';
        if (result.includes('NEED_FLOWER_NAME')) return 'need_flower_name';
        return null;
    } catch (e) { return null; }
}

module.exports = {
    generateHomeworkReport,
    aiCheckHomeworkAdvanced
};
