// ==========================================
// 🚀 終極乾淨入口 (index.js)
// ==========================================
require('dotenv').config();
const { default: makeWASocket, DisconnectReason, Browsers, initAuthCreds, proto } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');

const { initDB, useMongoAuthState, loadHomeworkData, saveHomeworkData, backupHomeworkData, db } = require('./dbService');
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
        const homeworkData = await loadHomeworkData();
        const authState = await useMongoAuthState(db);

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
        startDeletionChecker(sock, db, () => isConnected);
        startCronJobs(sock, ai);
        startReminderChecker(sock, db, () => isConnected);

        sock.ev.on('creds.update', authState.saveCreds);
        
        // 🛡️ 加上 async 以正確使用 await qrcode.toDataURL
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;
            if (qr) latestQR = await qrcode.toDataURL(qr);
            if (connection === 'close') {
                isConnected = false;
                isConnecting = false;
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => connectToWhatsApp(), 3000);
                }
            } else if (connection === 'open') {
                latestQR = '';
                isConnected = true;
                isConnecting = false;
                console.log('✅ 皮皮小管家/小呆已連線！');
            }
        });

        // 🛡️ 將所有訊息分派邏輯交給 messageHandler 處理
        sock.ev.on('messages.upsert', async (event) => {
            if (event.type !== 'notify') return;
            for (const m of event.messages) {
                await handleIncomingMessage(sock, m, db, ai, homeworkData, saveHomeworkData, backupHomeworkData);
            }
        });

    } catch (err) {
        console.error('💥 [連線初始化嚴重錯誤]:', err);
        isConnecting = false;
        setTimeout(() => connectToWhatsApp(), 5000);
    }
}

connectToWhatsApp();
