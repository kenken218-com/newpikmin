// ==========================================
// 🌤️ 香港天文台即時天氣與 7 天預報服務 (weatherService.js)
// ==========================================
const { GROUPS } = require('./config');

async function handleWeatherCommand(sock, m, remoteJid, messageContent) {
    // 🛡️ 允許在 Cafe、Admin、Rice 群使用天氣功能
    const isAllowedGroup = (
        remoteJid === GROUPS.CAFE || 
        remoteJid === GROUPS.ADMIN || 
        remoteJid === GROUPS.RICE
    );
    if (!isAllowedGroup) return false;

    // 支援 !天氣、！天氣、!7天天氣、！7天天氣、!降雨
    const isWeatherCmd = /^[!！]\s*(天氣|天文台|7天天氣|七天天氣|降雨)\s*$/.test(messageContent) || 
                         messageContent === '!天氣' || messageContent === '！天氣' ||
                         messageContent === '!7天天氣' || messageContent === '！7天天氣';

    if (!isWeatherCmd) return false;

    const isSevenDays = messageContent.includes('7') || messageContent.includes('七') || messageContent.includes('降雨');

    try {
        if (isSevenDays) {
            // 📅 抓取香港天文台九天/七天天氣預報 API
            const res = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=tc');
            const data = await res.json();

            const forecastList = data.weatherForecast || [];
            if (forecastList.length === 0) {
                await sock.sendMessage(remoteJid, { text: `⚠️ 目前暫時無法獲取 7 天天氣預報，請稍後再試！` }, { quoted: m });
                return true;
            }

            let replyText = `📅 【香港天文台 • 未來幾日天氣與降雨預報】\n`;
            replyText += `📝 ${data.generalSituation || '近期天氣概況'}\n`;
            replyText += `───────────────────\n`;

            // 取前 7 天
            for (let i = 0; i < Math.min(7, forecastList.length); i++) {
                const day = forecastList[i];
                // 日期格式化 (例如 20261101 -> 11/01)
                const fDate = day.forecastDate;
                const formattedDate = `${fDate.substring(4, 6)}/${fDate.substring(6, 8)}`;
                
                replyText += `• **${formattedDate} (${day.week})**\n`;
                replyText += `  🌡️ 氣溫：${day.forecastMintemp.value}°C - ${day.forecastMaxtemp.value}°C\n`;
                replyText += `  ☁️ 天氣：${day.forecastWeather}\n`;
                replyText += `  🌧️ 降雨概率：${day.PSR || '資料未提供'}\n\n`;
            }

            await sock.sendMessage(remoteJid, { text: replyText.trim() }, { quoted: m });

        } else {
            // ☀️ 即時天氣播報 (rhrread)
            const res = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc');
            const data = await res.json();

            const tempObj = data.temperature?.data?.find(t => t.place === '香港天文台') || data.temperature?.data?.[0];
            const temp = tempObj ? `${tempObj.value}°C` : '未知';
            
            const humidityObj = data.humidity?.data?.[0];
            const humidity = humidityObj ? `${humidityObj.value}%` : '未知';

            const warningMsg = data.warningMessage ? `⚠️ 生效警告：${data.warningMessage.join('、')}\n` : '';
            const rainObj = data.rainfall?.data?.find(r => r.place === '中西區') || data.rainfall?.data?.[0];
            const rainfall = rainObj ? `${rainObj.max} 毫米` : '0 毫米';

            const replyText = `🌤️ 【香港天文台 • 即時天氣播報】\n` +
                              `───────────────────\n` +
                              `${warningMsg}` +
                              `🌡️ 當前氣溫：**${temp}**\n` +
                              `💧 相對濕度：**${humidity}**\n` +
                              `🌧️ 雨量紀錄：**${rainfall}**\n` +
                              `📝 天氣概況：${data.forecastDesc || '晴朗或多雲'}\n\n` +
                              `💡 想看更詳細的 7 天預報與降雨機率嗎？請輸入 **!7天天氣** 喔！`;

            await sock.sendMessage(remoteJid, { text: replyText }, { quoted: m });
        }
    } catch (e) {
        console.error('❌ 獲取天氣失敗:', e);
        await sock.sendMessage(remoteJid, { text: `❌ 哎呀！連線到香港天文台伺服器失敗了，請稍後再試！` }, { quoted: m });
    }

    return true;
}

module.exports = { handleWeatherCommand };
