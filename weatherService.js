// ==========================================
// 🌤️ 香港天文台數據 + AI 智慧對答服務 (weatherService.js)
// ==========================================
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');
const { recordCafeMessage } = require('./aiService');
const dbService = require('./dbService');

async function handleWeatherCommand(sock, m, remoteJid, messageContent, db, ai, senderName = '成員') {
    // 🛡️ 允許在 Cafe、Admin、Rice 群使用天氣功能
    const isAllowedGroup = (
        remoteJid === GROUPS.CAFE || 
        remoteJid === GROUPS.ADMIN || 
        remoteJid === GROUPS.RICE
    );
    if (!isAllowedGroup) return false;

    // 🧠 智慧自然語言意圖判斷
    const hasPrefix = /^[!！]/.test(messageContent);
    const weatherKeywords = [
        '天氣', '天文台', '氣溫', '溫度', '落雨', '下雨', '降雨', '濕度', 
        '幾度', '遮', '雨傘', '冷', '熱', '預報', '聽日', '明天', '今日', '現在'
    ];
    const cleanQuery = messageContent.replace(/^[!！]\s*/, '').trim();
    const containsKeyword = weatherKeywords.some(keyword => cleanQuery.includes(keyword));

    if (!hasPrefix || !containsKeyword) return false;

    const activeDb = db || dbService.db;

    try {
        // 📝 1. 記錄成員發送的問句到群組記憶
        if (activeDb) {
            await recordCafeMessage(activeDb, remoteJid, senderName, 'user', messageContent);
        }

        // ☀️ 併發抓取香港天文台 API 數據
        const [rhrRes, fndRes] = await Promise.all([
            fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc'),
            fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=tc')
        ]);
        
        const rhrData = await rhrRes.json();
        const fndData = await fndRes.json();

        // 解析即時數據
        const tempObj = rhrData.temperature?.data?.find(t => t.place === '香港天文台') || rhrData.temperature?.data?.[0];
        const temp = tempObj ? `${tempObj.value}°C` : '未知';
        const humidityObj = rhrData.humidity?.data?.[0];
        const humidity = humidityObj ? `${humidityObj.value}%` : '未知';
        const warningMsg = rhrData.warningMessage ? `生效警告：${rhrData.warningMessage.join('、')}` : '無特別警告';

        // 解析預報數據
        const forecastList = fndData.weatherForecast || [];
        let forecastSummary = forecastList.map((f, i) => {
            const dateStr = `${f.forecastDate.substring(4,6)}/${f.forecastDate.substring(6,8)}`;
            const label = i === 0 ? '今日' : (i === 1 ? '聽日/明天' : `${dateStr}(${f.week})`);
            return `[${label}]: ${f.forecastMintemp.value}°C~${f.forecastMaxtemp.value}°C | 天氣: ${f.forecastWeather} | 降雨概率: ${f.PSR || '未提供'}`;
        }).slice(0, 5).join('\n');

        // 🤖 2. 將天文台數據打包送給 AI 思考並回答
        const weatherContextPrompt = `
【香港天文台官方即時與未來氣象數據】:
- 當前天文台氣溫：${temp}
- 當前相對濕度：${humidity}
- 天氣警告：${warningMsg}
- 未來預報：
${forecastSummary}

【成員問題】:
${senderName} 問："${cleanQuery}"

【回答要求】:
1. 請以「皮皮小管家」的身份，用親切道地的香港廣東話精準回答 ${senderName} 的問題（例如：針對熱不熱、要不要帶雨傘、會不會落雨等給出直接建議）。
2. 請自然地融入上述天文台的氣溫、天氣或降雨數據作為依據。
3. 保持回答簡潔溫馨（約 2~4 句話），適當加入皮克敏風格的 Emoji 裝飾。
`;

        let replyText = '';
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite',
                contents: weatherContextPrompt,
                config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
            });
            replyText = response.text;
        } catch (err) {
            console.error('❌ 天氣 AI 生成失敗，改用文字模板備用:', err);
            replyText = `🌱 【香港天文台即時數據】\n目前氣溫 ${temp}，濕度 ${humidity}。\n聽日預報：${forecastList[1]?.forecastMintemp.value || ''}°C - ${forecastList[1]?.forecastMaxtemp.value || ''}°C (${forecastList[1]?.forecastWeather || ''})。出門記得注意天氣變化喔！`;
        }

        // 📤 3. 發送 AI 的智慧回答
        await sock.sendMessage(remoteJid, { text: replyText.trim() }, { quoted: m });

        // 📝 4. 將 AI 的回答寫入記憶，確保上下文完整
        if (activeDb && replyText) {
            await recordCafeMessage(activeDb, remoteJid, '皮皮小管家', 'assistant', replyText);
        }

    } catch (e) {
        console.error('❌ 處理天氣指令失敗:', e);
        await sock.sendMessage(remoteJid, { text: `❌ 哎呀！皮皮小管家暫時連唔到天文台伺服器，陣間再試過啦！` }, { quoted: m });
    }

    return true;
}

module.exports = { handleWeatherCommand };
