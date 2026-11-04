// ==========================================
// 🤖 AI 聊天與長期記憶服務 (aiService.js)
// 包含：雙 AI 斷線切換、DuckDuckGo 智慧聯網（含 2026 年過濾與防 SEO 汙染）、夜間 23:30 自動學習與資料庫瘦身
// ==========================================
const { PIKMIN_SYSTEM_PROMPT } = require('./config');
const { search } = require('duckduckgo-search');
const cron = require('node-cron');

let cafeMemory = { recentHistory: [], userProfiles: {} };

async function loadLongTermMemory(db) {
    if (db) {
        try {
            const collection = db.collection('cafe_memory');
            const doc = await collection.findOne({ _id: 'memory_data' });
            if (doc) {
                cafeMemory = { recentHistory: doc.recentHistory || [], userProfiles: doc.userProfiles || {} };
            }
        } catch (e) {}
    }
    return cafeMemory;
}

async function saveLongTermMemory(db) {
    if (db) {
        try {
            const collection = db.collection('cafe_memory');
            await collection.updateOne(
                { _id: 'memory_data' },
                { $set: { recentHistory: cafeMemory.recentHistory, userProfiles: cafeMemory.userProfiles, updatedAt: new Date() } },
                { upsert: true }
            );
        } catch (e) {}
    }
}

async function recordCafeMessage(db, senderName, role, text) {
    cafeMemory.recentHistory.push({ senderName, role, text, time: new Date().toLocaleString() });
    if (cafeMemory.recentHistory.length > 40) cafeMemory.recentHistory.shift();
    await saveLongTermMemory(db);
}

// 📝 記錄 Coffee 群的所有對話（供日結學習使用）
async function logDailyCafeMessage(db, senderName, text) {
    if (!db) return;
    try {
        const todayStr = new Date().toISOString().split('T')[0]; // 格式: YYYY-MM-DD
        await db.collection('cafe_daily_logs').insertOne({
            date: todayStr,
            senderName,
            text,
            timestamp: new Date()
        });
    } catch (e) {
        console.error('❌ 記錄每日對話失敗:', e);
    }
}

// 🌙 啟動每天晚上 11:30 的自動學習排程（具備防肥大自動清理機制）
function initNightlyLearningJob(sock, db, ai) {
    cron.schedule('30 23 * * *', async () => {
        console.log('🌙 [夜間學習啟動] 正在結算今日 Coffee 群聊天紀錄...');
        if (!db) return;

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const logs = await db.collection('cafe_daily_logs').find({ date: todayStr }).toArray();

            if (!logs || logs.length === 0) {
                console.log('🌙 今日 Coffee 群沒有記錄到對話。');
                return;
            }

            // 1. 將今天大家的對話串起來交給 AI 學習
            const dailyChatText = logs.map(l => `[${l.senderName}]: ${l.text}`).join('\n');

            const learningPrompt = `你是一個群組智慧分析 AI。以下是今天 Coffee 群全體成員的所有對話紀錄：
---
${dailyChatText}
---
請分析這些對話，提取出各個活躍成員的近期興趣、常用稱呼或行為特徵。
請嚴格以 JSON 格式回傳，格式如下（不要加上 markdown 程式碼區塊標記）：
{
  "成員名字1": ["特徵1", "特徵2"],
  "成員名字2": ["特徵1"]
}`;

            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite',
                contents: learningPrompt
            });

            let analysisResult = response.text ? response.text.trim().replace(/```json/g, '').replace(/```/g, '') : '';
            const parsedProfiles = JSON.parse(analysisResult);

            // 2. 更新到長期記憶的 userProfiles 中
            for (const [name, traits] of Object.entries(parsedProfiles)) {
                if (!cafeMemory.userProfiles[name]) {
                    cafeMemory.userProfiles[name] = [];
                }
                const merged = [...new Set([...cafeMemory.userProfiles[name], ...traits])];
                cafeMemory.userProfiles[name] = merged.slice(-5); // 最多保留 5 條最新特徵
            }

            await saveLongTermMemory(db);
            console.log('🌙 [夜間學習完成] 已成功更新今日成員檔案！');

            // 3. 🧹 【防肥大關鍵】學習完成後，自動刪除今天的原始對話紀錄，保持資料庫輕量
            await db.collection('cafe_daily_logs').deleteMany({ date: todayStr });
            console.log(`🧹 [資料庫瘦身] 已自動清理 ${todayStr} 的原始聊天日誌！`);

        } catch (e) {
            console.error('❌ 執行夜間學習任務發生錯誤:', e);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Hong_Kong"
    });
}

// 🌐 透過 DuckDuckGo 進行免費即時聯網搜尋（自動附加 2026 年過濾過時資料，並拉高至 5 筆交叉比對）
async function searchWeb(query) {
    try {
        const currentYear = new Date().getFullYear(); // 自動取得今年年份（2026，明年自動變成 2027）
        const refinedQuery = `${query} ${currentYear}`;
        console.log(`🌐 [DuckDuckGo 搜尋] 正在聯網搜尋: "${refinedQuery}"`);
        const results = await search(refinedQuery, { safeSearch: 'moderate', limit: 5 });
        if (!results || results.length === 0) return '';
        return results.map(r => `標題: ${r.title}\n摘要: ${r.snippet}\n連結: ${r.url}`).join('\n\n');
    } catch (e) {
        console.error('❌ 聯網搜尋失敗:', e);
        return '';
    }
}

async function fetchOpenRouterGemmaFree(fullPrompt) {
    const openRouterKey = process.env.OPENROUTER_API_KEY || "";
    if (!openRouterKey) throw new Error("未設定 OPENROUTER_API_KEY");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": "google/gemma-4-31b-it:free", 
            "messages": [
                { "role": "system", "content": PIKMIN_SYSTEM_PROMPT },
                { "role": "user", "content": fullPrompt }
            ]
        })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

async function processAIChat(sock, remoteJid, senderName, query, messageObj, db, ai) {
    console.log(`🚀 [AI 聊天啟動] 收到來自 ${senderName} 的提問: "${query}"`);
    await recordCafeMessage(db, senderName, 'user', query);

    let webSearchContext = '';

    // 🔍 模糊意圖判斷（若只丟一句「幫我」，反問對方）
    const isAmbiguous = query === '幫我' || query === '幫幫我';
    if (isAmbiguous) {
        let replyText = `🌱 收到！請問需要皮皮小管家幫你查咩資料或處理咩事呀？直接話我知得架啦～`;
        await recordCafeMessage(db, '皮皮小管家', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
        return;
    }

    // 🌐 智慧判斷是否需要聯網搜尋（包含「幫我上網」、「幫我搵」、「幫我研究」等）
    const strongSearchKeywords = ['幫我上網', '幫我網上', '幫我搵', '幫我研究', '查一下', '搜尋', '最新'];
    const hasStrongIntent = strongSearchKeywords.some(keyword => query.includes(keyword));

    if (hasStrongIntent) {
        let searchQuery = query
            .replace(/幫我上網/g, '')
            .replace(/幫我網上/g, '')
            .replace(/幫我搵/g, '')
            .replace(/幫我研究/g, '')
            .replace(/查一下/g, '')
            .replace(/搜尋/g, '')
            .trim();
        
        if (!searchQuery) searchQuery = query;

        const searchResults = await searchWeb(searchQuery);
        if (searchResults) {
            webSearchContext = `\n【🌐 網路即時搜尋結果】:\n${searchResults}\n`;
        }
    }

    const userTraits = cafeMemory.userProfiles[senderName] || [];
    const profileText = userTraits.length > 0 ? `你對 ${senderName} 的長期印象是：[${userTraits.join(', ')}]` : `這是你新認識或正在熟悉的朋友 ${senderName}。`;
    const historyText = cafeMemory.recentHistory.slice(-25).map(m => `[${m.senderName}]: ${m.text}`).join('\n');

    const fullPrompt = `
${webSearchContext}
【成員長期檔案】:
${profileText}

【☕ 最近對話歷史】:
${historyText}

現在 ${senderName} 對你說："${query}"

⚠️ 【聯網事實查核與防汙染守則】：
1. 請仔細檢視上方【🌐 網路即時搜尋結果】。
2. **嚴防過時資料與 SEO 垃圾廣告**：如果搜尋結果看起來是內容農場、廣告、或明顯過期（非 2026 年最新）的資訊，請直接忽略它！
3. 如果搜尋結果沒有提供足夠或可靠的答案，請誠實告訴 ${senderName}「搵唔到最新可靠嘅資料」，絕對不要瞎掰或胡亂猜測。

請以「皮皮小管家」身份用道地香港廣東話親切回覆：`;

    let replyText = '';
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: fullPrompt,
            config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
        });
        replyText = response.text;
    } catch (err1) {
        console.warn('⚠️ Gemini AI 失敗，切換至 OpenRouter 備用線路...', err1.message);
        try {
            replyText = await fetchOpenRouterGemmaFree(fullPrompt);
        } catch (err2) {
            replyText = '🌱 哎呀，皮皮小管家同緊鄰嘅夥伴都塞車緊，陣間再試過啦！';
        }
    }

    if (replyText) {
        await recordCafeMessage(db, '皮皮小管家', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
    }
}

module.exports = {
    loadLongTermMemory,
    recordCafeMessage,
    logDailyCafeMessage,
    initNightlyLearningJob,
    processAIChat
};
