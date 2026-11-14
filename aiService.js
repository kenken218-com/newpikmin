// ==========================================
// 🤖 AI 聊天與長期記憶服務 (aiService.js) [深度記憶與精準時空版]
// 包含：
// 1. 每位成員保留 25 條智慧整合濃縮特徵
// 2. 新增「群組大事件簿」記錄咖啡室經典日常（保留 30 條）
// 3. 短期對話歷史精簡為最近 25 句（資料庫與 Prompt 同步）
// 4. 嚴格限制「聚焦當下、禁止無故翻舊帳」
// 5. 注入精準香港時間 (HKT) 與世界標準時間 (UTC+0) 供時差與日期計算
// ==========================================
const { PIKMIN_SYSTEM_PROMPT, GROUPS } = require('./config');
const { updateAndGetMimikiStatusText } = require('./mimikiState');
const { tavily } = require('@tavily/core');
const cron = require('node-cron');

// 🛡️ 以 remoteJid (群組ID) 為維度的獨立記憶快取，防止多群組對話混淆
let roomMemories = {}; 

async function getRoomMemory(db, remoteJid) {
    if (!roomMemories[remoteJid]) {
        let mem = { recentHistory: [], userProfiles: {}, groupMilestones: [] };
        if (db) {
            try {
                const collection = db.collection('cafe_memory');
                const doc = await collection.findOne({ _id: `memory_${remoteJid}` });
                if (doc) {
                    mem = { 
                        recentHistory: doc.recentHistory || [], 
                        userProfiles: doc.userProfiles || {},
                        groupMilestones: doc.groupMilestones || []
                    };
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
                { 
                    $set: { 
                        recentHistory: roomMemories[remoteJid].recentHistory, 
                        userProfiles: roomMemories[remoteJid].userProfiles, 
                        groupMilestones: roomMemories[remoteJid].groupMilestones || [],
                        updatedAt: new Date() 
                    } 
                },
                { upsert: true }
            );
        } catch (e) {
            console.error(`❌ 儲存長期記憶失敗 [${remoteJid}]:`, e);
        }
    }
}

async function recordMessageToMemory(db, remoteJid, senderName, role, text) {
    const memory = await getRoomMemory(db, remoteJid);
    memory.recentHistory.push({ senderName, role, text, time: new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }) });
    // ✅ 升級 3：短期對話歷史精簡為最近 25 句
    if (memory.recentHistory.length > 25) memory.recentHistory.shift();
    await saveLongTermMemory(db, remoteJid);
}

// 📝 記錄群組的所有對話（供日結學習使用）
async function logDailyCafeMessage(db, remoteJid, senderName, text) {
    if (!db) return;
    try {
        // 使用香港時區日期作為日誌分組鍵
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
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

// 🌙 啟動每天晚上 11:30 的自動學習排程（升級：25條智慧整合特徵 + 群組大事件簿）
function initNightlyLearningJob(sock, db, ai) {
    cron.schedule('30 23 * * *', async () => {
        console.log('🌙 [夜間學習啟動] 正在結算各群組今日聊天紀錄...');
        if (!db) return;

        try {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
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
                if (!memory.groupMilestones) memory.groupMilestones = [];

                // 把既有特徵一併交給 AI 進行去重與整合，防止重複標籤佔位
                const existingProfilesJson = JSON.stringify(memory.userProfiles);

                const learningPrompt = `你是一個群組智慧記憶整理 AI。請根據「既有成員檔案」以及「今日 (${todayStr}) 群組對話紀錄」，進行資料整合與事件提煉。

【既有成員檔案】:
${existingProfilesJson}

【今日 (${todayStr}) 群組對話紀錄】:
---
${dailyChatText}
---

請完成以下兩項任務：
1. **整合更新成員特徵 (profiles)**：為今日有發言的活躍成員提取新特徵、興趣、本命皮克敏、生活習慣或近況，並與「既有成員檔案」合併。**請自動去重並將相似的零碎資訊整合成精煉短句**，每位成員最多保留 25 條最具代表性的特徵。
2. **提煉今日群組大事件 (milestones)**：從今日對話中，總結 1 到 2 件最值得紀念的群組大事、經典笑料或集體成就（格式為「[${todayStr}] 事件描述」；若今日純屬日常瑣碎問候無特別事件，可回傳空陣列 []）。

請嚴格以純 JSON 格式回傳（不要加上 \`\`\`json 標記或任何多餘文字）：
{
  "profiles": {
    "成員名字1": ["整合後特徵1", "整合後特徵2"],
    "成員名字2": ["整合後特徵1"]
  },
  "milestones": [
    "[${todayStr}] 今日發生的重要事件或經典趣事"
  ]
}`;

                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.5-flash-lite',
                        contents: learningPrompt
                    });

                    let analysisResult = response.text ? response.text.trim().replace(/```json/g, '').replace(/```/g, '').trim() : '';
                    const parsedData = JSON.parse(analysisResult);

                    // ✅ 升級 1：更新整合後的成員檔案，每人上限提升至 25 條
                    if (parsedData.profiles) {
                        for (const [name, traits] of Object.entries(parsedData.profiles)) {
                            if (!Array.isArray(traits)) continue;
                            const oldTraits = memory.userProfiles[name] || [];
                            const merged = [...new Set([...oldTraits, ...traits])];
                            memory.userProfiles[name] = merged.slice(-25);
                        }
                    }

                    // ✅ 升級 2：寫入群組大事件簿（保留最新 30 條經典回憶）
                    if (Array.isArray(parsedData.milestones) && parsedData.milestones.length > 0) {
                        const mergedMilestones = [...new Set([...memory.groupMilestones, ...parsedData.milestones])];
                        memory.groupMilestones = mergedMilestones.slice(-30);
                    }

                    await saveLongTermMemory(db, remoteJid);
                    console.log(`🌙 [夜間學習完成] 已更新群組 ${remoteJid} 的 25 條成員檔案與大事件簿！`);
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

        const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

        const response = await tvly.search(cleanQuery, {
            searchDepth: "basic",
            maxResults: 15,
            includeAnswer: true
        });

        if (response.answer) {
            return `【Tavily 搜尋摘要】:\n${response.answer}`;
        }

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
        let replyText = `🌱 收到！請問需要敏敏幫你查咩資料或處理咩事呀？直接話我知得架啦～`;
        await recordMessageToMemory(db, remoteJid, senderName, 'user', query);
        await recordMessageToMemory(db, remoteJid, '敏敏', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
        return;
    }

    // 🌐 智慧判斷聯網搜尋
    let webSearchContext = '';
    const strongSearchKeywords = ['幫我上網', '幫我網上', '幫我搵', '幫我研究', '查一下', '搜尋', '最新', '新聞', '今日', '咩事', '發生', '大事'];
    const hasStrongIntent = strongSearchKeywords.some(keyword => query.includes(keyword));

    if (hasStrongIntent) {
        const searchResults = await searchWeb(query);
        
        if (searchResults && searchResults.trim().length > 10) {
            webSearchContext = `\n【🌐 網路即時搜尋結果】:\n${searchResults}\n`;
        } else {
            webSearchContext = `\n【⚠️ 系統緊急提示】: 本次聯網搜尋失敗，完全沒有抓到任何資料。\n`;
        }
    }

    // ==========================================
    // ✅ 升級 5：取得精準香港時間與 UTC+0 標準時間（供時差與日期計算）
    // ==========================================
    const now = new Date();
    const hkFullTime = now.toLocaleString('zh-HK', { 
        timeZone: 'Asia/Hong_Kong', 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false 
    });
    const utcFullTime = now.toLocaleString('en-GB', { 
        timeZone: 'UTC', 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false 
    });

    // ☕ 僅在「咖啡室群組 (CAFE)」啟用敏敏飽足度與好感度系統
    let mimikiStatusText = '';
    if (remoteJid === GROUPS.CAFE) {
        mimikiStatusText = await updateAndGetMimikiStatusText(db, remoteJid, query, senderName);
    }

    // 整理長期檔案與群組大事件簿
    const userTraits = memory.userProfiles[senderName] || [];
    const profileText = userTraits.length > 0 
        ? `你對 ${senderName} 的長期累積印象（共 ${userTraits.length} 條）：\n- ${userTraits.join('\n- ')}` 
        : `這是你新認識或正在熟悉的朋友 ${senderName}。`;

    const milestones = memory.groupMilestones || [];
    const milestoneText = milestones.length > 0
        ? `【📖 群組大事件簿（經典回憶）】:\n${milestones.join('\n')}`
        : `【📖 群組大事件簿】: 暫無特別大事紀錄。`;

    // ✅ 升級 3：精簡為最近 25 句對話歷史
    const historyText = memory.recentHistory.slice(-25).map(m => `[${m.senderName}]: ${m.text}`).join('\n');

    const fullPrompt = `
【🕒 系統精準時間與日期基準】：
- 香港時間 (HKT / UTC+8)：${hkFullTime}
- 世界協調時間 (UTC+0)：${utcFullTime}

${mimikiStatusText}

${webSearchContext}
【👤 成員長期檔案（背景底蘊）】:
${profileText}

${milestoneText}

【💬 最近對話歷史（最多 25 句）】:
${historyText}

現在 ${senderName} 對你說："${query}"

⚠️ 【嚴格回答守則】：
1. **聚焦當下，嚴禁莫名其妙翻舊帳**：你的回覆必須緊扣【現在 ${senderName} 對你說】的最新這句話！上方【成員長期檔案】與【群組大事件簿】只是你的內心底蘊——**除非對方主動問起往事、或當前話題與某條記憶直接相關，否則絕對禁止把無關的舊病痛、舊問題或前幾天的閒聊硬扯進對話裡！** 若對方只是單純打招呼或餵食，就開開心心針對當下回應即可，不要囉嗦長氣。
2. **清晰的日期、時間與全球時區認知**：遇到詢問幾點、星期幾、日期或哪個國家已踏入新的一天時，**嚴禁盲信網路搜尋結果裡的隨機日期**！請直接根據上方【世界協調時間 (UTC+0)】與【香港時間 (HKT)】進行精準的時區加減計算（例如 UTC+14 基里巴斯萊恩群島、UTC+13 紐西蘭夏令時間/薩摩亞/湯加、UTC+12 斐濟等），給出 100% 準確的日期與時間答案。
3. **聯網搜尋處理**：若看到【⚠️ 系統緊急提示】，代表聯網失敗，請直接用廣東話坦白承認（「哎呀，我暫時連唔到網路，搵唔到最新嘅資料呀，陣間再試下！」），絕不用空泛廢話敷衍。若看到【🌐 網路即時搜尋結果】，請提取核心具體事件用香港廣東話總結。
4. **語氣與人設規範**：${remoteJid === GROUPS.CAFE ? '請結合你的【敏敏即時狀態與好感度】（例如飽足度 100% 時要開心撒嬌拒絕繼續餵食；肚餓時討精華；對好感度高等級成員更親切），保持溫柔可愛、元氣滿滿的咖啡室少女看板娘語氣。' : '請保持溫柔可愛、元氣滿滿的「敏敏」語氣，內容精準有料。'} **禁止**使用「餵大佬呀」等粗魯或過度嘲諷的字眼。
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
            replyText = '🌱 哎呀，敏敏同緊鄰嘅夥伴都塞車緊，陣間再試過啦！';
        }
    }

    if (replyText) {
        await recordMessageToMemory(db, remoteJid, senderName, 'user', query);
        await recordMessageToMemory(db, remoteJid, '敏敏', 'assistant', replyText);
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
