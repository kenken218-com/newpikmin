// ==========================================
// 🌦️ 香港天文台天氣服務 (weatherService.js)
// ==========================================

async function getHKWeather() {
    try {
        const res = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrh&lang=tc');
        const data = await res.json();

        const tempObj = data.temperature?.data?.find(t => t.place === '香港天文台');
        const temp = tempObj ? `${tempObj.value}°C` : '未知';
        const humidityObj = data.humidity?.data?.[0];
        const humidity = humidityObj ? `${humidityObj.value}%` : '未知';
        const uvintObj = data.uvinfo?.data?.[0];
        const uv = uvintObj ? `${uvintObj.desc} (${uvintObj.value})` : '無資料';

        let report = `╭──────────────────────╮\n`;
        report += `│  ☁️ 香港天文台即時天氣播報  │\n`;
        report += `╰──────────────────────╯\n\n`;
        report += `🌡️ **氣溫**：${temp}\n`;
        report += `💧 **相對濕度**：${humidity}\n`;
        report += `☀️ **紫外線指數**：${uv}\n\n`;
        report += `🌱 **小呆貼心提醒**：出門種花記得留意天氣同帶遮呀！`;
        return report;
    } catch (e) {
        return `❌ 哎呀，天文台連線塞車緊，陣間再試過啦！`;
    }
}

async function handleWeatherCommand(sock, m, remoteJid, messageContent) {
    if (messageContent === '!天氣' || messageContent === '！天氣' || messageContent === '!天文台' || messageContent === '！天文台') {
        const weatherText = await getHKWeather();
        await sock.sendMessage(remoteJid, { text: weatherText }, { quoted: m });
        return true;
    }
    return false;
}

module.exports = { handleWeatherCommand };