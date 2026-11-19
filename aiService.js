// ==========================================
// 🤖 AI 聊天與長期記憶服務 (aiService.js) [自然擬真＋精靈特色平衡旗艦版]
// 包含：防斷線動態Socket、25%精靈小動作、隱性背景天氣快取、自然短句、JID防改名、餵食回饋、睡眠模式、隨機夜間睡眠
// ==========================================
const { PIKMIN_SYSTEM_PROMPT, GROUPS } = require('./config');
const { updateAndGetMimikiStatusText } = require('./mimikiState');
const { tavily } = require('@tavily/core');
const cron = require('node-cron');

let roomMemories = {};

// 🌤️ 隱性背景天氣快取（20 分鐘有效，避免每次對話都即時打 API）
let cachedWeatherContext = {
    text: '',
    fetchedAt: 0
};
const WEATHER_CACHE_TTL_MS = 20 * 60 * 1000;

// 😴 睡眠狀態回覆冷卻記錄：key = remoteJid, value = timestamp
const sleepNoticeCooldown = {};

function extractSenderJid(messageObj, fallbackName) {
    if (!messageObj || !messageObj.key) return fallbackName;
    const rawJid = messageObj.key.participant || messageObj.key.remoteJid;
    if (!rawJid) return fallbackName;
    return rawJid.split(':')[0];
}

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

function getOrMigrateUserProfile(memory, senderJid, senderName) {
    if (!memory.userProfiles) memory.userProfiles = {};

    if (memory.userProfiles[senderJid] && typeof memory.userProfiles[senderJid] === 'object' && !Array.isArray(memory.userProfiles[senderJid])) {
        memory.userProfiles[senderJid].name = senderName;
        if (!Array.isArray(memory.userProfiles[senderJid].traits)) {
            memory.userProfiles[senderJid].traits = [];
        }
        return memory.userProfiles[senderJid];
    }

    let inheritedTraits = [];
    if (Array.isArray(memory.userProfiles[senderName])) {
        inheritedTraits = [...memory.userProfiles[senderName]];
        delete memory.userProfiles[senderName];
    }

    memory.userProfiles[senderJid] = {
        name: senderName,
        traits: inheritedTraits
    };
    return memory.userProfiles[senderJid];
}

async function recordMessageToMemory(db, remoteJid, senderName, role, text) {
    const memory = await getRoomMemory(db, remoteJid);
    memory.recentHistory.push({ senderName, role, text, time: new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }) });
    if (memory.recentHistory.length > 25) memory.recentHistory.shift();
    await saveLongTermMemory(db, remoteJid);
}

async function logDailyCafeMessage(db, remoteJid, senderName, text, senderJid = null) {
    if (!db) return;
    if (remoteJid === GROUPS.FLYER) return; // 🛡️ 排除花農群洗版與座標紀錄
    try {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
        await db.collection('cafe_daily_logs').insertOne({
            roomJid: remoteJid,
            date: todayStr,
            senderJid: senderJid || senderName,
            senderName,
            text,
            timestamp: new Date()
        });
    } catch (e) {
        console.error('❌ 記錄每日對話失敗:', e);
    }
}

// 🌙 判斷敏敏目前係咪處於睡眠狀態（已道晚安後 ～ 翌晨早安前）
async function isMimikiSleeping(db) {
    const now = new Date();
    const hkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
    const hour = hkTime.getHours();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });

    if (hour === 23) {
        if (!db) return false;
        const nightDone = await db.collection('bot_flags').findOne({ _id: `night_done_${todayStr}` });
        return Boolean(nightDone);
    }

    if (hour >= 0 && hour < 7) {
        if (!db) return true;
        const morningDone = await db.collection('bot_flags').findOne({ _id: `morning_done_${todayStr}` });
        return !morningDone;
    }

    if (hour === 7) {
        if (!db) return false;
        const morningDone = await db.collection('bot_flags').findOne({ _id: `morning_done_${todayStr}` });
        return !morningDone;
    }

    return false;
}

async function generateNightGreetingText(ai) {
    const fallbackPhrases = [
        "眼訓喇... 今日行路種花好攰，大家早抖呀！💤✨",
        "哎呀好眼訓，要返房碌多陣脆就訓喇，各位晚安～😴",
        "夠鐘熄燈！大家今日都辛苦晒，聽日見啦拜拜～🌙",
        "眼皮打交中... 我先去夢境世界喇，早抖呀大家！🌸"
    ];

    if (!ai) {
        return fallbackPhrases[Math.floor(Math.random() * fallbackPhrases.length)];
    }

    try {
        const prompt = "生成一句充滿皮克敏 Bloom 風格、溫馨可愛且帶有地道香港廣東話口吻嘅晚安／早抖問候語。控制喺 1 至 2 句短句（約 15～45 字），唔好長篇大論。";
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
        });
        const aiText = response?.text ? response.text.trim() : '';
        if (aiText) return aiText;
    } catch (err) {
        console.warn('⚠️ 晚安 AI 生成失敗，改用後備句庫:', err?.message || err);
    }

    return fallbackPhrases[Math.floor(Math.random() * fallbackPhrases.length)];
}

// 🌙 晚上 23:00 ~ 23:59 之間隨機時間道晚安並執行夜間學習（雲端終極防斷線/防重啟版）
function initNightlyLearningJob(sockOrGetter, db, ai, getIsConnected = null) {
    cron.schedule('*/5 23 * * *', async () => {
        const cafeJid = GROUPS.CAFE;
        if (!cafeJid || !db) return;

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
        const doneFlagId = `night_done_${todayStr}`;
        const lockFlagId = `night_lock_${todayStr}`;
        const randMinFlagId = `night_rand_${todayStr}`;

        try {
            const doneFlag = await db.collection('bot_flags').findOne({ _id: doneFlagId });
            if (doneFlag) return;

            const existingLock = await db.collection('bot_flags').findOne({ _id: lockFlagId });
            if (existingLock?.lockedAt && (Date.now() - new Date(existingLock.lockedAt).getTime()) < 10 * 60 * 1000) {
                return;
            }

            let randDoc = await db.collection('bot_flags').findOne({ _id: randMinFlagId });
            if (!randDoc) {
                const randomIndex = Math.floor(Math.random() * 12);
                const targetMinute = randomIndex * 5;
                await db.collection('bot_flags').insertOne({ _id: randMinFlagId, targetMinute });
                randDoc = { targetMinute };
            }

            const now = new Date();
            const hkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
            const currentMinute = hkTime.getMinutes();

            if (currentMinute < randDoc.targetMinute && currentMinute !== 55) return;

            const activeSock = typeof sockOrGetter === 'function' ? sockOrGetter() : sockOrGetter;
            const connected = typeof getIsConnected === 'function' ? getIsConnected() : true;
            if (!activeSock || !connected) {
                console.warn(`⚠️ [晚安排程] 23:${String(currentMinute).padStart(2, '0')} 尚未連線，稍後再試發送晚安。`);
                return;
            }

            await db.collection('bot_flags').updateOne(
                { _id: lockFlagId },
                { $set: { lockedAt: new Date() } },
                { upsert: true }
            );

            console.log(`🌙 [晚安排程] 敏敏在 23:${String(currentMinute).padStart(2, '0')} 準備道晚安並開始夜間學習～`);

            const sleepText = await generateNightGreetingText(ai);
            await activeSock.sendMessage(cafeJid, { text: sleepText });
            await recordMessageToMemory(db, cafeJid, '敏敏', 'assistant', sleepText);

            await db.collection('bot_flags').updateOne(
                { _id: doneFlagId },
                { $set: { executedAt: new Date() } },
                { upsert: true }
            );

            const logs = await db.collection('cafe_daily_logs').find({ date: todayStr }).toArray();
            if (logs && logs.length > 0) {
                const roomsMap = {};
                logs.forEach(l => {
                    if (l.roomJid === GROUPS.FLYER) return;
                    if (!roomsMap[l.roomJid]) roomsMap[l.roomJid] = [];
                    roomsMap[l.roomJid].push(l);
                });

                const processedRooms = [];

                for (const [remoteJid, roomLogs] of Object.entries(roomsMap)) {
                    try {
                        const memory = await getRoomMemory(db, remoteJid);
                        if (!memory.groupMilestones) memory.groupMilestones = [];

                        const dailyChatText = roomLogs.map(l => {
                            const idTag = l.senderJid || l.senderName;
                            if (l.senderJid) getOrMigrateUserProfile(memory, l.senderJid, l.senderName);
                            return `[ID:${idTag} | 暱稱:${l.senderName}]: ${l.text}`;
                        }).join('\n');

                        const learningPrompt = `你是一個群組智慧記憶整理 AI。請根據以下資訊整合並更新成員檔案與群組里程碑。

【現有成員檔案】:
${JSON.stringify(memory.userProfiles || {}, null, 2)}

【現有群組里程碑】:
${JSON.stringify(memory.groupMilestones || [], null, 2)}

【今日 (${todayStr}) 對話記錄】:
${dailyChatText || '（今日無對話）'}

【輸出規則】:
- 只根據「今日對話記錄」新增或修正特徵，不要捏造。
- profiles 的 key 必須是成員 ID（不是暱稱）。
- 純 JSON 回傳，不要 markdown：
{
  "profiles": { "成員ID": ["特徵1"] },
  "milestones": [ "[${todayStr}] 事件" ]
}`;
                        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash-lite', contents: learningPrompt });
                        let analysisResult = response.text ? response.text.trim().replace(/```json/g, '').replace(/```/g, '').trim() : '';
                        const parsedData = JSON.parse(analysisResult);

                        if (parsedData.profiles) {
                            for (const [memberId, traits] of Object.entries(parsedData.profiles)) {
                                if (!Array.isArray(traits)) continue;
                                if (!memory.userProfiles[memberId] || Array.isArray(memory.userProfiles[memberId])) {
                                    memory.userProfiles[memberId] = { name: memberId, traits: [] };
                                }
                                const merged = [...new Set([...memory.userProfiles[memberId].traits, ...traits])];
                                memory.userProfiles[memberId].traits = merged.slice(-25);
                            }
                        }
                        if (Array.isArray(parsedData.milestones) && parsedData.milestones.length > 0) {
                            memory.groupMilestones = [...new Set([...memory.groupMilestones, ...parsedData.milestones])].slice(-30);
                        }
                        await saveLongTermMemory(db, remoteJid);
                        processedRooms.push(remoteJid);
                    } catch (roomErr) {
                        console.error(`❌ 夜間學習處理群組 [${remoteJid}] 失敗:`, roomErr);
                    }
                }

                if (processedRooms.length > 0) {
                    await db.collection('cafe_daily_logs').deleteMany({
                        date: todayStr,
                        roomJid: { $in: processedRooms }
                    });
                }
            }

            await db.collection('bot_flags').deleteOne({ _id: lockFlagId });
            console.log('🌙 [夜間學習完成] 資料已成功歸納與瘦身！');

        } catch (e) {
            await db.collection('bot_flags').deleteOne({ _id: lockFlagId }).catch(() => {});
            console.error('❌ 夜間排程或學習發生錯誤:', e);
        }
    }, { scheduled: true, timezone: "Asia/Hong_Kong" });
}

// 🕒 主動碎碎唸定時任務（支援動態 getSock，深夜 00:00 至 07:00 睡眠靜音）
function initAutoSpontaneousChatJob(sockOrGetter, db, ai) {
    cron.schedule('0 */2 * * *', async () => {
        const activeSock = typeof sockOrGetter === 'function' ? sockOrGetter() : sockOrGetter;
        if (!db || !activeSock) return;
        const cafeJid = GROUPS.CAFE;
        if (!cafeJid) return;

        const currentHour = parseInt(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', hour12: false }));
        if (currentHour >= 0 && currentHour < 7) {
            return;
        }

        try {
            const memory = await getRoomMemory(db, cafeJid);
            const history = memory.recentHistory || [];
            if (history.length > 0 && history[history.length - 1].senderName === '敏敏') return;
            if (Math.random() > 0.35) return;

            const spontaneousTopics = [
                "分享一個剛剛在 Threads (脆) 看到的超搞笑迷因或生活吐槽",
                "問大家今日行咗幾多步、種咗幾多花",
                "碎碎唸說有啲肚餓，問大家下午茶有咩好介紹",
                "隨口關心一下大家今日返工返學忙唔忙"
            ];
            const chosenTopic = spontaneousTopics[Math.floor(Math.random() * spontaneousTopics.length)];

            const spontaneousPrompt = `
群組安靜了一陣子，請以活潑貼地的香港少女「敏敏」身份，在群組隨口講一句開場白。
【主題】: ${chosenTopic}
【要求】: 地道香港廣東話，極簡短句（1-2句，35字以內），自然貼地。`;

            const response = await ai.models.generateContent({ model: 'gemini-3.5-flash-lite', contents: spontaneousPrompt });
            let spText = response.text ? response.text.trim() : '';
            if (spText) {
                await activeSock.sendMessage(cafeJid, { text: spText });
                await recordMessageToMemory(db, cafeJid, '敏敏', 'assistant', spText);
            }
        } catch (e) {
            console.error('❌ 主動碎碎唸失敗:', e);
        }
    }, { scheduled: true, timezone: "Asia/Hong_Kong" });
}

async function searchWeb(query) {
    try {
        let cleanQuery = query.replace(/幫我上網|幫我網上|幫我搵|幫我研究|查一下|搜尋|查|今日/g, '').trim();
        if (!cleanQuery) cleanQuery = query;
        const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
        const response = await tvly.search(cleanQuery, { searchDepth: "basic", maxResults: 15, includeAnswer: true });
        if (response.answer) return `【Tavily 搜尋摘要】:\n${response.answer}`;
        if (response.results && response.results.length > 0) {
            return response.results.slice(0, 4).map(r => `標題: ${r.title}\n摘要: ${r.content}`).join('\n\n');
        }
        return '';
    } catch (e) { return ''; }
}

// 🛡️ 加上嚴格空值與狀態檢查，防止 OpenRouter 異常結構拋出 TypeError
async function fetchOpenRouterGemmaFree(fullPrompt) {
    const openRouterKey = process.env.OPENROUTER_API_KEY || "";
    if (!openRouterKey) {
        throw new Error("未設定 OPENROUTER_API_KEY");
    }

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
        throw new Error(`OpenRouter HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
        const errMsg = data?.error?.message || 'OpenRouter 回傳空白 choices';
        throw new Error(errMsg);
    }

    return data.choices[0]?.message?.content || '';
}

// 🌤️ 帶 20 分鐘快取嘅隱性背景天氣取得函式
async function getCachedWeatherContext() {
    const now = Date.now();
    if (cachedWeatherContext.text && (now - cachedWeatherContext.fetchedAt) < WEATHER_CACHE_TTL_MS) {
        return cachedWeatherContext.text;
    }

    try {
        const rhrRes = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc');
        if (!rhrRes.ok) {
            throw new Error(`天文台 API HTTP ${rhrRes.status}`);
        }
        const rhrData = await rhrRes.json();
        const tempObj = rhrData.temperature?.data?.find(t => t.place === '香港天文台') || rhrData.temperature?.data?.[0];
        const temp = tempObj ? `${tempObj.value}°C` : '24°C';
        const humidityObj = rhrData.humidity?.data?.[0];
        const humidity = humidityObj ? `${humidityObj.value}%` : '75%';

        const contextStr = `【隱性背景參考（只有對方問天氣或食咩先好提，平時絕對唔好主動講！）】: 香港目前 ${temp}，濕度 ${humidity}。你今日食過菠蘿油同車仔麵。`;
        cachedWeatherContext = {
            text: contextStr,
            fetchedAt: now
        };
        return contextStr;
    } catch (e) {
        return cachedWeatherContext.text || '';
    }
}

async function processAIChat(sock, remoteJid, senderName, query, messageObj, db, ai) {
    const senderJid = extractSenderJid(messageObj, senderName);

    // 💤 睡眠模式攔截：已道晚安後至翌晨醒來前，自動提示敏敏睡覺中（唔消耗 AI 額度）
    if (await isMimikiSleeping(db)) {
        const lastNotice = sleepNoticeCooldown[remoteJid] || 0;
        const nowTs = Date.now();

        if (nowTs - lastNotice > 10 * 60 * 1000) {
            sleepNoticeCooldown[remoteJid] = nowTs;
            const sleepingReplies = [
                `💤 【敏敏睡覺中】呼嚕…… 敏敏已經瞓著咗啦，頭頂粒嫩芽都收埋咗，聽朝 7 點幾醒咗再覆你～🌙`,
                `😴 【敏敏睡覺中】Zzz… 今日行路種花好攰，敏敏已經熄燈訓覺喇，有咩聽朝再傾呀！✨`,
                `🌙 【敏敏睡覺中】敏敏去咗夢境世界採花蜜啦～等聽朝太陽伯伯叫醒我再覆你喔！💤`
            ];
            const sleepNoticeText = sleepingReplies[Math.floor(Math.random() * sleepingReplies.length)];
            await sock.sendMessage(remoteJid, { text: sleepNoticeText }, { quoted: messageObj });
        }
        return;
    }

    const memory = await getRoomMemory(db, remoteJid);
    const userProfile = getOrMigrateUserProfile(memory, senderJid, senderName);

    if (query === '幫我' || query === '幫幫我') {
        let replyText = `想我幫你查咩呀？直接講就得啦～`;
        await recordMessageToMemory(db, remoteJid, senderName, 'user', query);
        await recordMessageToMemory(db, remoteJid, '敏敏', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
        return;
    }

    let webSearchContext = '';
    const strongSearchKeywords = ['幫我上網', '幫我網上', '幫我搵', '幫我研究', '查一下', '搜尋', '最新', '新聞', '今日', '咩事', '發生', '大事', '脆', 'ig', '八掛', 'ig見到', 'threads'];
    if (strongSearchKeywords.some(keyword => query.toLowerCase().includes(keyword))) {
        const searchResults = await searchWeb(query);
        webSearchContext = searchResults ? `\n【網路搜尋參考】:\n${searchResults}\n` : `\n【提示】: 網上暫時搵唔到相關新料。\n`;
    }

    const now = new Date();
    const hkFullTime = now.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });

    // 🌟 帶快取嘅隱性背景參考
    const mimikiWeatherLifeContext = await getCachedWeatherContext();

    let mimikiStatusText = '';
    const isBeingFed = /(🍓|🍎|🍊|🍋|🍉|🍇|🍰|🍩|☕|🧋|精華|餵敏敏)/.test(query);

    if (remoteJid === GROUPS.CAFE) {
        mimikiStatusText = await updateAndGetMimikiStatusText(db, remoteJid, query, senderName, senderJid);
    }

    const userTraits = userProfile.traits || [];
    const profileText = userTraits.length > 0 ? `你對 ${senderName} 的記憶：${userTraits.join('、')}` : `新朋友 ${senderName}`;
    const milestones = memory.groupMilestones || [];
    const milestoneText = milestones.length > 0 ? `群組大事件：${milestones.join('；')}` : ``;
    const historyText = memory.recentHistory.slice(-15).map(m => `${m.senderName}: ${m.text}`).join('\n');

    const allowAction = isBeingFed ? true : (Math.random() < 0.25);
    const actionRule = allowAction
        ? `3. **精靈小動作（本回合允許）**：可以喺句子開頭或結尾加一個**10字以內**嘅頭頂嫩芽/小白花可愛反應（例如：\`(頭頂小花開心擺動 🌸)\`），千祈唔好寫太長！`
        : `3. **禁止括號動作（本回合純吹水）**：今次回覆**絕對唔可以**出現任何 \`(...)\` 或 \`（...）\` 嘅動作描寫，直接講人話！`;

    const feedingRule = isBeingFed
        ? `5. **【餵食特別回饋】**：${senderName} 啱啱餵咗嘢食俾你！你一定要俾出明確、可愛又有生命力嘅吃貨反應（感謝 ${senderName}、形容好味／開胃，或者如果飽足度已達 100% 就撒嬌話飽到上心口／頭頂發光），並自然順帶提一提而家飽足度同好感度等級！`
        : ``;

    const fullPrompt = `
時間：香港時間 ${hkFullTime}
${mimikiWeatherLifeContext}
${mimikiStatusText}
${webSearchContext}
對方資料：${profileText}
${milestoneText}

【最近群組對話】：
${historyText}

現在 ${senderName} 講：「${query}」

⚠️ 【真人吹水鐵律】：
0. **【核心身份】**：你的名字叫「敏敏」。如果群友叫你「馬哥」、「馬總」或者亂改你名，你必須自然、搞笑地糾正（例如：「我係敏敏呀，邊度嚟嘅馬哥？😂」），**絕對不能承認自己是馬哥**！
1. **極度精簡**：只回 **1～2 句口語短句**，像平時同朋友 WhatsApp 吹水咁直接接話，唔好寫超過 45 個字（餵食回饋可放寬至最多 2～3 句，約 60 字以內）！
2. **禁止報天氣 / 提食物**：除非 ${senderName} 明確問天氣、凍唔凍、問食咩、或者正在餵食你，否則**一個字都唔准提氣溫、濕度、菠蘿油、蛋撻**！
${actionRule}
4. **自然接梗**：直接針對佢講嘅內容俾反應，唔好強行轉移話題。
${feedingRule}

直接回覆：`;

    let replyText = '';
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: fullPrompt,
            config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
        });
        replyText = response.text;
    } catch (err1) {
        try {
            replyText = await fetchOpenRouterGemmaFree(fullPrompt);
        } catch (err2) {
            replyText = '哎呀我呢邊網絡有啲卡，陣間再覆你！';
        }
    }

    if (replyText) {
        if (!allowAction) {
            replyText = replyText.replace(/^[\(（][^\)）]+[\)）]\s*/g, '').trim();
        } else {
            replyText = replyText.trim();
        }

        await recordMessageToMemory(db, remoteJid, senderName, 'user', query);
        await recordMessageToMemory(db, remoteJid, '敏敏', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
    }
}

module.exports = {
    loadLongTermMemory: async (db) => roomMemories,
    recordCafeMessage: recordMessageToMemory,
    logDailyCafeMessage,
    initNightlyLearningJob,
    initAutoSpontaneousChatJob,
    processAIChat
};
