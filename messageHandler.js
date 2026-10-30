// ==========================================
// 📨 訊息事件路由與處理器 (messageHandler.js)
// ==========================================
const { GROUPS, PIKMIN_SYSTEM_PROMPT } = require('./config');
const { handleFlyerMessage } = require('./flyerService');
const { 
    turtleGame, 
    nameGameSession, 
    handleTarotFortune, 
    startTurtleGame, 
    startNameVote 
} = require('./games');
const { processAIChat } = require('./aiService');

// 🛡️ 引入新擴充服務
const { handleWeatherCommand } = require('./weatherService');
const { handlePlacesWizard } = require('./placesService');
const { handleReminderCommand } = require('./reminderService');

async function handleIncomingMessage(sock, m, db, ai, homeworkData, saveHomeworkData, backupHomeworkData) {
    if (!m.message) return;
    const remoteJid = m.key.remoteJid;
    if (m.key.fromMe) return;

    // 🛡️ 安全解析發送者電話（支援 LID 與 participantPn）
    const senderJid = m.key.participant || remoteJid;
    let senderPhone = '';
    if (m.key.participantPn) {
        senderPhone = m.key.participantPn.replace(/[^0-9]/g, '');
    } else if (!senderJid.endsWith('@lid')) {
        senderPhone = senderJid.split('@')[0].replace(/[^0-9]/g, '');
    }

    const msgObj = m.message;
    const messageContent = (msgObj.conversation || msgObj.extendedTextMessage?.text || msgObj.imageMessage?.caption || '').trim();
    if (!messageContent) return;

    const senderName = m.pushName || '成員';
    const isGroup = remoteJid.endsWith('@g.us');

    // 1. 群組專屬動態指令手冊 (改用 WhatsApp 原生 Poll 投票卡片)
if (messageContent === '!指令' || messageContent === '！指令') {
    if (remoteJid === GROUPS.FLYER) {
        const flyerHelp = `🌸 【花農群 (Flyer) 專用指令手冊】\n\n` +
                          `• !id ── 自動綁定你的電話號碼\n` +
                          `• !功課 ── 查看當前功課繳交手冊與名單\n` +
                          `• !提醒 ── 催繳未完成功課成員\n` +
                          `• !ai加人 [名字] ── 新增成員\n` +
                          `• !ai刪人 [名字] ── 移除成員\n` +
                          `• !ai清記錄 [名字] ── 重置該成員本期功課`;
        await sock.sendMessage(remoteJid, { text: flyerHelp }, { quoted: m });
    } else {
        const cafeHelp = `☕ 【咖啡室群 / 小呆 互動指令手冊】\n\n` +
                         `🎮 !遊戲 ── 互動遊戲菜單（塔羅、海龜湯）\n` +
                         `🌤️ !天氣 ── 即時天氣播報\n` +
                         `🍔 !搵食 ── 搜尋餐廳地標\n` +
                         `⏰ !提醒我 ── 設定個人提醒\n` +
                         `💬 ![說話內容] ── 直接跟小呆對話`;
        await sock.sendMessage(remoteJid, { text: cafeHelp }, { quoted: m });
    }
    return; // 👈 這裡改成 return 即可！
}

    // ==========================================
    // 🌸 FLYER 群組專用審核邏輯
    // ==========================================
    if (remoteJid === GROUPS.FLYER) {
        await handleFlyerMessage(
            sock, m, remoteJid, senderPhone, senderName, messageContent, 
            homeworkData, saveHomeworkData, backupHomeworkData, db, ai, 
            async (jid, ids, participant, delay) => {
                if (!db) return;
                try {
                    const deleteAt = new Date(Date.now() + delay);
                    const docs = ids.map(id => ({ remoteJid: jid, messageId: id, participantJid: participant, deleteAt }));
                    await db.collection('scheduled_deletions').insertMany(docs);
                } catch (e) {}
            }
        );
        return;
    }

    // ==========================================
    // ☕ CAFE / RICE / ADMIN 群組專屬：工具、AI 聊天與遊戲
    // ==========================================
    const isAllowedAIgroup = (
        remoteJid === GROUPS.CAFE || 
        remoteJid === GROUPS.ADMIN || 
        remoteJid === GROUPS.RICE
    );

    if (isAllowedAIgroup && isGroup) {

        // ⏰ 2. 自訂提醒指令 (限 Coffee 群處理)
        const handledReminder = await handleReminderCommand(sock, m, remoteJid, senderJid, senderPhone, senderName, messageContent, db);
        if (handledReminder) return;

        // 🌦️ 3. 天氣即時播報
        const handledWeather = await handleWeatherCommand(sock, m, remoteJid, messageContent);
        if (handledWeather) return;

        // 📍 4. 互動式搵食精靈 (省錢精準 Call API)
        const handledPlaces = await handlePlacesWizard(sock, m, remoteJid, senderJid, senderName, messageContent);
        if (handledPlaces) return;

// 🎮 5. 遊戲專區 (純文字選單)
        if (messageContent === '!遊戲' || messageContent === '！遊戲') {
            const gameMenu = `🎮 【皮皮小管家 遊戲選單】\n\n` +
                             `• !運勢 ── 今日塔羅牌運勢占卜\n` +
                             `• !海龜湯 [簡單/normal] ── 啟動懸疑海龜湯推理\n` +
                             `• !猜人名 ── 發起猜人名限時投票模式`;
            await sock.sendMessage(remoteJid, { text: gameMenu }, { quoted: m });
            return;
        }
        

        if (messageContent === '!運勢' || messageContent === '！運勢') {
            await handleTarotFortune(sock, remoteJid, senderPhone, senderName, m, db, ai, PIKMIN_SYSTEM_PROMPT);
            return;
        }

        if (messageContent.startsWith('!海龜湯') || messageContent.startsWith('！海龜湯')) {
            const arg = messageContent.replace(/^(!海龜湯|！海龜湯)/, '').trim().toLowerCase();
            const diff = (arg === '簡單' || arg === 'easy') ? 'easy' : 'normal';
            await startTurtleGame(sock, remoteJid, diff, m, ai, PIKMIN_SYSTEM_PROMPT);
            return;
        }

        if (messageContent === '!猜人名' || messageContent === '！猜人名') {
            await startNameVote(sock, remoteJid, senderPhone, senderName, m);
            return;
        }

        // 🔒 嚴格發起人權限鎖驗證 (A 模式主題指定)
        if (nameGameSession.active && nameGameSession.step === 'a_waiting_theme') {
            if (messageContent.startsWith('!主題') || messageContent.startsWith('！主題')) {
                if (senderPhone !== nameGameSession.hostPhone) {
                    await sock.sendMessage(remoteJid, { 
                        text: `⚠️ 只有本局遊戲發起人 **@${nameGameSession.hostName}** 才可以指定主題喔！`,
                        mentions: [`${nameGameSession.hostPhone}@s.whatsapp.net`]
                    }, { quoted: m });
                    return;
                }
                const theme = messageContent.replace(/^[!！]主題\s*/, '').trim();
                if (!theme) {
                    await sock.sendMessage(remoteJid, { text: `⚠️ 請輸入有效的主題！例如：!主題 動漫角色` }, { quoted: m });
                    return;
                }
                nameGameSession.theme = theme;
                nameGameSession.step = 'playing';
                await sock.sendMessage(remoteJid, { text: `🎯 【A 模式啟動】主題：${theme}\n小呆已鎖定目標人物，大家快在群組發問或猜測！` });
                return;
            }
        }
    }

    // ==========================================
    // 📱 私訊處理 (B / C 模式)
    // ==========================================
    if (!isGroup) {
        if (nameGameSession.active && nameGameSession.step === 'b_collecting') {
            if (messageContent.startsWith('!出題') || messageContent.startsWith('！出題')) {
                const target = messageContent.replace(/^[!！]出題\s*/, '').trim();
                if (target) {
                    nameGameSession.bPool.push({ name: target, author: senderName });
                    await sock.sendMessage(remoteJid, { text: `✅ 成功提交題目「${target}」！已加入出題池。` });
                }
            }
        }

        if (nameGameSession.active && nameGameSession.step === 'c_waiting_master') {
            if (messageContent.startsWith('!扮演') || messageContent.startsWith('！扮演')) {
                const role = messageContent.replace(/^[!！]扮演\s*/, '').trim();
                if (role && !nameGameSession.secretMasterPhone) {
                    nameGameSession.secretMasterPhone = senderPhone;
                    nameGameSession.secretMasterName = senderName;
                    nameGameSession.targetName = role;
                    nameGameSession.step = 'playing';
                    
                    await sock.sendMessage(remoteJid, { text: `✅ 設定成功！你已成為本局的秘密主持人。你的角色是：**${role}**。請回到群組一起互動，別洩漏答案喔！` });

                    if (nameGameSession.activeGroupJid) {
                        await sock.sendMessage(nameGameSession.activeGroupJid, { 
                            text: `🎭 【C 模式：秘密扮演已就位】\n主持人已完成秘密角色設定！遊戲正式開始，大家快在群組發問（例：「你是男生嗎？」）來拷問和猜測吧！` 
                        });
                    }
                }
            }
        }
    }

    // ==========================================
    // 🤖 一般 AI 聊天
    // ==========================================
    if (isAllowedAIgroup && isGroup) {
        const isCommand = messageContent.startsWith('!') || messageContent.startsWith('！');
        if (isCommand && messageContent.length > 1) {
            const query = messageContent.substring(1).trim();
            const reservedCommands = ['指令', '遊戲', '運勢', '海龜湯', '猜人名', '主題', '出題', '扮演', '提醒我', '天氣', '天文台', '搵食', '餐廳'];
            if (!reservedCommands.some(cmd => query.startsWith(cmd))) {
                setImmediate(() => {
                    processAIChat(sock, remoteJid, senderName, query, m, db, ai);
                });
            }
        }
    }
}

module.exports = { handleIncomingMessage };
