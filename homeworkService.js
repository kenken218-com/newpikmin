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
        const prompt = `你是一個《皮克敏 Bloom》作業審核 AI。請分析訊息中是否包含「種花」或「強開」的功課內容。
判斷標準：
1. 「FLOWER」：只要訊息中含有任何花名、俗稱（如睡蓮、混色、紅主等），或是包含「首開」、「最後」、「x16」等種花/苗數相關字眼，且附有經緯度座標。
2. 「FORCE_OPEN_FULL」：訊息中含有「強開」、白花、或標註多個點位進行開花的座標記錄。
3. 「NEED_FLOWER_NAME」：有發送座標，但完全沒有寫明任何花名或相關字眼。
4. 「NONE」：完全無關的閒聊。

訊息內容：\n"""\n${combinedMessageText}\n"""\n請嚴格只回傳以下其中一個關鍵字：FLOWER / FORCE_OPEN_FULL / NEED_FLOWER_NAME / NONE`;

        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        const result = response.text ? response.text.trim().toUpperCase() : 'NONE';
        
        console.log('🤖 AI 審核結果:', result); // 方便在 Render Log 觀察

        if (result.includes('FLOWER')) return 'flower';
        if (result.includes('FORCE_OPEN_FULL')) return 'force_open_full';
        if (result.includes('NEED_FLOWER_NAME')) return 'need_flower_name';
        return null;
    } catch (e) { 
        console.error('❌ AI 審核發生錯誤:', e);
        return null; 
    }
}

module.exports = {
    generateHomeworkReport,
    aiCheckHomeworkAdvanced
};
