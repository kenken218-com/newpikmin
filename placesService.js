// ==========================================
// 📍 省錢版 Google Places 互動引導服務 (placesService.js) [快取過期防呆版]
// ==========================================
const { recordCafeMessage } = require('./aiService');
const dbService = require('./dbService');

// 記憶體對話狀態：key = senderJid
const searchSessions = {};

// 上一次搜尋紀錄（包含 10 分鐘計時器）：key = remoteJid, value = { query, timer }
const lastSearchResults = {};

async function handlePlacesWizard(sock, m, remoteJid, senderJid, senderName, messageContent, db) {
    const session = searchSessions[senderJid];
    const activeDb = db || dbService.db;
    const cleanContent = messageContent.replace(/^[!！]\s*/, '').trim();

    // 🔄 1. 「換一批」邏輯處理 (!換一批 / !下一頁)
    if (cleanContent === '換一批' || cleanContent === '下一頁' || cleanContent === '睇多幾間') {
        const lastRecord = lastSearchResults[remoteJid];

        // 🛡️ 防呆：如果超過 10 分鐘未打或完全沒有紀錄
        if (!lastRecord) {
            await sock.sendMessage(remoteJid, { 
                text: `⚠️ 之前嘅搵食紀錄已經過期或不存在喔！請重新輸入 **!搵食** 或打出想食嘅嘢（例：\`!銅鑼灣有咩好食\`）。` 
            }, { quoted: m });
            return true;
        }

        const lastQuery = lastRecord.query;
        await sock.sendMessage(remoteJid, { text: `🔄 明白！小管家正為你尋找「${lastQuery}」嘅其他餐廳，請稍候……` }, { quoted: m });
        
        // 抓取第 6~10 間 (offset = 5)
        const resultText = await callGooglePlacesAPI(lastQuery, 5);
        await sock.sendMessage(remoteJid, { text: resultText }, { quoted: m });

        if (activeDb && resultText) {
            await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', resultText);
        }
        return true;
    }

    // 🧠 2. 智慧自然語意匹配 (例如：!銅鑼灣有咩好食 / !旺角火鍋)
    const hasPrefix = /^[!！]/.test(messageContent);
    const foodKeywords = ['好食', '食咩', '餐廳', '搵食', '美饌', '美食', '食野', '食嘢', '午餐', '晚餐', '放題', '火鍋', '壽司', '拉麵', '茶餐廳'];
    const isFoodQuery = hasPrefix && foodKeywords.some(kw => cleanContent.includes(kw));

    if (isFoodQuery && cleanContent !== '搵食' && cleanContent !== '餐廳') {
        const queryTarget = cleanContent.replace(/(有咩|好食|推薦|介紹|食咩|介紹下|食野|食嘢|幫我搵|邊度有)/g, ' ').trim();

        await sock.sendMessage(remoteJid, { text: `🍽️ 收到！小管家即刻幫你搜尋「${queryTarget}」，請稍候……` }, { quoted: m });

        // ⏳ 儲存搜尋字串並設定 10 分鐘自動過期
        saveLastQueryCache(remoteJid, queryTarget);

        const resultText = await callGooglePlacesAPI(queryTarget, 0);
        await sock.sendMessage(remoteJid, { text: resultText }, { quoted: m });

        if (activeDb && resultText) {
            await recordCafeMessage(activeDb, remoteJid, senderName, 'user', messageContent);
            await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', resultText);
        }
        return true;
    }

    // 🧙‍♂️ 3. 傳統引導精靈 (!搵食 / !餐廳)
    if (cleanContent === '搵食' || cleanContent === '餐廳') {
        if (session?.timer) clearTimeout(session.timer);

        const timer = setTimeout(async () => {
            if (searchSessions[senderJid]) {
                delete searchSessions[senderJid];
                try {
                    await sock.sendMessage(remoteJid, { 
                        text: `⌛ @${senderName}，搵食精靈已超過 1 分鐘未收到回覆，已自動取消搜尋喔！`,
                        mentions: [senderJid]
                    });
                } catch (e) {}
            }
        }, 60 * 1000);

        searchSessions[senderJid] = { step: 'waiting_district', timer };
        
        const reply1 = `🍽️ 【小管家搵食精靈啟動】\n@${senderName}，請問你想去邊個**地區**搵嘢食呀？\n（例如：銅鑼灣、旺角、尖沙咀、荃灣等）\n\n💡 *提示：你亦可以直接打 \`!銅鑼灣日本嘢\` 或 \`!旺角有咩好食\` 快速搜尋喔！*\n⏰ *（請於 1 分鐘內回覆，超時將自動取消）*`;
        await sock.sendMessage(remoteJid, { text: reply1, mentions: [senderJid] }, { quoted: m });

        if (activeDb) {
            await recordCafeMessage(activeDb, remoteJid, senderName, 'user', messageContent);
            await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', reply1);
        }
        return true;
    }

    if (!session) return false;

    // 4. 精靈步驟一：收到地區
    if (session.step === 'waiting_district') {
        clearTimeout(session.timer);

        const newTimer = setTimeout(async () => {
            if (searchSessions[senderJid]) {
                delete searchSessions[senderJid];
                try {
                    await sock.sendMessage(remoteJid, { 
                        text: `⌛ @${senderName}，搵食精靈已超過 1 分鐘未收到菜式回覆，已自動取消搜尋喔！`,
                        mentions: [senderJid]
                    });
                } catch (e) {}
            }
        }, 60 * 1000);

        session.district = cleanContent;
        session.step = 'waiting_cuisine';
        session.timer = newTimer;

        const reply2 = `📍 收到！地區鎖定在 **${session.district}**。\n那麼你想食咩**菜式或類別**呀？\n（例如：火鍋、日式放題、茶餐廳、壽司、意粉等）\n\n⏰ *（請於 1 分鐘內回覆，超時將自動取消）*`;
        await sock.sendMessage(remoteJid, { text: reply2 }, { quoted: m });

        if (activeDb) {
            await recordCafeMessage(activeDb, remoteJid, senderName, 'user', messageContent);
            await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', reply2);
        }
        return true;
    }

    // 5. 精靈步驟二：收到菜式，呼叫 API
    if (session.step === 'waiting_cuisine') {
        clearTimeout(session.timer);
        session.cuisine = cleanContent;
        const finalQuery = `${session.district} ${session.cuisine}`;
        
        delete searchSessions[senderJid];

        await sock.sendMessage(remoteJid, { text: `🔍 條件收集完畢！小管家正嚴格搜尋「${finalQuery}」，請稍候……` }, { quoted: m });

        // ⏳ 儲存搜尋字串並設定 10 分鐘自動過期
        saveLastQueryCache(remoteJid, finalQuery);

        if (activeDb) {
            await recordCafeMessage(activeDb, remoteJid, senderName, 'user', messageContent);
        }

        const resultText = await callGooglePlacesAPI(finalQuery, 0);
        await sock.sendMessage(remoteJid, { text: resultText }, { quoted: m });

        if (activeDb && resultText) {
            await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', resultText);
        }

        return true;
    }

    return false;
}

// 🛡️ 輔助函式：快取最後搜尋紀錄（10 分鐘後自動銷毀）
function saveLastQueryCache(remoteJid, query) {
    if (lastSearchResults[remoteJid]?.timer) {
        clearTimeout(lastSearchResults[remoteJid].timer);
    }

    const timer = setTimeout(() => {
        delete lastSearchResults[remoteJid];
    }, 10 * 60 * 1000); // 10 分鐘（600,000 ms）

    lastSearchResults[remoteJid] = { query, timer };
}

// 🌐 呼叫 Google Places API
async function callGooglePlacesAPI(query, offset = 0) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return `❌ 未設定 GOOGLE_PLACES_API_KEY！`;

    try {
        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri'
            },
            body: JSON.stringify({
                textQuery: query,
                languageCode: 'zh-HK',
                maxResultCount: 10
            })
        });

        const data = await response.json();
        if (!data.places || data.places.length <= offset) {
            return `🔍 冇更多符合「${query}」嘅餐廳資料囉，試下換個地區或菜式再搵啦！`;
        }

        const topPlaces = data.places.slice(offset, offset + 5);
        const pageTitle = offset > 0 ? '🔄 【換一批餐廳推薦】' : '📍 【精準搵食結果】';
        let resultText = `${pageTitle}（${query}）：\n\n`;

        topPlaces.forEach((place, index) => {
            const name = place.displayName?.text || '未知名稱';
            const address = place.formattedAddress || '地址不詳';
            const rating = place.rating ? `⭐ ${place.rating}分` : '暫無評分';
            const mapsUrl = place.googleMapsUri ? `🔗 [Google 地圖導航](${place.googleMapsUri})` : '';

            resultText += `${offset + index + 1}. **${name}**\n`;
            resultText += `   • 評分：${rating}\n`;
            resultText += `   • 地址：${address}\n`;
            if (mapsUrl) resultText += `   • ${mapsUrl}\n`;
            resultText += `─────────────────────────\n`;
        });

        if (offset === 0 && data.places.length > 5) {
            resultText += `💡 想睇更多選擇？10 分鐘內隨時回覆 **!換一批** 查看更多餐廳喔！`;
        }

        return resultText;
    } catch (e) {
        return `❌ 查詢地圖 API 時發生錯誤，請稍後再試！`;
    }
}

module.exports = { handlePlacesWizard };
