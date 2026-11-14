// ==========================================
// 🚀 終極乾淨入口 (index.js) [防斷線重連最新版]
// ==========================================
require('dotenv').config();
const { default: makeWASocket, DisconnectReason, Browsers, initAuthCreds, proto } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');

const dbService = require('./dbService');
const { initDB, useMongoAuthState, loadHomeworkData, saveHomeworkData, backupHomeworkData } = dbService;

const { handleIncomingMessage } = require('./messageHandler');
const { startCronJobs, startDeletionChecker } = require('./schedulerService');
const { startReminderChecker } = require('./reminderService');
const { initNightlyLearningJob, initAutoSpontaneousChatJob, logDailyCafeMessage } = require('./aiService');

const app = express();
const PORT = process.env.PORT || 3000;
let latestQR = '';
let isConnected = false;
let isConnecting = false;
let currentSock = null; // 👈 【新增】用來隨時指向最新活著的 WhatsApp 連線實例

// 🛡️ 確保背景任務只啟動一次
let isServicesStarted = false; 

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

app.get('/', (req, res) => {
    if (latestQR) res.send(`<html><head><meta http-equiv="refresh" content="3"></head><body style="text-align: center; margin-top: 50px;"><h2>🌱 請掃描 QR Code</h2><img src="${latestQR}" style="width: 300px; height: 300px;" /></body></html>`);
    else if (isConnected) res.send('<h2>🌱 皮皮小管家運行中！</h2>');
    else res.send('<h2>⏳ Bot 初始化中...</h2>');
});

app.listen(PORT, () => console.log(`🌐 [Web Server] Port ${PORT}`));

async function connectToWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;

    try {
        await initDB();
        const currentDb = dbService.db; 

        // 🚀 建立資料庫索引
        if (currentDb && !isServicesStarted) {
            try {
                await currentDb.collection('reminders').createIndex({ remindAt: 1 });
                await currentDb.collection('scheduled_deletions').createIndex({ deleteAt: 1 });
                await currentDb.collection('cafe_daily_logs').createIndex({ date: 1 });
                console.log('✅ [資料庫] 索引建立/確認完成！');
            } catch (e) {
                console.error('❌ 建立資料庫索引失敗:', e);
            }
        }

        const homeworkData = await loadHomeworkData();
        const authState = await useMongoAuthState(currentDb);

        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            auth: authState.state,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
            markOnlineOnConnect: true,
            syncFullHistory: false
        });

        // 👈 【關鍵】每次建立連線，立刻更新 currentSock 指標
        currentSock = sock; 

        isConnecting = false;
        
        // 🛡️ 傳入 getter 函式 (() => currentSock)，讓背景排程永遠取得最新連線
        if (!isServicesStarted) {
            startDeletionChecker(() => currentSock, currentDb, () => isConnected);
            startCronJobs(() => currentSock, ai);
            startReminderChecker(sock, currentDb, () => isConnected);
            initNightlyLearningJob(sock, currentDb, ai);
            initAutoSpontaneousChatJob(sock, currentDb, ai);

            isServicesStarted = true;
            console.log('⚙️ [系統] 所有背景定時任務已啟動！');
        }

        sock.ev.on('creds.update', authState.saveCreds);
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;
            
            if (qr) {
                latestQR = await qrcode.toDataURL(qr);
            }
            
            if (connection === 'close') {
                isConnected = false;
                isConnecting = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.warn(`⚠️ 連線中斷！狀態碼: ${statusCode}, 是否重連: ${shouldReconnect}`);

                if (statusCode === DisconnectReason.loggedOut) {
                    await authState.clearCreds();
                    latestQR = '';
                    console.error('❌ 帳號已被登出，已清除憑證，請重新掃碼！');
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else if (shouldReconnect) {
                    setTimeout(() => connectToWhatsApp(), 3000);
                }
            } else if (connection === 'open') {
                latestQR = '';
                isConnected = true;
                isConnecting = false;
                console.log('✅ 皮皮小管家已連線！');
            }
        });

        sock.ev.on('messages.upsert', async (event) => {
            if (event.type !== 'notify') return;
            for (const m of event.messages) {
                try {
                    if (!m.message || m.key.fromMe) continue;

                    const remoteJid = m.key.remoteJid;
                    const msgObj = m.message;
                    const messageContent = (msgObj.conversation || msgObj.extendedTextMessage?.text || msgObj.imageMessage?.caption || '').trim();
                    const senderName = m.pushName || '成員';

                    if (remoteJid && messageContent) {
                        logDailyCafeMessage(currentDb, remoteJid, senderName, messageContent).catch(e => console.error(e));
                    }

                    await handleIncomingMessage(sock, m, currentDb, ai, homeworkData, saveHomeworkData, backupHomeworkData);
                } catch (err) {
                    console.error('❌ 處理訊息時發生錯誤:', err);
                }
            }
        });

    } catch (err) {
        console.error('💥 [連線初始化嚴重錯誤]:', err);
        isConnecting = false;
        setTimeout(() => connectToWhatsApp(), 5000);
    }
}

connectToWhatsApp();
