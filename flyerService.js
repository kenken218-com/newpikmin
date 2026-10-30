// ==========================================
// 🌸 花農群專用服務模組 (flyerService.js) - 具備二次確認機制
// ==========================================
const { generateHomeworkReport, aiCheckHomeworkAdvanced } = require('./homeworkService');

const userRecentMessages = {};

// 🛡️ 暫存待確認的危險操作：key = senderPhone, value = { type, target, expiresAt }
const pendingActions = {};

async function handleFlyerMessage(sock, m, remoteJid, senderPhone, senderName, messageContent, homeworkData, saveHomeworkData, backupHomeworkData, db, ai, scheduleMultipleDeletions) {
    
    // 🛡️ 處理二次確認指令：!確認
    if (messageContent === '!確認' || messageContent === '！確認') {
        const pending = pendingActions[senderPhone];
        if (!pending || Date.now() > pending.expiresAt) {
            delete pendingActions[senderPhone];
            await sock.sendMessage(remoteJid, { text: `⚠️ 目前沒有需要你確認的待執行操作，或確認時間已過期。` }, { quoted: m });
            return;
        }

        // 清除暫存
        delete pendingActions[senderPhone];

        if (pending.type === 'delete_user') {
            const name = pending.target;
            if (homeworkData[name]) {
                await backupHomeworkData();
                delete homeworkData[name];
                await saveHomeworkData(homeworkData);
                await sock.sendMessage(remoteJid, { text: `🗑️ 【確認執行】已成功移除成員「${name}」！\n\n` + generateHomeworkReport(homeworkData) }, { quoted: m });
            } else {
                await sock.sendMessage(remoteJid, { text: `❌ 找不到名為「${name}」的成員！` }, { quoted: m });
            }
        } else if (pending.type === 'reset_all') {
            await backupHomeworkData();
            for (const name in homeworkData) {
                homeworkData[name].flower = false;
                homeworkData[name].q1 = false;
                homeworkData[name].q2 = false;
            }
            await saveHomeworkData(homeworkData);
            await sock.sendMessage(remoteJid, { text: `🔄 【確認執行】全新一期開始！已成功清空所有成員的本期功課記錄！\n\n` + generateHomeworkReport(homeworkData) }, { quoted: m });
        }
        return;
    }

    // 1. 綁定 ID
    if (messageContent === '!id' || messageContent === '！id') {
        if (!senderPhone) {
            await sock.sendMessage(remoteJid, { text: `⚠️ 無法識別你的電話號碼，請稍後再試。` }, { quoted: m });
            return;
        }
        let matchedName = Object.keys(homeworkData).find(n => n.toLowerCase() === senderName.toLowerCase());
        if (matchedName) {
            homeworkData[matchedName].phone = senderPhone;
            await saveHomeworkData(homeworkData);
            await sock.sendMessage(remoteJid, { text: `🌱 感謝！已記錄資訊：${matchedName} (電話：${senderPhone})` }, { quoted: m });
        } else {
            await sock.sendMessage(remoteJid, { text: `🌱 感謝！已記錄資訊：${senderName} (電話：${senderPhone})，未在名單中找到同名記錄。` }, { quoted: m });
        }
        return;
    }

    // 3. 加人
    if (messageContent.startsWith('!ai加人') || messageContent.startsWith('！ai加人')) {
        const name = messageContent.replace(/^(!ai加人|！ai加人)/, '').trim();
        if (name) {
            await backupHomeworkData();
            homeworkData[name] = { phone: "", flower: false, q1: false, q2: false };
            await saveHomeworkData(homeworkData);
            await sock.sendMessage(remoteJid, { text: `✅ 已成功新增成員「${name}」！\n\n` + generateHomeworkReport(homeworkData) });
        }
        return;
    }

    // 4. 刪人（改為需要二次確認）
    if (messageContent.startsWith('!ai刪人') || messageContent.startsWith('！ai刪人') || messageContent.startsWith('!刪人') || messageContent.startsWith('！刪人')) {
        const name = messageContent.replace(/^(!ai刪人|！ai刪人|!刪人|！刪人)/, '').trim();
        if (!homeworkData[name]) {
            await sock.sendMessage(remoteJid, { text: `❌ 找不到名為「${name}」的成員！` }, { quoted: m });
            return;
        }

        // 記錄暫存並要求 30 秒內回覆 !確認
        pendingActions[senderPhone] = {
            type: 'delete_user',
            target: name,
            expiresAt: Date.now() + 30000
        };

        await sock.sendMessage(remoteJid, { 
            text: `⚠️ 【安全確認】你正在嘗試移除成員「${name}」！\n請在 **30 秒內**回覆 **「!確認」** 以完成刪除操作。` 
        }, { quoted: m });
        return;
    }

    // 5. 清除記錄
    if (messageContent.startsWith('!ai清除記錄') || messageContent.startsWith('！ai清除記錄') || messageContent.startsWith('!ai清記錄') || messageContent.startsWith('！ai清記錄')) {
        const name = messageContent.replace(/^(!ai清除記錄|！ai清除記錄|!ai清記錄|！ai清記錄)/, '').trim();
        let matchedName = Object.keys(homeworkData).find(n => n.toLowerCase() === name.toLowerCase()) || name;
        if (homeworkData[matchedName]) {
            await backupHomeworkData();
            homeworkData[matchedName].flower = false;
            homeworkData[matchedName].q1 = false;
            homeworkData[matchedName].q2 = false;
            await saveHomeworkData(homeworkData);
            await sock.sendMessage(remoteJid, { text: `🔄 已清空成員「${matchedName}」本期的功課記錄！\n\n` + generateHomeworkReport(homeworkData) });
        }
        return;
    }

    // 6. 提醒
    if (messageContent === '!提醒' || messageContent === '！提醒') {
        let pendingPeopleText = [];
        let mentions = [];

        for (const [name, status] of Object.entries(homeworkData)) {
            if (!status.flower && !status.q1 && !status.q2) {
                if (status.phone) {
                    const targetJid = `${status.phone}@s.whatsapp.net`;
                    mentions.push(targetJid);
                    pendingPeopleText.push(`• @${status.phone} (${name})`);
                } else {
                    pendingPeopleText.push(`• ${name} ⚠️(未打 !id)`);
                }
            }
        }

        let text = `🔔 【功課催繳提醒】\n\n以下皮友本期尚未完成功課：\n` + (pendingPeopleText.length > 0 ? pendingPeopleText.join('\n') : `🎉 全員已完成！`);
        text += `\n\n⚠️ 溫馨提示：本期未完成功課者將於截止後被移除！\n💡 還未綁定的皮友，請在群裡輸入「!id」即可完成綁定！`;
        await sock.sendMessage(remoteJid, { text, mentions }, { quoted: m });
        return;
    }

    // 7. 功課表
    if (messageContent === '!功課' || messageContent === '！功課') {
        await sock.sendMessage(remoteJid, { text: generateHomeworkReport(homeworkData) }, { quoted: m });
        return;
    }

    // 🔄 整期重置（改為需要二次確認）
    if (messageContent === '!ai整期重置' || messageContent === '！ai整期重置' || messageContent === '!ai清空全部' || messageContent === '！ai清空全部') {
        pendingActions[senderPhone] = {
            type: 'reset_all',
            expiresAt: Date.now() + 30000
        };

        await sock.sendMessage(remoteJid, { 
            text: `⚠️ 【高風險安全確認】你正在嘗試 **清空所有成員** 的本期所有功課記錄！\n請在 **30 秒內**回覆 **「!確認」** 才會正式執行重置。` 
        }, { quoted: m });
        return;
    }

    // 8. 座標與功課自動審核計時器
    if (!userRecentMessages[senderName]) {
        userRecentMessages[senderName] = { text: '', messageIds: [] };
    }
    userRecentMessages[senderName].text += '\n' + messageContent;
    userRecentMessages[senderName].messageIds.push(m.key.id);

    if (userRecentMessages[senderName].timer) clearTimeout(userRecentMessages[senderName].timer);

    const currentSender = senderName;
    const accumulatedText = userRecentMessages[currentSender].text;
    const accumulatedMsgIds = [...userRecentMessages[currentSender].messageIds];

    userRecentMessages[currentSender].timer = setTimeout(async () => {
        try {
            const result = await aiCheckHomeworkAdvanced(accumulatedText, ai);
            let matchedName = Object.keys(homeworkData).find(n => n.toLowerCase() === currentSender.toLowerCase()) || currentSender;
            
            if (!homeworkData[matchedName]) {
                homeworkData[matchedName] = { phone: senderPhone, flower: false, q1: false, q2: false };
            }

            const alreadyCompleted = homeworkData[matchedName].flower || homeworkData[matchedName].q1 || homeworkData[matchedName].q2;

            if (result === 'need_flower_name') {
                if (alreadyCompleted) {
                    await sock.sendMessage(remoteJid, { text: `🌱 感謝 ${currentSender} 額外分享座標！☕🌸` });
                } else {
                    await sock.sendMessage(remoteJid, { text: `🌱 收到 ${currentSender} 嘅座標分享！請問哩度種嘅係咩花呀？（回覆花名即可記錄功課喔！）` });
                }
            } else if (result === 'flower' || result === 'force_open_full') {
                await backupHomeworkData();
                if (result === 'flower') homeworkData[matchedName].flower = true;
                else if (!homeworkData[matchedName].flower) {
                    if (!homeworkData[matchedName].q1) homeworkData[matchedName].q1 = true;
                    else homeworkData[matchedName].q2 = true;
                }

                if (senderPhone && !homeworkData[matchedName].phone) {
                    homeworkData[matchedName].phone = senderPhone;
                }

                await saveHomeworkData(homeworkData);

                if (alreadyCompleted) {
                    await sock.sendMessage(remoteJid, { text: `🌱 ${currentSender} 早已完成功課，感激你的額外分享！☕🌸` });
                } else {
                    await sock.sendMessage(remoteJid, { text: `✅ 收到 ${currentSender} 的功課！已更新手冊：\n\n` + generateHomeworkReport(homeworkData) });
                }

                await scheduleMultipleDeletions(remoteJid, accumulatedMsgIds, m.key.participant || remoteJid, 50 * 60 * 1000);
            }
        } catch (e) {
        } finally {
            delete userRecentMessages[currentSender];
        }
    }, 60000);
}

module.exports = { handleFlyerMessage };