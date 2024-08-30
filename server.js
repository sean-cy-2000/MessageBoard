const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const redis = require('redis');
const { promisify } = require('util');

const port = 3000;
let client;
let getAsync, setAsync, delAsync, keysAsync;

// 連接到 Redis
function connectRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    client = redis.createClient(redisUrl);

    client.on('error', (err) => {
        console.error('Redis 連接錯誤:', err);
    });

    client.on('connect', () => {
        console.log('連接 Redis 成功');
        // 在連接成功後初始化 promisify 函數
        getAsync = promisify(client.get).bind(client);
        setAsync = promisify(client.set).bind(client);
        delAsync = promisify(client.del).bind(client);
        keysAsync = promisify(client.keys).bind(client);
    });
}

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
                await setAsync(`message:${id}`, text);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: '數據更新成功' }));
            });
        } else if (method === 'DELETE') {
            await delAsync(`message:${id}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: '刪除成功' }));
        } else {
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            res.end('Method Not Allowed');
        }
    }

    else if (url === '/api/messages') {
        switch (method) {
            case 'GET':
                const keys = await keysAsync('message:*');
                const messages = await Promise.all(keys.map(async key => {
                    const text = await getAsync(key);
                    return { id: key.split(':')[1], text };
                }));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(messages));
                break;
            case 'POST':
                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', async () => {
                    const { text } = JSON.parse(body);
                    const id = Date.now().toString();
                    await setAsync(`message:${id}`, text);
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: '新增成功', id }));
                });
                break;
            case 'DELETE':
                let deleteBody = '';
                req.on('data', chunk => deleteBody += chunk.toString());
                req.on('end', async () => {
                    let ids = [];
                    if (deleteBody) {
                        try {
                            const parsed = JSON.parse(deleteBody);
                            ids = parsed.ids || [];
                        } catch (error) {
                            console.error('解析 JSON 時出錯:', error);
                        }
                    }

                    if (ids.length > 0) {
                        await Promise.all(ids.map(id => delAsync(`message:${id}`)));
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ message: '選中的留言已刪除' }));
                    } else {
                        const allKeys = await keysAsync('message:*');
                        await Promise.all(allKeys.map(key => delAsync(key)));
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ message: '所有留言已刪除' }));
                    }
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
                    const keys = await keysAsync('message:*');
                    const results = await Promise.all(keys.map(async key => {
                        const text = await getAsync(key);
                        if (text.toLowerCase().includes(keyword.toLowerCase())) {
                            return { id: key.split(':')[1], text };
                        }
                        return null;
                    }));
                    const filteredResults = results.filter(result => result !== null);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(filteredResults));
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
    connectRedis();
    server.listen(port, () => {
        console.log(`正在執行： http://localhost:${port}/`);
    });
}

startServer().catch(console.error);