const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const { MongoClient, ObjectId } = require('mongodb');

const port = 3000;
let db;

const mongoUri = process.env.mongo_url || 'mongodb://localhost:27017/messageBoard';

function connectMb() {
    try {
        const client = new MongoClient(mongoUri);
        client.connect();
        console.log('連接MongoDB成功');
        db = client.db('messageBoard');
    } catch (errMessage) {
        console.error('連接MongoDB失敗:', errMessage);
        process.exit(1);
    }
}

// 使用 async/await 和解構賦值來處理請求
const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    if (url === '/') {
        try {
            const data = await fs.readFile(path.join(__dirname, 'index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('連接伺服器失敗');
        }
    } 
    
    else if (url.startsWith('/api/messages/')) {
        const id = url.split('/').pop();
        if (method === 'PUT') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                const { text } = JSON.parse(body);
                await db.collection('messages').updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { text } }
                );
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: '數據更新' }));
            });
        } else if (method === 'DELETE') {
            await db.collection('messages').deleteOne({ _id: new ObjectId(id) });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Message deleted' }));
        } else {
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            res.end('Method Not Allowed');
        }
    } 
    
    else if (url === '/api/messages') {
        switch (method) {
            case 'GET':
                const messages = await db.collection('messages').find().toArray();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(messages));
                break;
            case 'POST':
                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', async () => {
                    const { text } = JSON.parse(body);
                    const result = await db.collection('messages').insertOne({ text });
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Message added', id: result.insertedId }));
                });
                break;
            case 'DELETE':
                let deleteBody = '';
                req.on('data', chunk => deleteBody += chunk.toString());
                req.on('end', async () => {
                    const { ids } = deleteBody ? JSON.parse(deleteBody) : {};
                    if (ids && ids.length > 0) {
                        await db.collection('messages').deleteMany({
                            _id: { $in: ids.map(id => new ObjectId(id)) }
                        });
                    } else {
                        await db.collection('messages').deleteMany({});
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Messages deleted' }));
                });
                break;
            default:
                res.writeHead(405, { 'Content-Type': 'text/plain' });
                res.end('Method Not Allowed');
        }
    } else if (url.startsWith('/api/search')) {
        if (method === 'GET') {
            const { searchParams } = new URL(url, `http://${req.headers.host}`);
            const keyword = searchParams.get('keyword');
            if (keyword) {
                try {
                    const results = await db.collection('messages').find({
                        text: { $regex: keyword, $options: 'i' }
                    }).toArray();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(results));
                } catch (error) {
                    console.error('搜索錯誤:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '搜索過程中發生錯誤' }));
                }
            } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '缺少搜索關鍵字' }));
            }
        } else {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '方法不允許' }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

async function startServer() {
    await connectMb();
    server.listen(port, () => {
        console.log(`正在執行： http://localhost:${port}/`);
    });
}

startServer().catch(console.error);