// ==========================================
// 🌸 花農群專用服務模組 (flyerService.js) [強開不刪除、額外種花自動清理最終版]
// ==========================================
const { generateHomeworkReport, aiCheckHomeworkAdvanced } = require('./homeworkService');

const userRecentMessages = {};

// 🛡️ 暫存待確認的危險操作：key = 識別用key, value = { type, target, expiresAt }
const pendingActions = {};

async function handleFlyerMessage(sock, m, remoteJid, senderPhone, senderName, messageContent, homeworkData, saveHomeworkData, backupHomeworkData, db, ai, scheduleMultipleDeletions) {
    
    // 🛡️ 取得發言者的真實 WhatsApp ID 與電話
    const senderJid = m.key.participant || m.key.remoteJid;
    const actionKey = senderJid || senderPhone || senderName;

    // 🛡️ 處理二次確認指令：!確認 (支援容錯空格)
    const isConfirmCmd = /^[!！]\s*確認$/.test(messageContent);
    if (isConfirmCmd) {
        const pending = pendingActions[actionKey];
        if (!pending || Date.now() > pending.expiresAt) {
            delete pendingActions[actionKey];
            await sock.sendMessage(remoteJid, { text: `⚠️ 目前沒有需要你確認的待執行操作，或確認時間已過期。` }, { quoted: m });
            return;
        }

        // 清除暫存
        delete pendingActions[actionKey];

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
                // 👈 跳過 meta 欄位，避免把 __periodStart 當成員改寫
                if (name.startsWith('__')) continue;
                homeworkData[name].flower = false;
                homeworkData[name].q1 = false;
                homeworkData[name].q2 = false;
            }
            // 👈 記錄本期起點，讓 !功課 的截止日期由此推算
            homeworkData.__periodStart = new Date().toISOString();
            await saveHomeworkData(homeworkData);
            await sock.sendMessage(remoteJid, { text: `🔄 【確認執行】全新一期開始！已成功清空所有成員的本期功課記錄！\n\n` + generateHomeworkReport(homeworkData) }, { quoted: m });
        }
        return;
    }

    // 1. 綁定 ID (保留指令供手動校正用)
    const isIdCmd = /^[!！]\s*id$/.test(messageContent);
    if (isIdCmd) {
        let matchedName = Object.keys(homeworkData).find(n => n.toLowerCase() === senderName.toLowerCase());
        if (matchedName) {
            homeworkData[matchedName].id = senderJid;
            if (senderPhone) homeworkData[matchedName].phone = senderPhone;
            await saveHomeworkData(homeworkData);
            await sock.sendMessage(remoteJid, { text: `🌱 感謝！已成功綁定資料：${matchedName}` }, { quoted: m });
        } else {
            await sock.sendMessage(remoteJid, { text: `🌱 感謝！已記錄你的 ID 與電話，未在名單中找到同名記錄。` }, { quoted: m });
        }
        return;
    }

    // 2. 🌸 手動修改成員功課記錄指令：!修改記錄 成員名 狀態
    if (/^[!！]\s*修改(記|紀)錄?/.test(messageContent)) {
        const rawParam = messageContent.replace(/^[!！]\s*修改(記|紀)錄?/, '').trim();
        const parts = rawParam.split(/\s+/);
        
        if (parts.length < 2) {
            await sock.sendMessage(remoteJid, { text: `⚠️ 格式錯誤！請使用：\n!修改記錄 [成員名字] [狀態]\n(狀態可填: 🌸/種花, 1, 2, 未完成)` }, { quoted: m });
            return;
        }

        const targetNameQuery = parts[0];
        const statusQuery = parts[1].toLowerCase();

        const cleanStr = (str) => str.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
        let matchedName = Object.keys(homeworkData).find(n => cleanStr(n) === cleanStr(targetNameQuery));

        if (!matchedName) {
            await sock.sendMessage(remoteJid, { text: `❌ 找不到名為「${targetNameQuery}」的成員！請確認名字是否正確。` }, { quoted: m });
            return;
        }

        await backupHomeworkData();

        if (statusQuery.includes('🌸') || statusQuery.includes('種花') || statusQuery.includes('flower') || statusQuery === '花') {
            homeworkData[matchedName].flower = true;
            homeworkData[matchedName].q1 = false;
            homeworkData[matchedName].q2 = false;
        } else if (statusQuery === 'q1' || statusQuery === '1' || statusQuery.includes('強開1')) {
            homeworkData[matchedName].q1 = true;
            homeworkData[matchedName].flower = false;
            homeworkData[matchedName].q2 = false;
        } else if (statusQuery === 'q2' || statusQuery === '2' || statusQuery.includes('強開2')) {
            homeworkData[matchedName].q2 = true;
            homeworkData[matchedName].flower = false;
            homeworkData[matchedName].q1 = false;
        } else if (statusQuery.includes('未完成') || statusQuery.includes('清空') || statusQuery === '0' || statusQuery.includes('取消')) {
            homeworkData[matchedName].flower = false;
            homeworkData[matchedName].q1 = false;
            homeworkData[matchedName].q2 = false;
        } else {
            await sock.sendMessage(remoteJid, { text: `❌ 無效的狀態指令「${parts[1]}」！\n支援的狀態：🌸 (種花)、q1 / q2 (強開)、未完成` }, { quoted: m });
            return;
        }

        await saveHomeworkData(homeworkData);
        await sock.sendMessage(remoteJid, { text: `✅ 已成功將成員「${matchedName}」的功課狀態更新為「${parts[1]}」！\n\n` + generateHomeworkReport(homeworkData) }, { quoted: m });
        return;
    }

    // 3. 加人
    if (messageContent.startsWith('!ai加人') || messageContent.startsWith('！ai加人') || messageContent.startsWith('! ai加人') || messageContent.startsWith('！ ai加人')) {
        const name = messageContent.replace(/^[!！]\s*ai加人/, '').trim();
        if (name) {
            await backupHomeworkData();
            homeworkData[name] = { id: "", phone: "", flower: false, q1: false, q2: false };
            await saveHomeworkData(homeworkData);
            await sock.sendMessage(remoteJid, { text: `✅ 已成功新增成員「${name}」！\n\n` + generateHomeworkReport(homeworkData) });
        }
        return;
    }

    // 4. 刪人（改為需要二次確認）
    // 👈 修正：改用與 !修改記錄 相同的 cleanStr 模糊匹配，避免全形/空白/標點造成「找不到」
    if (/^[!！]\s*(ai刪人|刪人)/.test(messageContent)) {
        const rawName = messageContent.replace(/^[!！]\s*(ai刪人|刪人)/, '').trim();

        const cleanStr = (str) => str.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
        let matchedName = Object.keys(homeworkData).find(
            n => !n.startsWith('__') && cleanStr(n) === cleanStr(rawName)
        );

        if (!matchedName) {
            // 👈 找不到時，把目前名單印出來方便核對
            const allNames = Object.keys(homeworkData)
                .filter(n => !n.startsWith('__'))
                .map(n => `「${n}」`)
                .join('、');
            await sock.sendMessage(remoteJid, {
                text: `❌ 找不到名為「${rawName}」的成員！\n\n📋 目前名單：\n${allNames || '（空）'}\n\n請確認名字是否與上面完全一致。`
            }, { quoted: m });
            return;
        }

        pendingActions[actionKey] = {
            type: 'delete_user',
            target: matchedName, // 👈 用匹配到的實際 key
            expiresAt: Date.now() + 30000
        };

        await sock.sendMessage(remoteJid, { 
            text: `⚠️ 【安全確認】你正在嘗試移除成員「${matchedName}」！\n請在 **30 秒內**回覆 **「!確認」** 以完成刪除操作。` 
        }, { quoted: m });
        return;
    }

    // 5. 清除記錄
    if (/^[!！]\s*(ai清除記錄|ai清記錄|清除記錄|清記錄)/.test(messageContent)) {
        const name = messageContent.replace(/^[!！]\s*(ai清除記錄|ai清記錄|清除記錄|清記錄)/, '').trim();
        
        const cleanStr = (str) => str.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
        let matchedName = Object.keys(homeworkData).find(n => cleanStr(n) === cleanStr(name)) || name;

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
    const isReminderCmd = /^[!！]\s*提醒$/.test(messageContent);
    if (isReminderCmd) {
        let pendingPeopleText = [];
        let mentions = [];

        for (const [name, status] of Object.entries(homeworkData)) {
            // 👈 跳過 meta 欄位，避免 __periodStart 被當成未完成成員催繳
            if (name.startsWith('__')) continue;

            if (!status.flower && !status.q1 && !status.q2) {
                if (status.id) {
                    mentions.push(status.id);
                    pendingPeopleText.push(`• @${status.id.split('@')[0]} (${name})`);
                } else if (status.phone) {
                    const targetJid = `${status.phone}@s.whatsapp.net`;
                    mentions.push(targetJid);
                    pendingPeopleText.push(`• @${status.phone} (${name})`);
                } else {
                    pendingPeopleText.push(`• ${name}`);
                }
            }
        }

        let text = `🔔 【功課催繳提醒】\n\n以下皮友本期尚未完成功課：\n` + (pendingPeopleText.length > 0 ? pendingPeopleText.join('\n') : `🎉 全員已完成！`);
        text += `\n\n⚠️ 溫馨提示：本期未完成功課者將於截止後被移除！`;
        await sock.sendMessage(remoteJid, { text, mentions }, { quoted: m });
        return;
    }

    // 7. 功課表
    const isHomeworkCmd = /^[!！]\s*功課$/.test(messageContent);
    if (isHomeworkCmd) {
        await sock.sendMessage(remoteJid, { text: generateHomeworkReport(homeworkData) }, { quoted: m });
        return;
    }

    // 🔄 整期重置
    const isResetAllCmd = /^[!！]\s*(ai整期重置|ai清空全部|整期重置|清空全部)$/.test(messageContent);
    if (isResetAllCmd) {
        pendingActions[actionKey] = {
            type: 'reset_all',
            expiresAt: Date.now() + 30000
        };

        await sock.sendMessage(remoteJid, { 
            text: `⚠️ 【高風險安全確認】你正在嘗試 **清空所有成員** 的本期所有功課記錄！\n請在 **30 秒內**回覆 **「!確認」** 才會正式執行重置。` 
        }, { quoted: m });
        return;
    }

    // 8. 座標與功課自動審核計時器（三層遞進式比對：ID ➔ 電話 ➔ 名字）
    if (!userRecentMessages[senderName]) {
        userRecentMessages[senderName] = { text: '', messageIds: [] };
    }
    userRecentMessages[senderName].text += '\n' + messageContent;
    userRecentMessages[senderName].messageIds.push(m.key.id);

    if (userRecentMessages[senderName].timer) clearTimeout(userRecentMessages[senderName].timer);

    const currentSender = senderName;
    const currentJid = senderJid;
    const currentPhone = senderPhone;
    const accumulatedText = userRecentMessages[currentSender].text;
    const accumulatedMsgIds = [...userRecentMessages[currentSender].messageIds];

    userRecentMessages[currentSender].timer = setTimeout(async () => {
        try {
            const result = await aiCheckHomeworkAdvanced(accumulatedText, ai);
            
            const cleanStr = (str) => str.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
            let matchedName = null;

            if (currentJid) {
                matchedName = Object.keys(homeworkData).find(n => homeworkData[n].id === currentJid);
            }
            if (!matchedName && currentPhone) {
                matchedName = Object.keys(homeworkData).find(n => homeworkData[n].phone === currentPhone);
            }
            if (!matchedName) {
                matchedName = Object.keys(homeworkData).find(n => cleanStr(n) === cleanStr(currentSender));
            }

            if (!matchedName) {
                matchedName = currentSender;
                homeworkData[matchedName] = { id: currentJid || "", phone: currentPhone || "", flower: false, q1: false, q2: false };
            } else {
                if (matchedName !== currentSender && !homeworkData[currentSender]) {
                    await backupHomeworkData();
                    homeworkData[currentSender] = { 
                        ...homeworkData[matchedName], 
                        id: currentJid || homeworkData[matchedName].id, 
                        phone: currentPhone || homeworkData[matchedName].phone 
                    };
                    delete homeworkData[matchedName];
                    matchedName = currentSender;
                }

                if (currentJid && !homeworkData[matchedName].id) {
                    homeworkData[matchedName].id = currentJid;
                }
                if (currentPhone && !homeworkData[matchedName].phone) {
                    homeworkData[matchedName].phone = currentPhone;
                }
            }

            const alreadyCompleted = homeworkData[matchedName].flower || homeworkData[matchedName].q1 || homeworkData[matchedName].q2;

            // 🧹 標記是否需要加入 50 分鐘自動刪除排程（僅限種花相關，強開不刪除）
            let needScheduleDeletion = false;

            if (result === 'social_share') {
                await sock.sendMessage(remoteJid, { text: `🌱 收到 ${currentSender} 分享的社群貼文，感謝分享！🙌（此訊息不列入功課計算喔～）` });
            } else if (result === 'need_flower_name') {
                needScheduleDeletion = true; // 👈 補座標/種花分享要刪除
                if (alreadyCompleted) {
                    await sock.sendMessage(remoteJid, { text: `🌱 感謝 ${currentSender} 額外分享座標！☕🌸` });
                } else {
                    await sock.sendMessage(remoteJid, { text: `🌱 收到 ${currentSender} 嘅座標分享！請問哩度種嘅係咩花呀？（回覆花名即可記錄功課喔！）` });
                }
            } else if (result === 'flower' || result === 'force_open_full') {
                
                // 💡 核心過濾：只有 result 是 'flower' 時才標記刪除；如果是 'force_open_full' (強開)，則維持 false（不刪除）！
                if (result === 'flower') {
                    needScheduleDeletion = true;
                }

                await backupHomeworkData();
                if (result === 'flower') homeworkData[matchedName].flower = true;
                else if (!homeworkData[matchedName].flower) {
                    if (!homeworkData[matchedName].q1) homeworkData[matchedName].q1 = true;
                    else homeworkData[matchedName].q2 = true;
                }

                await saveHomeworkData(homeworkData);

                if (alreadyCompleted) {
                    await sock.sendMessage(remoteJid, { text: `🌱 ${currentSender} 早已完成功課，感激你的額外分享！☕🌸` });
                } else {
                    await sock.sendMessage(remoteJid, { text: `✅ 收到 ${currentSender} 的功課！已更新手冊：\n\n` + generateHomeworkReport(homeworkData) });
                }
            } else {
                const isAttemptingCommand = accumulatedText.trim().startsWith('!') || accumulatedText.trim().startsWith('！');

                if (!alreadyCompleted && isAttemptingCommand) {
                    await sock.sendMessage(remoteJid, { 
                        text: `🌱 哎呀 @${currentSender}，小助手睇唔太明哩個指令喎～\n如果是第一次交功課或唔知點樣打，可以隨時輸入 **!指令** 查看花農群操作手冊喔！`,
                        mentions: [senderJid]
                    }, { quoted: m });
                }
            }

            // 🧹 【條件式自動清理】只有種花或補座標訊息會被加入 50 分鐘刪除排程，強開訊息會保留不刪！
            if (needScheduleDeletion) {
                await scheduleMultipleDeletions(remoteJid, accumulatedMsgIds, m.key.participant || remoteJid, 50 * 60 * 1000);
            }
        } catch (e) {
            console.error('❌ 處理功課計時器錯誤:', e);
        } finally {
            delete userRecentMessages[currentSender];
        }
    }, 15000); // 15秒快速響應
}

module.exports = { handleFlyerMessage };
