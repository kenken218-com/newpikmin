// ==========================================
// ☁️ 資料庫與認證憑證服務 (dbService.js)
// ==========================================
const { MongoClient } = require('mongodb');
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const DEFAULT_HOMEWORK_DATA = require('./homeworkConfig');

const MONGODB_URI = process.env.MONGODB_URI || "";
let dbClient = null;
let db = null;

async function initDB() {
    if (MONGODB_URI && !db) {
        try {
            dbClient = new MongoClient(MONGODB_URI);
            await dbClient.connect();
            db = dbClient.db('pikmin_bot');
            console.log('☁️ [雲端資料庫] 成功連線至 MongoDB Atlas！');
        } catch (e) {
            console.error('❌ 連線 MongoDB 失敗:', e.message);
            db = null;
        }
    }
    return db;
}

async function useMongoAuthState(database) {
    if (!database) throw new Error("資料庫未連線，無法初始化 AuthState");

    const collection = database.collection('auth_state');
    const writeData = async (data, id) => {
        try { await collection.updateOne({ _id: id }, { $set: { data: JSON.stringify(data, BufferJSON.replacer) } }, { upsert: true }); } catch (e) {}
    };
    const readData = async (id) => {
        try {
            const doc = await collection.findOne({ _id: id });
            if (doc && doc.data) return JSON.parse(doc.data, BufferJSON.reviver);
        } catch (e) {}
        return null;
    };
    const removeData = async (id) => { try { await collection.deleteOne({ _id: id }); } catch (e) {} };
    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        // 🛡️ 正確處理 app-state-sync-key 的 Protobuf 轉換
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            tasks.push(value ? writeData(value, `${category}-${id}`) : removeData(`${category}-${id}`));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds'),
        clearCreds: async () => {
            try { await collection.deleteMany({}); } catch (e) {}
        }
    };
}

async function loadHomeworkData() {
    if (db) {
        try {
            const doc = await db.collection('homework').findOne({ _id: 'homework_data' });
            if (doc && doc.data) return doc.data;
        } catch (e) {}
    }
    return JSON.parse(JSON.stringify(DEFAULT_HOMEWORK_DATA));
}

async function saveHomeworkData(homeworkData) {
    if (db) {
        try { await db.collection('homework').updateOne({ _id: 'homework_data' }, { $set: { data: homeworkData, updatedAt: new Date() } }, { upsert: true }); } catch (e) {}
    }
}

async function backupHomeworkData(homeworkData) {
    if (db) {
        try {
            await db.collection('homework_backup').updateOne(
                { _id: 'latest_backup' },
                { $set: { data: homeworkData, updatedAt: new Date() } },
                { upsert: true }
            );
        } catch (e) {}
    }
}

module.exports = {
    initDB,
    useMongoAuthState,
    loadHomeworkData,
    saveHomeworkData,
    backupHomeworkData,
    get db() { return db; }
};