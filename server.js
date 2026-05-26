require('dotenv').config();
const express = require('express');
const { TeamSpeak } = require('ts3-nodejs-library');
const path = require('path');

const app = express();
const PORT = process.env.WEB_PORT || 3000;
const MOCK = process.env.MOCK === 'true';

const TS3_CONFIG = {
  host: process.env.TS3_HOST || 'localhost',
  queryport: parseInt(process.env.TS3_QUERY_PORT) || 10011,
  serverport: parseInt(process.env.TS3_SERVER_PORT) || 9987,
  username: process.env.TS3_QUERY_USER || 'serveradmin',
  password: process.env.TS3_QUERY_PASS || '',
};

let ts3Instance = null;
const cache = { status: null, channels: null, clients: null, lastUpdate: 0 };

async function getTs3() {
  if (MOCK) throw new Error('MOCK模式');
  if (ts3Instance) return ts3Instance;
  try {
    ts3Instance = await TeamSpeak.connect(TS3_CONFIG);
    console.log('TS3连接成功');
    ts3Instance.on('close', () => { ts3Instance = null; });
    return ts3Instance;
  } catch (err) {
    console.error('TS3连接失败:', err.message);
    ts3Instance = null;
    throw err;
  }
}

function clientPlatform(p) {
  const platforms = { windows: 'Windows', linux: 'Linux', osx: 'macOS', android: 'Android', iOS: 'iOS' };
  return platforms[p] || p || 'Unknown';
}

const MOCK_DATA = {
  status: {
    name: 'My TeamSpeak Server', status: 'online', platform: 'Linux', version: '3.13.7',
    clientsOnline: 12, maxClients: 64, uptime: 864000,
    bandwidthUp: 1073741824, bandwidthDown: 2147483648,
    packetsUp: 1234567, packetsDown: 2345678,
    queryPort: 10011, voicePort: 9987,
  },
  channels: [
    {
      id: '1', name: '默认频道', parentId: '0', order: '0', maxClients: '-1', children: [
        { id: '2', name: '游戏语音', parentId: '1', order: '0', maxClients: '10', children: [
          { id: '5', name: '英雄联盟', parentId: '2', order: '0', maxClients: '5', children: [] },
          { id: '6', name: 'CS2', parentId: '2', order: '1', maxClients: '5', children: [] },
        ]},
        { id: '3', name: '闲聊', parentId: '1', order: '1', maxClients: '20', children: [] },
        { id: '4', name: 'AFK', parentId: '1', order: '2', maxClients: '-1', children: [] },
      ]
    }
  ],
  clients: [
    { id: '1', nickname: 'Player_One', channelId: '5', channelName: '英雄联盟', connectedTime: 3600000, latency: 32, platform: 'Windows', country: 'CN' },
    { id: '2', nickname: 'GameMaster', channelId: '5', channelName: '英雄联盟', connectedTime: 7200000, latency: 45, platform: 'Windows', country: 'CN' },
    { id: '3', nickname: 'CoolGuy', channelId: '2', channelName: '游戏语音', connectedTime: 1800000, latency: 78, platform: 'macOS', country: 'JP' },
    { id: '4', nickname: 'MusicBot', channelId: '3', channelName: '闲聊', connectedTime: 86400000, latency: 12, platform: 'Linux', country: 'US' },
    { id: '5', nickname: '新来的', channelId: '1', channelName: '默认频道', connectedTime: 300000, latency: 156, platform: 'Android', country: 'CN' },
  ],
};

async function fetchServerData() {
  if (MOCK) {
    cache.status = MOCK_DATA.status;
    cache.channels = MOCK_DATA.channels;
    cache.clients = MOCK_DATA.clients;
    cache.lastUpdate = Date.now();
    return;
  }
  try {
    const ts3 = await getTs3();
    const [info, channels, clients] = await Promise.all([
      ts3.serverInfo(),
      ts3.channelList(),
      ts3.clientList()
    ]);
    const ip = info.propcache || info;
    const channelMap = {};
    channels.forEach(ch => { const p = ch.propcache || ch; channelMap[ch.cid] = p.channelName; });
    const normalClients = clients.filter(c => (c.propcache || c).clientType === 0);
    cache.status = {
      name: ip.virtualserverName,
      status: ip.virtualserverStatus,
      platform: ip.virtualserverPlatform,
      version: ip.virtualserverVersion,
      clientsOnline: normalClients.length,
      maxClients: ip.virtualserverMaxclients,
      uptime: ip.virtualserverUptime,
      bandwidthUp: ip.connectionBytesSentTotal,
      bandwidthDown: ip.connectionBytesReceivedTotal,
      packetsUp: ip.connectionPacketsSentTotal,
      packetsDown: ip.connectionPacketsReceivedTotal,
      queryPort: TS3_CONFIG.queryport,
      voicePort: info.virtualserverPort,
    };
    const chMap = {};
    const tree = [];
    channels.forEach(ch => {
      const p = ch.propcache || ch;
      chMap[ch.cid] = { id: ch.cid, name: p.channelName, parentId: ch.pid, order: p.channelOrder, maxClients: p.channelMaxclients, codec: p.channelCodec, children: [] };
    });
    channels.forEach(ch => {
      if (ch.pid === '0') tree.push(chMap[ch.cid]);
      else if (chMap[ch.pid]) chMap[ch.pid].children.push(chMap[ch.cid]);
    });
    const sort = (arr) => { arr.sort((a, b) => parseInt(a.order) - parseInt(b.order)); arr.forEach(ch => sort(ch.children)); };
    sort(tree);
    cache.channels = tree;
    const clientList = [];
    for (const c of normalClients) {
      const p = c.propcache || c;
      let latency = 0;
      try {
        const ci = await ts3.execute('clientinfo', { clid: c.clid });
        const cip = ci.propcache || ci;
        latency = parseInt(cip.connection_ping) || 0;
      } catch (e) {}
      clientList.push({
        id: c.clid, nickname: p.clientNickname, channelId: c.cid,
        channelName: channelMap[c.cid] || '未知频道',
        connectedTime: p.clientIdleTime || 0, latency, platform: clientPlatform(p.clientPlatform), country: p.clientCountry,
      });
    }
    cache.clients = clientList;
    cache.lastUpdate = Date.now();
  } catch (err) {
    console.error('获取TS3数据失败:', err.message);
  }
}

setInterval(fetchServerData, 10000);
fetchServerData();

const API_KEY = process.env.API_KEY || '';

function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const key = req.query.key || req.headers['x-api-key'];
  if (key === API_KEY) return next();
  res.status(401).json({ success: false, error: '未授权访问' });
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', authMiddleware, (req, res) => {
  if (cache.status && Object.keys(cache.status).length > 0) return res.json({ success: true, data: cache.status });
  res.json({ success: false, error: '等待数据加载' });
});

app.get('/api/channels', authMiddleware, (req, res) => {
  if (cache.channels) return res.json({ success: true, data: cache.channels });
  res.json({ success: false, error: '等待数据加载' });
});

app.get('/api/clients', authMiddleware, (req, res) => {
  if (cache.clients) return res.json({ success: true, data: cache.clients });
  res.json({ success: false, error: '等待数据加载' });
});

app.get('/api/config', (req, res) => {
  res.json({
    siteName: process.env.SITE_NAME || 'TS3 Web',
    host: MOCK ? '127.0.0.1' : (process.env.TS3_HOST || 'localhost'),
    voicePort: TS3_CONFIG.serverPort,
    downloads: {
      windows: process.env.DOWNLOAD_WINDOWS || 'https://www.teamspeak.com/downloads',
      macos: process.env.DOWNLOAD_MACOS || 'https://www.teamspeak.com/downloads',
      linux: process.env.DOWNLOAD_LINUX || 'https://www.teamspeak.com/downloads',
    },
    backup: {
      yy: {
        enabled: !!process.env.YY_CHANNEL_ID,
        channelId: process.env.YY_CHANNEL_ID || '',
      },
      kook: {
        enabled: !!process.env.KOOK_URL,
        url: process.env.KOOK_URL || '',
      }
    }
  });
});

app.listen(PORT, () => {
  console.log(`TS3 Web running at http://localhost:${PORT} ${MOCK ? '(MOCK模式)' : ''}`);
});
