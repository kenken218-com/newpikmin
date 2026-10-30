// ==========================================
// 📍 省錢版 Google Places 互動引導服務 (placesService.js)
// ==========================================

// 記憶體對話狀態：key = userJid, value = { step, district, cuisine }
const searchSessions = {};

async function handlePlacesWizard(sock, m, remoteJid, senderJid, senderName, messageContent) {
    const session = searchSessions[senderJid];

    // 1. 觸發搜尋精靈
    if (messageContent === '!搵食' || messageContent === '！搵食' || messageContent === '!餐廳' || messageContent === '！餐廳') {
        searchSessions[senderJid] = { step: 'waiting_district' };
        await sock.sendMessage(remoteJid, { 
            text: `🍽️ 【小管家搵食精靈啟動】\n@${senderName}，請問你想去邊個**地區**搵嘢食呀？\n（例如：銅鑼灣、旺角、尖沙咀、荃灣等）`,
            mentions: [senderJid]
        }, { quoted: m });
        return true;
    }

    if (!session) return false;

    // 2. 步驟一：收集地區，追問菜式
    if (session.step === 'waiting_district') {
        session.district = messageContent.trim();
        session.step = 'waiting_cuisine';
        await sock.sendMessage(remoteJid, { 
            text: `📍 收到！地區鎖定在 **${session.district}**。\n那麼你想食咩**菜式或類別**呀？\n（例如：火鍋、日式放題、茶餐廳、壽司、意粉等）` 
        }, { quoted: m });
        return true;
    }

    // 3. 步驟二：收集菜式，此時條件齊全，才真正呼叫 Google Places API
    if (session.step === 'waiting_cuisine') {
        session.cuisine = messageContent.trim();
        const finalQuery = `${session.district} ${session.cuisine}`;
        
        // 清除 session
        delete searchSessions[senderJid];

        await sock.sendMessage(remoteJid, { text: `🔍 條件收集完畢！小管家正嚴格搜尋「${finalQuery}」，請稍候……` }, { quoted: m });

        // 呼叫 Google Cloud Places API (New)
        const resultText = await callGooglePlacesAPI(finalQuery);
        await sock.sendMessage(remoteJid, { text: resultText }, { quoted: m });
        return true;
    }

    return false;
}

async function callGooglePlacesAPI(query) {
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
                maxResultCount: 5 // 👈 1. 告訴 Google 最多回傳 5 筆結果
            })
        });

        const data = await response.json();
        if (!data.places || data.places.length === 0) {
            return `🔍 搵唔到符合「${query}」嘅餐廳，可能要換個條件再試一次！`;
        }

        // 👈 2. 將回傳結果取前 5 個
        const topPlaces = data.places.slice(0, 5);
        let resultText = `📍 【精準搵食結果（共 ${topPlaces.length} 間）：${query}】\n\n`;

        topPlaces.forEach((place, index) => {
            const name = place.displayName?.text || '未知名稱';
            const address = place.formattedAddress || '地址不詳';
            const rating = place.rating ? `⭐ ${place.rating}分` : '暫無評分';
            const mapsUrl = place.googleMapsUri ? `🔗 [Google 地圖導航](${place.googleMapsUri})` : '';

            resultText += `${index + 1}. **${name}**\n`;
            resultText += `   • 評分：${rating}\n`;
            resultText += `   • 地址：${address}\n`;
            if (mapsUrl) resultText += `   • ${mapsUrl}\n`;
            resultText += `─────────────────────────\n`;
        });

        return resultText;
    } catch (e) {
        return `❌ 查詢地圖 API 時發生錯誤，請稍後再試！`;
    }
}

module.exports = { handlePlacesWizard };
