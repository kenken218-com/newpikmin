// ==========================================
// 🍃 敏敏即時狀態與好感度管理 (MongoDB 持久化版) (mimikiState.js)
// ==========================================

async function getRoomMimikiState(db, remoteJid) {
    if (!db) {
        return { nectar: 80, lastUpdate: Date.now(), userAffinities: {} };
    }
    try {
        const collection = db.collection('cafe_mimiki_state');
        let doc = await collection.findOne({ _id: `mimiki_state_${remoteJid}` });
        if (!doc) {
            doc = {
                _id: `mimiki_state_${remoteJid}`,
                nectar: 80,
                lastUpdate: Date.now(),
                userAffinities: {}
            };
            await collection.insertOne(doc);
        }
        return doc;
    } catch (e) {
        console.error(`❌ 載入敏敏狀態失敗 [${remoteJid}]:`, e);
        return { nectar: 80, lastUpdate: Date.now(), userAffinities: {} };
    }
}

async function saveRoomMimikiState(db, remoteJid, state) {
    if (!db) return;
    try {
        const collection = db.collection('cafe_mimiki_state');
        await collection.updateOne(
            { _id: `mimiki_state_${remoteJid}` },
            { 
                $set: { 
                    nectar: state.nectar, 
                    lastUpdate: state.lastUpdate, 
                    userAffinities: state.userAffinities, 
                    updatedAt: new Date() 
                } 
            },
            { upsert: true }
        );
    } catch (e) {
        console.error(`❌ 儲存敏敏狀態失敗 [${remoteJid}]:`, e);
    }
}

async function updateAndGetMimikiStatusText(db, remoteJid, userMessage, senderName) {
    // 1. 從 MongoDB 讀取該群組的敏敏狀態
    const state = await getRoomMimikiState(db, remoteJid);
    const now = new Date();
    const hkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
    const hour = hkTime.getHours();
    const timeStr = hkTime.toTimeString().slice(0, 5);

    // 2. 初始化或累積當前發言成員的好感度
    if (!state.userAffinities[senderName]) {
        state.userAffinities[senderName] = { points: 10, level: 1 };
    }
    state.userAffinities[senderName].points += 1; // 每次發言 +1 分

    // 3. 隨時間自然消耗精華 (每 2 小時扣 2.5 點)
    const hoursPassed = (Date.now() - state.lastUpdate) / (1000 * 60 * 60);
    if (hoursPassed >= 2) {
        state.nectar = Math.max(0, state.nectar - Math.floor(hoursPassed * 2.5));
        state.lastUpdate = Date.now();
    }

    // 4. 偵測群友是否餵食
    const foodMatch = userMessage.match(/(🍓|🍎|🍊|🍋|🍉|🍇|🍰|🍩|☕|🧋|精華|餵敏敏)/);
    let justFedNote = "無";
    
    if (foodMatch) {
        state.nectar = Math.min(100, state.nectar + 35);
        state.userAffinities[senderName].points += 15; // 餵食大幅加好感度 (+15分)
        justFedNote = `剛剛「${senderName}」餵咗你食【${foodMatch[0]}】！`;
    }

    // 計算好感度等級 (每 50 積分升 1 級)
    const userPoints = state.userAffinities[senderName].points;
    const userLevel = Math.floor(userPoints / 50) + 1;
    state.userAffinities[senderName].level = userLevel;

    // 5. 將更新後的狀態寫回 MongoDB 持久化保存
    await saveRoomMimikiState(db, remoteJid, state);

    // 6. 時段判斷
    let period = "晚上";
    if (hour >= 6 && hour < 11) period = "早上 (充滿朝氣準備沖咖啡)";
    else if (hour >= 11 && hour < 14) period = "中午 (關心大家食飯同種花)";
    else if (hour >= 14 && hour < 18) period = "下午茶時段 (想食甜品或飲果汁)";
    else if (hour >= 18 && hour < 23) period = "晚上 (放鬆吹水時間)";
    else period = "深宵 (帶點睡意，提醒大家早抖)";

    // 7. 飽足度與頭頂狀態（含 100% 餵滿爆發狀態）
    let hungerDesc = "精力充沛，頭頂開滿靚靚小花 🌸";
    if (state.nectar >= 100) {
        hungerDesc = "✨ 【精華滿溢 100% 爆發】頭頂開出發光巨型彩虹花！飽到上心口，開心到飛起，會撒嬌拒絕再食！";
    } else if (state.nectar < 30) {
        hungerDesc = "嚴重肚餓，頭頂嫩芽垂低咗 🌱 嗚... 想飲精華！";
    } else if (state.nectar < 60) {
        hungerDesc = "有少少肚餓，頭頂係花苞 🌷";
    }

    return `【敏敏即時狀態與好感度】：
- 香港時間：${timeStr} (${period})
- 飽足度：${state.nectar}% (${hungerDesc})
- 當前對話成員：${senderName} (好感度: Lv.${userLevel})
- ${justFedNote !== "無" ? `✨ 特別事件：${justFedNote}` : ''}`;
}

module.exports = { updateAndGetMimikiStatusText };
