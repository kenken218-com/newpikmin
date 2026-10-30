// ==========================================
// 🚀 終極乾淨入口 (index.js)
// ==========================================
require('dotenv').config();
const { default: makeWASocket, DisconnectReason, Browsers, initAuthCreds, proto } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');

// 🛡️ 注意：不要在這裡解構 db，否則會拿到永遠是 null 的快照
const dbService = require('./dbService');
const { initDB, useMongoAuthState, loadHomeworkData, saveHomeworkData, backupHomeworkData } = dbService;

const { handleIncomingMessage } = require('./messageHandler');
const { startCronJobs, startDeletionChecker } = require('./schedulerService');
const { startReminderChecker } = require('./reminderService');

const app = express();
const PORT = process.env.PORT || 3000;
let latestQR = '';
let isConnected = false;
let isConnecting = false;

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
        
        // 🛡️ 確保拿到最新連線成功的 db 實例
        const currentDb = dbService.db; 
        
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

        isConnecting = false;
        
        // 🛡️ 傳入 currentDb
        startDeletionChecker(sock, currentDb, () => isConnected);
        startCronJobs(sock, ai);
        startReminderChecker(sock, currentDb, () => isConnected);

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
                    setTimeout(() => connectToWhatsApp(), 3000); // 重新產生 QR Code
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
                    // 🛡️ 將最新的 currentDb 傳給 messageHandler
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
