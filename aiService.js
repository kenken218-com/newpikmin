// ==========================================
// 🤖 AI 聊天與長期記憶服務 (aiService.js)
// ==========================================
const { PIKMIN_SYSTEM_PROMPT } = require('./config');

let cafeMemory = { recentHistory: [], userProfiles: {} };

async function loadLongTermMemory(db) {
    if (db) {
        try {
            const collection = db.collection('cafe_memory');
            const doc = await collection.findOne({ _id: 'memory_data' });
            if (doc) {
                cafeMemory = { recentHistory: doc.recentHistory || [], userProfiles: doc.userProfiles || {} };
            }
        } catch (e) {}
    }
    return cafeMemory;
}

async function saveLongTermMemory(db) {
    if (db) {
        try {
            const collection = db.collection('cafe_memory');
            await collection.updateOne(
                { _id: 'memory_data' },
                { $set: { recentHistory: cafeMemory.recentHistory, userProfiles: cafeMemory.userProfiles, updatedAt: new Date() } },
                { upsert: true }
            );
        } catch (e) {}
    }
}

async function recordCafeMessage(db, senderName, role, text) {
    cafeMemory.recentHistory.push({ senderName, role, text, time: new Date().toLocaleString() });
    if (cafeMemory.recentHistory.length > 40) cafeMemory.recentHistory.shift();
    await saveLongTermMemory(db);
}

async function fetchOpenRouterGemmaFree(fullPrompt) {
    const openRouterKey = process.env.OPENROUTER_API_KEY || "";
    if (!openRouterKey) throw new Error("未設定 OPENROUTER_API_KEY");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": "google/gemma-4-31b-it:free", 
            "messages": [
                { "role": "system", "content": PIKMIN_SYSTEM_PROMPT },
                { "role": "user", "content": fullPrompt }
            ]
        })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

async function processAIChat(sock, remoteJid, senderName, query, messageObj, db, ai) {
    console.log(`🚀 [AI 聊天啟動] 收到來自 ${senderName} 的提問: "${query}"`);
    await recordCafeMessage(db, senderName, 'user', query);

    const userTraits = cafeMemory.userProfiles[senderName] || [];
    const profileText = userTraits.length > 0 ? `你對 ${senderName} 的長期印象是：[${userTraits.join(', ')}]` : `這是你新認識或正在熟悉的朋友 ${senderName}。`;
    const historyText = cafeMemory.recentHistory.slice(-25).map(m => `[${m.senderName}]: ${m.text}`).join('\n');

    const fullPrompt = `
【成員長期檔案】:
${profileText}

【☕ 最近對話歷史】:
${historyText}

現在 ${senderName} 對你說："${query}"
請以「皮皮小管家/小呆」身份用道地香港廣東話親切回覆：`;

    let replyText = '';
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: fullPrompt,
            config: { systemInstruction: PIKMIN_SYSTEM_PROMPT }
        });
        replyText = response.text;
    } catch (err1) {
        console.warn('⚠️ Gemini AI 失敗，切換至 OpenRouter 備用線路...', err1.message);
        try {
            replyText = await fetchOpenRouterGemmaFree(fullPrompt);
        } catch (err2) {
            replyText = '🌱 哎呀，皮皮小管家同緊鄰嘅夥伴都塞車緊，陣間再試過啦！';
        }
    }

    if (replyText) {
        await recordCafeMessage(db, '皮皮小管家', 'assistant', replyText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: messageObj });
    }
}

module.exports = {
    loadLongTermMemory,
    recordCafeMessage,
    processAIChat
};
