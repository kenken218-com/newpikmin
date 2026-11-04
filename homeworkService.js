
// ==========================================
// 🌸 花農群功課手冊服務 (homeworkService.js)
// ==========================================

function getDynamicDeadlines() {
    // 💡 設定以 10月31號為起點 (這裡以當年度的 10月31日 00:00 為例)
    const currentYear = new Date().getFullYear();
    const now = new Date(currentYear, 9, 31); // 註：JavaScript 的月份從 0 開始，9 代表 10月
    
    const forceDeadlineDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
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
        const prompt = `你是一個資深的《皮克敏 Bloom (Pikmin Bloom)》花農功課審核 AI。請仔細分析訊息內容是否為玩家繳交的功課。

【重要排除規則（優先判斷）】：
如果訊息內容包含 Facebook、FB、Threads、脆、IG、網址連結（http/https）、或是轉發外部社群貼文/新聞分享，**絕對不能**視為功課，請直接判定為「SOCIAL_SHARE」。

【花農語意解析規範（泛用模式）】：
只要訊息中出現以下**任何一種花種描述模式**，即視為「已包含花名/花種描述」：
1. 單寫花名或品種簡寫（不帶顏色）：如「九重」、「九重葛」、「鼠尾」、「萬壽」、「睡蓮」、「向日葵」等任何花卉名稱。
2. 顏色 + 簡寫：如「黃九」、「藍鼠」、「白蓮」、「紫萬」。
3. 混色 / 混合字眼：如「混色」、「混」、「黃混」、「彩混」。
4. 主花 / 副花簡稱：如「主花」、「副花」、「紅主」、「藍副」。
5. 苗數與開花狀態：如「首開」、「最後」、「3苗」、「開完」、「差2」等種花進度用語。

【審核判定規則】：
1. 「SOCIAL_SHARE」：含有 fb, facebook, threads, 脆, ig, http/https 連結或社群分享。
2. 「FLOWER」：含上述任意花種/混色/狀態描述，且同時包含 3 個或以上經緯度座標（無社群連結）。
3. 「FORCE_OPEN_FULL」：含「強開」或白花/白種名稱，且包含 2 個或以上經緯度座標。
4. 「FORCE_OPEN_NEED_MORE」：含「強開」或白花/白種名稱，但僅有 1 個經緯度座標。
5. 「NEED_FLOWER_NAME」：提供 3 個或以上座標，但訊息完全沒有任何花名、顏色、混色或種花相關描述。
6. 「NONE」：一般聊天、打菇、問候等非功課內容。

訊息內容：
"""
${combinedMessageText}
"""

請嚴格只回傳以下其中一個標籤（不要有任何多餘文字或標點）：
SOCIAL_SHARE / FLOWER / FORCE_OPEN_FULL / FORCE_OPEN_NEED_MORE / NEED_FLOWER_NAME / NONE`;

        const response = await ai.models.generateContent({ 
            model: 'gemini-2.5-flash', 
            contents: prompt 
        });
        
        const result = response.text ? response.text.trim().toUpperCase() : 'NONE';
        
        console.log('🤖 AI 智慧審核結果:', result);

        if (result.includes('SOCIAL_SHARE')) return 'social_share';
        if (result.includes('FLOWER')) return 'flower';
        if (result.includes('FORCE_OPEN_FULL')) return 'force_open_full';
        if (result.includes('FORCE_OPEN_NEED_MORE')) return 'force_open_need_more';
        if (result.includes('NEED_FLOWER_NAME')) return 'need_flower_name';
        return null;
    } catch (e) { 
        console.error('❌ AI 審核發生錯誤:', e);
        return null; 
    }
}
