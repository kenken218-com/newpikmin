// ==========================================
// 🤖 AI 聊天與長期記憶服務 (aiService.js) [Tavily 聯網終極版]
// 包含：群組隔離記憶、Tavily 精準搜尋、嚴格防瞎編 Prompt、夜間 23:30 自動學習
// ==========================================
const { PIKMIN_SYSTEM_PROMPT } = require('./config');
const { tavily } = require('@tavily/core');
const cron = require('node-cron');

// 🛡️ 以 remoteJid (群組ID) 為維度的獨立記憶快取，防止多群組對話混淆
let roomMemories = {}; 

async function getRoomMemory(db, remoteJid) {
    if (!roomMemories[remoteJid]) {
        let mem = { recentHistory: [], userProfiles: {} };
        if (db) {
            try {
                const collection = db.collection('cafe_memory');
                const doc = await collection.findOne({ _id: `memory_${remoteJid}` });
                if (doc) {
                    mem = { recentHistory: doc.recentHistory || [], userProfiles: doc.userProfiles || {} };
                }
            } catch (e) {
                console.error(`❌ 載入長期記憶失敗 [${remoteJid}]:`, e);
            }
        }
        roomMemories[remoteJid] = mem;
    }
    return roomMemories[remoteJid];
}

async function saveLongTermMemory(db, remoteJid) {
    if (db && roomMemories[remoteJid]) {
        try {
            const collection = db.collection('cafe_memory');
            await collection.updateOne(
                { _id: `memory_${remoteJid}` },
                { $set: { recentHistory: roomMemories[remoteJid].recentHistory, userProfiles: roomMemories[remoteJid].userProfiles, updatedAt: new Date() } },
                { upsert: true }
            );
        } catch (e) {
            console.error(`❌ 儲存長期記憶失敗 [${remoteJid}]:`, e);
        }
    }
}

async function recordMessageToMemory(db, remoteJid, senderName, role, text) {
    const memory = await getRoomMemory(db, remoteJid);
    memory.recentHistory.push({ senderName, role, text, time: new Date().toLocaleString() });
    if (memory.recentHistory.length > 40) memory.recentHistory.shift();
    await saveLongTermMemory(db, remoteJid);
}

// 📝 記錄 Coffee 群的所有對話（供日結學習使用）
async function logDailyCafeMessage(db, remoteJid, senderName, text) {
    if (!db) return;
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        await db.collection('cafe_daily_logs').insertOne({
            roomJid: remoteJid,
            date: todayStr,
            senderName,
            text,
            timestamp: new Date()
        });
    } catch (e) {
        console.error('❌ 記錄每日對話失敗:', e);
    }
}

// 🌙 啟動每天晚上 11:30 的自動學習排程
function initNightlyLearningJob(sock, db, ai) {
    cron.schedule('30 23 * * *', async () => {
        console.log('🌙 [夜間學習啟動] 正在結算各群組今日聊天紀錄...');
        if (!db) return;

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const logs = await db.collection('cafe_daily_logs').find({ date: todayStr }).toArray();

            if (!logs || logs.length === 0) {
                console.log('🌙 今日各群組沒有記錄到對話。');
                return;
            }

            const roomsMap = {};
            logs.forEach(l => {
                if (!roomsMap[l.roomJid]) roomsMap[l.roomJid] = [];
                roomsMap[l.roomJid].push(l);
            });

            for (const [remoteJid, roomLogs] of Object.entries(roomsMap)) {
                const dailyChatText = roomLogs.map(l => `[${l.senderName}]: ${l.text}`).join('\n');
                const memory = await getRoomMemory(db, remoteJid);

                const learningPrompt = `你是一個群組智慧分析 AI。以下是今天該群組全體成員的所有對話紀錄：
---
${dailyChatText}
---
請分析這些對話，提取出各個活躍成員的近期興趣、常用稱呼或行為特徵。
請嚴格以 JSON 格式回傳，格式如下（不要加上 markdown 程式碼區塊標記）：
{
  "成員名字1": ["特徵1", "特徵2"],
  "成員名字2": ["特徵1"]
}`;

                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.5-flash-lite',
                        contents: learningPrompt
                    });

                    let analysisResult = response.text ? response.text.trim().replace(/```json/g, '').replace(/```/g, '') : '';
                    const parsedProfiles = JSON.parse(analysisResult);

                    for (const [name, traits] of Object.entries(parsedProfiles)) {
                        if (!memory.userProfiles[name]) memory.userProfiles[name] = [];
                        const merged = [...new Set([...memory.userProfiles[name], ...traits])];
                        memory.userProfiles[name] = merged.slice(-5);
                    }

                    await saveLongTermMemory(db, remoteJid);
                    console.log(`🌙 [夜間學習完成] 已更新群組 ${remoteJid} 的成員檔案！`);
                } catch (err) {
                    console.error(`❌ 處理群組 ${remoteJid} 夜間學習失敗:`, err);
                }
            }

            await db.collection('cafe_daily_logs').deleteMany({ date: todayStr });
            console.log(`🧹 [資料庫瘦身] 已自動清理 ${todayStr} 的所有群組原始日誌！`);

        } catch (e) {
            console.error('❌ 執行夜間學習任務發生錯誤:', e);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Hong_Kong"
    });
}

// 🌐 透過 Tavily API 進行精準聯網搜尋（包含智慧摘要）
async function searchWeb(query) {
    try {
        // 清理關鍵字，避免把口語帶進去搜尋
        let cleanQuery = query
            .replace(/幫我上網/g, '')
            .replace(/幫我網上/g, '')
            .replace(/幫我搵/g, '')
            .replace(/幫我研究/g, '')
            .replace(/查一下/g, '')
            .replace(/搜尋/g, '')
            .replace(/查/g, '')
            .replace(/今日/g, '')
            .trim();
            
        if (!cleanQuery) cleanQuery = query;

        console.log(`🌐 [Tavily 搜尋] 正在聯網搜尋: "${cleanQuery}"`);

        // 初始化 Tavily 客戶端 (從環境變數讀取)
        const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

        const response = await tvly.search(cleanQuery, {
            searchDepth: "basic",   // basic 每次消耗 1 credit，對 Render 效能最好
            maxResults: 5,          // 抓取前 5 條結果
            includeAnswer: true     // 🔥 關鍵：讓 Tavily 直接生成結構化摘要，輕量模型最愛
        });

        // 1. 優先使用 Tavily 生成的綜合摘要
        if (response.answer) {
            return `【Tavily 搜尋摘要】:\n${response.answer}`;
        }

        // 2. 如果沒有摘要，則回傳具體的網頁標題與內容
        if (response.results && response.results.length > 0) {
            return response.results
                .slice(0, 4)
                .map(r => `標題: ${r.title}\n摘要: ${r.content}`)
                .join('\n\n');
        }
        return '';

    } catch (e) {
        console.error('❌ Tavily 聯網搜尋失敗:', e.message);
        return '';
    }
}

// 🛡️ 備用 AI 線路 (OpenRouter)
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

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter HTTP error! status: ${response.status}, body: ${errText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

// 🚀 主處理器：AI 聊天
async function processAIChat(sock, remoteJid, senderName, query, messageObj, db, ai) {
    console.log(`🚀 [AI 聊天啟動] 收到來自 [${senderName}] 的提問: "${query}"`);

    const memory = await getRoomMemory(db, remoteJid);

    // 🔍 模糊意圖判斷
    const isAmbiguous = query === '幫我' || query === '幫幫我';
    if (isAmbiguous) {
        let replyText = `🌱 收到！請問需要皮皮小管家幫你查咩資料或處理咩事呀？直接話我知得架啦～`;
        await recordMessageToMemory(db, remoteJid, senderName, 'user', query);
        await recordMessageToMemory(db, remoteJid, '皮皮小管家', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
        return;
    }

    // 🌐 智慧判斷聯網搜尋
    let webSearchContext = '';
    const strongSearchKeywords = ['幫我上網', '幫我網上', '幫我搵', '幫我研究', '查一下', '搜尋', '最新', '新聞', '今日', '咩事', '發生', '大事'];
    const hasStrongIntent = strongSearchKeywords.some(keyword => query.includes(keyword));

    if (hasStrongIntent) {
        const searchResults = await searchWeb(query);
        
        // 🛡️ 嚴格區分：有沒有搜到東西？
        if (searchResults && searchResults.trim().length > 10) {
            webSearchContext = `\n【🌐 網路即時搜尋結果】:\n${searchResults}\n`;
        } else {
            webSearchContext = `\n【⚠️ 系統緊急提示】: 本次聯網搜尋失敗，完全沒有抓到任何資料。\n`;
        }
    }

    const userTraits = memory.userProfiles[senderName] || [];
    const profileText = userTraits.length > 0 ? `你對 ${senderName} 的長期印象是：[${userTraits.join(', ')}]` : `這是你新認識或正在熟悉的朋友 ${senderName}。`;
    const historyText = memory.recentHistory.slice(-25).map(m => `[${m.senderName}]: ${m.text}`).join('\n');

    const fullPrompt = `
${webSearchContext}
【成員長期檔案】:
${profileText}

【☕ 最近對話歷史】:
${historyText}

現在 ${senderName} 對你說："${query}"

⚠️ 【嚴格回答守則】：
1. 如果你看到【⚠️ 系統緊急提示】，代表你現在沒有聯網。請直接用廣東話承認：「哎呀，我暫時連唔到新聞網/網路，搵唔到最新嘅資料呀，陣間再幫你試下！」，**絕對不准**用「大型盛事」、「民生政策」、「各項措施」等空泛廢話來敷衍。
2. 如果你看到【🌐 網路即時搜尋結果】，請從中提取 **1 到 2 件最核心的具體事件**（例如：邊個官員講咗咩、邊度發生咗咩事、具體政策係咩），用香港廣東話總結給我聽。
3. 請保持「皮皮小管家」親切活潑的語氣，但內容必須「有料」，不要講廢話。
請回覆：`;

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
            console.error('❌ OpenRouter 備用線路也發生錯誤:', err2);
            replyText = '🌱 哎呀，皮皮小管家同緊鄰嘅夥伴都塞車緊，陣間再試過啦！';
        }
    }

    if (replyText) {
        await recordMessageToMemory(db, remoteJid, senderName, 'user', query);
        await recordMessageToMemory(db, remoteJid, '皮皮小管家', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
    }
}

module.exports = {
    loadLongTermMemory: async (db) => {
        return roomMemories;
    },
    recordCafeMessage: recordMessageToMemory,
    logDailyCafeMessage,
    initNightlyLearningJob,
    processAIChat
};
