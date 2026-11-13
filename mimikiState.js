// ==========================================
// 🍃 敏敏即時狀態與好感度管理 (mimikiState.js)
// ==========================================

let roomMimikiStates = {};

function getRoomMimikiState(remoteJid) {
    if (!roomMimikiStates[remoteJid]) {
        roomMimikiStates[remoteJid] = {
            nectar: 80, // 0 - 100 飽足度
            lastUpdate: Date.now(),
            userAffinities: {} // 記錄各成員的好感度 { "成員名字": { points, level } }
        };
    }
    return roomMimikiStates[remoteJid];
}

function updateAndGetMimikiStatusText(remoteJid, userMessage, senderName) {
    const state = getRoomMimikiState(remoteJid);
    const now = new Date();
    const hkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
    const hour = hkTime.getHours();
    const timeStr = hkTime.toTimeString().slice(0, 5);

    // 1. 初始化或累積當前發言成員的好感度
    if (!state.userAffinities[senderName]) {
        state.userAffinities[senderName] = { points: 10, level: 1 };
    }
    // 每次正常發言加少許好感度 (+1分)
    state.userAffinities[senderName].points += 1;

    // 2. 隨時間自然消耗精華 (每 2 小時扣 2.5 點)
    const hoursPassed = (Date.now() - state.lastUpdate) / (1000 * 60 * 60);
    if (hoursPassed >= 2) {
        state.nectar = Math.max(0, state.nectar - Math.floor(hoursPassed * 2.5));
        state.lastUpdate = Date.now();
    }

    // 3. 偵測群友是否餵食
    const foodMatch = userMessage.match(/(🍓|🍎|🍊|🍋|🍉|🍇|🍰|🍩|☕|🧋|精華|餵敏敏)/);
    let justFedNote = "無";
    
    if (foodMatch) {
        state.nectar = Math.min(100, state.nectar + 35);
        // 餵食大幅增加好感度 (+15分)
        state.userAffinities[senderName].points += 15;
        justFedNote = `剛剛「${senderName}」餵咗你食【${foodMatch[0]}】，精華大增！`;
    }

    // 計算好感度等級 (每 50 積分升 1 級)
    const userPoints = state.userAffinities[senderName].points;
    const userLevel = Math.floor(userPoints / 50) + 1;
    state.userAffinities[senderName].level = userLevel;

    // 4. 時段判斷
    let period = "晚上";
    if (hour >= 6 && hour < 11) period = "早上 (充滿朝氣準備沖咖啡)";
    else if (hour >= 11 && hour < 14) period = "中午 (關心大家食飯同種花)";
    else if (hour >= 14 && hour < 18) period = "下午茶時段 (想食甜品或飲果汁)";
    else if (hour >= 18 && hour < 23) period = "晚上 (放鬆吹水時間)";
    else period = "深宵 (帶點睡意，提醒大家早抖)";

    // 5. 飽足度與頭頂花朵狀態（含 100% 餵滿爆發狀態）
    let hungerDesc = "精力充沛，頭頂開滿靚靚小花 🌸";
    if (state.nectar >= 100) {
        hungerDesc = "✨ 【精華滿溢 100% 爆發狀態】頭頂開出發光巨型彩虹花！飽到上心口，開心到飛起，甚至會可愛地拒絕繼續食嘢！";
    } else if (state.nectar < 30) {
        hungerDesc = "嚴重肚餓，頭頂嫩芽垂低咗 🌱 嗚... 想飲精華！";
    } else if (state.nectar < 60) {
        hungerDesc = "有少少肚餓，頭頂係花苞 🌷";
    }

    return `【敏敏即時狀態與好感度】：
- 香港時間：${timeStr} (${period})
- 飽足度：${state.nectar}% (${hungerDesc})
- 當前對話成員：${senderName} (當前好感度: Lv.${userLevel}，積分: ${userPoints})
- ${justFedNote !== "無" ? `✨ 特別事件：${justFedNote}` : ''}`;
}

module.exports = { updateAndGetMimikiStatusText };