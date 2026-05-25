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

async function getTs3() {
  if (MOCK) throw new Error('MOCK模式');
  if (ts3Instance) return ts3Instance;
  try {
    ts3Instance = await TeamSpeak.connect(TS3_CONFIG);
    ts3Instance.on('close', () => { ts3Instance = null; });
    return ts3Instance;
  } catch (err) {
    ts3Instance = null;
    throw err;
  }
}

const MOCK_DATA = {
  status: {
    name: 'My TeamSpeak Server',
    status: 'online',
    platform: 'Linux',
    version: '3.13.7',
    clientsOnline: 12,
    maxClients: 64,
    uptime: 864000,
    bandwidthUp: 1073741824,
    bandwidthDown: 2147483648,
    packetsUp: 1234567,
    packetsDown: 2345678,
    queryPort: 10011,
    voicePort: 9987,
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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', async (req, res) => {
  if (MOCK) return res.json({ success: true, data: MOCK_DATA.status });
  try {
    const ts3 = await getTs3();
    const info = await ts3.serverInfo();
    res.json({
      success: true,
      data: {
        name: info.virtualserver_name,
        status: info.virtualserver_status,
        platform: info.virtualserver_platform,
        version: info.virtualserver_version,
        clientsOnline: info.virtualserver_clientsonline,
        maxClients: info.virtualserver_maxclients,
        uptime: info.virtualserver_uptime,
        bandwidthUp: info.virtualserver_bytes_uploaded_total,
        bandwidthDown: info.virtualserver_bytes_downloaded_total,
        packetsUp: info.virtualserver_serverpackets_sent,
        packetsDown: info.virtualserver_serverpackets_received,
        queryPort: TS3_CONFIG.queryPort,
        voicePort: TS3_CONFIG.serverPort,
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/channels', async (req, res) => {
  if (MOCK) return res.json({ success: true, data: MOCK_DATA.channels });
  try {
    const ts3 = await getTs3();
    const channels = await ts3.channelList();
    const map = {};
    const tree = [];
    channels.forEach(ch => {
      map[ch.cid] = { id: ch.cid, name: ch.name, parentId: ch.pid, order: ch.channel_order, maxClients: ch.maxclients, codec: ch.codec, children: [] };
    });
    channels.forEach(ch => {
      if (ch.pid === '0') tree.push(map[ch.cid]);
      else if (map[ch.pid]) map[ch.pid].children.push(map[ch.cid]);
    });
    const sort = (arr) => { arr.sort((a, b) => parseInt(a.order) - parseInt(b.order)); arr.forEach(ch => sort(ch.children)); };
    sort(tree);
    res.json({ success: true, data: tree });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/clients', async (req, res) => {
  if (MOCK) return res.json({ success: true, data: MOCK_DATA.clients });
  try {
    const ts3 = await getTs3();
    const [clients, channels] = await Promise.all([
      ts3.clientList(),
      ts3.channelList()
    ]);
    const channelMap = {};
    channels.forEach(ch => { channelMap[ch.cid] = ch.name; });
    const clientList = [];
    for (const c of clients.filter(c => c.type === 0)) {
      let latency = 0;
      try {
        const info = await ts3.execute('clientinfo', { clid: c.clid });
        latency = parseInt(info.connection_ping) || 0;
      } catch (e) {}
      clientList.push({
        id: c.clid, nickname: c.nickname, channelId: c.cid,
        channelName: channelMap[c.cid] || '未知频道',
        connectedTime: c.connection_connected_time, latency, platform: clientPlatform(c.client_platform), country: c.client_country,
      });
    }
    res.json({ success: true, data: clientList });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
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
    }
  });
});

function clientPlatform(p) {
  const platforms = { windows: 'Windows', linux: 'Linux', osx: 'macOS', android: 'Android', iOS: 'iOS' };
  return platforms[p] || p || 'Unknown';
}

app.listen(PORT, () => {
  console.log(`TS3 Web running at http://localhost:${PORT} ${MOCK ? '(MOCK模式)' : ''}`);
});
