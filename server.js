require('dotenv').config();
const express = require('express');
const { TeamSpeak } = require('ts3-nodejs-library');
const path = require('path');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

const TS3_CONFIG = {
  host: process.env.TS3_HOST || 'localhost',
  queryport: parseInt(process.env.TS3_QUERY_PORT) || 10011,
  serverport: parseInt(process.env.TS3_SERVER_PORT) || 9987,
  username: process.env.TS3_QUERY_USER || 'serveradmin',
  password: process.env.TS3_QUERY_PASS || '',
};

let ts3Instance = null;
let serverStartTime = null;

async function getTs3() {
  if (ts3Instance) return ts3Instance;
  try {
    ts3Instance = await TeamSpeak.connect(TS3_CONFIG);
    ts3Instance.on('close', () => {
      ts3Instance = null;
    });
    return ts3Instance;
  } catch (err) {
    ts3Instance = null;
    throw err;
  }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', async (req, res) => {
  try {
    const ts3 = await getTs3();
    const serverInfo = await ts3.serverInfo();

    res.json({
      success: true,
      data: {
        name: serverInfo.virtualserver_name,
        status: serverInfo.virtualserver_status,
        platform: serverInfo.virtualserver_platform,
        version: serverInfo.virtualserver_version,
        clientsOnline: serverInfo.virtualserver_clientsonline,
        maxClients: serverInfo.virtualserver_maxclients,
        uptime: serverInfo.virtualserver_uptime,
        bandwidthUp: serverInfo.virtualserver_bytes_uploaded_total,
        bandwidthDown: serverInfo.virtualserver_bytes_downloaded_total,
        packetsUp: serverInfo.virtualserver_serverpackets_sent,
        packetsDown: serverInfo.virtualserver_serverpackets_received,
        bytesUpCurrent: serverInfo.virtualserver_bytes_uploaded,
        bytesDownCurrent: serverInfo.virtualserver_bytes_downloaded,
        fileBandwidth: serverInfo.virtualserver_filetransfer_bandwidth_sent,
        queryPort: TS3_CONFIG.queryPort,
        voicePort: TS3_CONFIG.serverPort,
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/channels', async (req, res) => {
  try {
    const ts3 = await getTs3();
    const channels = await ts3.channelList();

    const channelMap = {};
    const tree = [];

    channels.forEach(ch => {
      channelMap[ch.cid] = {
        id: ch.cid,
        name: ch.name,
        parentId: ch.pid,
        order: ch.channel_order,
        maxClients: ch.maxclients,
        codec: ch.codec,
        children: []
      };
    });

    channels.forEach(ch => {
      if (ch.pid === '0') {
        tree.push(channelMap[ch.cid]);
      } else if (channelMap[ch.pid]) {
        channelMap[ch.pid].children.push(channelMap[ch.cid]);
      }
    });

    const sortByOrder = (arr) => {
      arr.sort((a, b) => parseInt(a.order) - parseInt(b.order));
      arr.forEach(ch => sortByOrder(ch.children));
    };
    sortByOrder(tree);

    res.json({ success: true, data: tree });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/clients', async (req, res) => {
  try {
    const ts3 = await getTs3();
    const clients = await ts3.clientList();

    const clientList = clients
      .filter(c => c.type === 0)
      .map(c => ({
        id: c.clid,
        nickname: c.nickname,
        channelId: c.cid,
        connectedTime: c.connection_connected_time,
        idleTime: c.client_idle_time,
        platform: clientPlatform(c.client_platform),
        country: c.client_country,
      }));

    res.json({ success: true, data: clientList });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    host: process.env.TS3_HOST || 'localhost',
    voicePort: TS3_CONFIG.serverPort,
  });
});

function clientPlatform(p) {
  const platforms = { windows: 'Windows', linux: 'Linux', osx: 'macOS', android: 'Android', iOS: 'iOS' };
  return platforms[p] || p || 'Unknown';
}

app.listen(PORT, () => {
  console.log(`TS3 Web running at http://localhost:${PORT}`);
});
