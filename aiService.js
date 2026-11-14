// ==========================================
// 🤖 AI 聊天與長期記憶服務 (aiService.js) [全方位頂級擬真旗艦版]
// 包含：天文台天氣同步、IG/脆八掛吃貨人格、JID防改名、動態長短句、隨機夜間睡眠
// ==========================================
const { PIKMIN_SYSTEM_PROMPT, GROUPS } = require('./config');
const { updateAndGetMimikiStatusText } = require('./mimikiState');
const { tavily } = require('@tavily/core');
const cron = require('node-cron');

let roomMemories = {}; 

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

// 🌙 晚上 23:00 ~ 00:00 之間隨機時間道晚安並執行夜間學習
function initNightlyLearningJob(sock, db, ai) {
    cron.schedule('0 23 * * *', async () => {
        const cafeJid = GROUPS.CAFE;
        if (!cafeJid) return;

        const randomMinutes = Math.floor(Math.random() * 55); // 0~54分鐘隨機
        console.log(`🌙 [夜間排程] 敏敏今晚預計會在 23:${randomMinutes < 10 ? '0' : ''}${randomMinutes} 準備道晚安～`);

        setTimeout(async () => {
            if (sock) {
                try {
                    const sleepPhrases = [
                        "眼訓喇... 今日行路種花好攰，大家早抖呀！💤✨",
                        "哎呀好眼訓，要返房碌多陣脆就訓喇，各位晚安～😴",
                        "夠鐘熄燈！大家今日都辛苦晒，聽日見啦拜拜～🌙",
                        "眼皮打交中... 敏敏先去夢境世界喇，早抖呀大家！🌸"
                    ];
                    const randomSleepText = sleepPhrases[Math.floor(Math.random() * sleepPhrases.length)];
                    await sock.sendMessage(cafeJid, { text: randomSleepText });
                    if (db) await recordMessageToMemory(db, cafeJid, '敏敏', 'assistant', randomSleepText);
                } catch (e) {
                    console.error('❌ 發送隨機晚安訊息失敗:', e);
                }
            }

            if (!db) return;
            try {
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
                const logs = await db.collection('cafe_daily_logs').find({ date: todayStr }).toArray();
                if (!logs || logs.length === 0) return;

                const roomsMap = {};
                logs.forEach(l => {
                    if (!roomsMap[l.roomJid]) roomsMap[l.roomJid] = [];
                    roomsMap[l.roomJid].push(l);
                });

                for (const [remoteJid, roomLogs] of Object.entries(roomsMap)) {
                    const memory = await getRoomMemory(db, remoteJid);
                    if (!memory.groupMilestones) memory.groupMilestones = [];

                    const dailyChatText = roomLogs.map(l => {
                        const idTag = l.senderJid || l.senderName;
                        if (l.senderJid) getOrMigrateUserProfile(memory, l.senderJid, l.senderName);
                        return `[ID:${idTag} | 暱稱:${l.senderName}]: ${l.text}`;
                    }).join('\n');

                    const learningPrompt = `你是一個群組智慧記憶整理 AI。請根據既有成員檔案與今日 (${todayStr}) 對話進行整合。格式純JSON回傳：
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
                }
                await db.collection('cafe_daily_logs').deleteMany({ date: todayStr });
                console.log('🌙 [夜間學習完成] 資料已成功歸納與瘦身！');
            } catch (e) {
                console.error('❌ 夜間學習發生錯誤:', e);
            }
        }, randomMinutes * 60 * 1000);

    }, { scheduled: true, timezone: "Asia/Hong_Kong" });
}

// 🕒 主動碎碎唸定時任務（深夜 00:00 至 07:00 睡眠靜音）
function initAutoSpontaneousChatJob(sock, db, ai) {
    cron.schedule('0 */2 * * *', async () => {
        if (!db) return;
        const cafeJid = GROUPS.CAFE;
        if (!cafeJid) return;

        const currentHour = parseInt(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', hour12: false }));
        if (currentHour >= 0 && currentHour < 7) {
            return; // 深度睡眠期，不發言
        }

        try {
            const memory = await getRoomMemory(db, cafeJid);
            const history = memory.recentHistory || [];
            if (history.length > 0 && history[history.length - 1].senderName === '敏敏') return;
            if (Math.random() > 0.35) return;

            const spontaneousTopics = [
                "分享一個剛剛在 Threads (脆) 看到的超搞笑迷因或生活吐槽",
                "抱怨今日天氣太熱或濕度太高，想飲凍珍奶",
                "碎碎唸說肚餓，想食菠蘿油或者蛋撻",
                "叫大家得閒記得去行路種花，順便關心一下大家今日忙唔忙"
            ];
            const chosenTopic = spontaneousTopics[Math.floor(Math.random() * spontaneousTopics.length)];

            const spontaneousPrompt = `
群組已經安靜了一陣子。請以開朗可愛、為食愛玩、經常碌 IG/脆的香港少女「敏敏」身份，在咖啡室群組「主動發言碎碎唸」一句。
【主題】: ${chosenTopic}
【要求】: 地道香港廣東話，短小精幹（2句話以內，40-70字），帶點可愛吃貨脾氣。`;

            const response = await ai.models.generateContent({ model: 'gemini-3.5-flash-lite', contents: spontaneousPrompt });
            let spText = response.text ? response.text.trim() : '';
            if (spText) {
                await sock.sendMessage(cafeJid, { text: spText });
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

async function fetchOpenRouterGemmaFree(fullPrompt) {
    const openRouterKey = process.env.OPENROUTER_API_KEY || "";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
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
    const senderJid = extractSenderJid(messageObj, senderName);
    const memory = await getRoomMemory(db, remoteJid);
    const userProfile = getOrMigrateUserProfile(memory, senderJid, senderName);

    if (query === '幫我' || query === '幫幫我') {
        let replyText = `🌱 收到！想敏敏幫你查咩資料呀？直接話我知得架啦～`;
        await recordMessageToMemory(db, remoteJid, senderName, 'user', query);
        await recordMessageToMemory(db, remoteJid, '敏敏', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
        return;
    }

    let webSearchContext = '';
    const strongSearchKeywords = ['幫我上網', '幫我網上', '幫我搵', '幫我研究', '查一下', '搜尋', '最新', '新聞', '今日', '咩事', '發生', '大事', '脆', 'ig', '八掛', 'ig見到', 'threads'];
    if (strongSearchKeywords.some(keyword => query.toLowerCase().includes(keyword))) {
        const searchResults = await searchWeb(query);
        webSearchContext = searchResults ? `\n【🌐 網路即時搜尋 / 脆與八掛熱話】:\n${searchResults}\n` : `\n【⚠️ 系統提示】: 網絡暫時冇新八掛。\n`;
    }

    const now = new Date();
    const hkFullTime = now.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
    const utcFullTime = now.toLocaleString('en-GB', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });

    let mimikiWeatherLifeContext = '';
    try {
        const rhrRes = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc');
        const rhrData = await rhrRes.json();
        const tempObj = rhrData.temperature?.data?.find(t => t.place === '香港天文台') || rhrData.temperature?.data?.[0];
        const temp = tempObj ? `${tempObj.value}°C` : '24°C';
        const humidityObj = rhrData.humidity?.data?.find(h => h.place === '香港天文台') || rhrData.humidity?.data?.[0];
        const humidity = humidityObj ? `${humidityObj.value}%` : '75%';

        mimikiWeatherLifeContext = `
【🌤️ 敏敏今日即時天氣與生活動態（同步香港天文台）】:
- 當前氣溫：${temp}，相對濕度：${humidity}
- 【今日穿搭】: ${parseInt(temp) > 26 ? '穿著透氣輕便嘅碎花小裙，拎住迷你風扇 ☀️' : parseInt(temp) < 18 ? '穿著可愛嘅冷衫同頸巾，保暖要緊 🧣' : '穿著休閒衛衣同布鞋，最適合出門行路種花 👟'}
- 【今日心情】: ${parseInt(humidity) > 85 ? '濕氣重重，覺得有啲黏立立、慵懶想賴床 💧' : '陽光普照、清爽舒服，心情超級開朗、元氣滿滿 ✨'}
- 【今日飲食紀錄（為食吃貨日常）】: 
  * 早餐：食咗個新鮮出爐、牛油勁香嘅菠蘿油配熱奶茶 ☕
  * 午餐：食咗加咗辣嘅車仔麵（蘿蔔、豬紅、雞翼尖）😋，下午茶心思思想要一件蛋撻或者台式珍珠奶茶！
- 【今日 IG / 脆 (Threads) / 八掛動態】:
  * 啱啱喺 Threads (脆) 和 IG 碌到好多搞笑迷因、手搖新店開張優惠、以及最新嘅娛樂八掛新聞。隨時準備好同大家開心分享！
`;
    } catch (e) {
        mimikiWeatherLifeContext = `【🌤️ 敏敏今日生活狀態】: 天氣幾舒服，啱啱食完蛋撻，心情超級好～`;
    }

    let mimikiStatusText = '';
    if (remoteJid === GROUPS.CAFE) {
        mimikiStatusText = await updateAndGetMimikiStatusText(db, remoteJid, query, senderName, senderJid);
    }

    const userTraits = userProfile.traits || [];
    const profileText = userTraits.length > 0 ? `你對 ${senderName} 的長期記憶（共 ${userTraits.length} 條）：\n- ${userTraits.join('\n- ')}` : `這是你新認識的朋友 ${senderName}。`;
    const milestones = memory.groupMilestones || [];
    const milestoneText = milestones.length > 0 ? `【📖 群組大事件簿】:\n${milestones.join('\n')}` : `【📖 群組大事件簿】: 暫無記錄。`;
    const historyText = memory.recentHistory.slice(-25).map(m => `[${m.senderName}]: ${m.text}`).join('\n');

    const fullPrompt = `
【🕒 系統精準時間】：香港時間 ${hkFullTime} (UTC+0: ${utcFullTime})

${mimikiWeatherLifeContext}
${mimikiStatusText}
${webSearchContext}
【👤 成員檔案】: ${profileText}
${milestoneText}
【💬 最近對話歷史 (25句)】:
${historyText}

現在 ${senderName} 對你說："${query}"

⚠️ 【全方位開朗吃貨與八掛達人擬真鐵律】：
1. **性格核心（開朗、活潑、可愛、極度愛食）**：超愛甜品、菠蘿油、車仔麵、珍奶。
2. **IG / Threads (脆) / 八掛達人**：當問到 IG、脆或八掛時，化身網絡衝浪手，生動分享搞笑迷因與熱話。
3. **天氣與生活融入**：氣溫、濕度、剛食過嘅嘢自然融入對話。
4. **廣東話口語與短句節奏**：極地道香港口語（嘢、喺度、唔使、陣間、囉、喇、啫、笑死）。短小精幹（2-4句內），不洗版。
5. **好感度動態性格**：對熟客調皮吐槽，對新面孔熱情可愛。
6. **嚴格禁止**粗魯字眼與括號舞台劇動作前綴。

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
        try {
            replyText = await fetchOpenRouterGemmaFree(fullPrompt);
        } catch (err2) {
            replyText = '🌱 哎呀，敏敏同緊夥伴塞車緊，陣間再試過啦！';
        }
    }

    if (replyText) {
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
