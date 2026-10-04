const express = require("express");
const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const PREFIX = "🍓";
const CHANNEL_LINK = process.env.CHANNEL_LINK || "https://whatsapp.com/channel/0029Vb8cfQn8V0te5K0atc1s";
const BOT_NAME = "GLITCH GUY BOT";

let sock = null;
let pairingCode = null;
let botStatus = "OFFLINE";
let lastError = "";
let starting = false;

const commands = {
  ping: "pong 🍓",
  alive: "╔═〔 GLITCH GUY BOT 〕═╗\n║ STATUS : ONLINE\n║ MODE   : PUBLIC\n╚════════════════════╝",
  menu: "MENU",
  help: "Utilise 🍓menu pour afficher toutes les commandes.",
  owner: "╔═〔 OWNER 〕═╗\n║ MR KING KAYSEUR\n╚════════════╝",
  bot: " GLITCH GUY BOT — PUBLIC",
  info: "Bot WhatsApp public avec préfixe 🍓.",
  time: () => new Date().toLocaleString("fr-FR"),
  date: () => new Date().toLocaleDateString("fr-FR"),
  channel: () => CHANNEL_LINK,
  github: "Ajoute ton dépôt GitHub dans GITHUB_LINK sur Render.",
  support: "Utilise 🍓menu puis la commande souhaitée.",
  rules: "Respecte les règles du groupe et les conditions de WhatsApp.",
  say: (arg) => arg || "Exemple : 🍓say Bonjour",
  echo: (arg) => arg || "Exemple : 🍓echo Bonjour",
  poll: (arg) => arg || "Exemple : 🍓poll Question | Option 1 | Option 2",
  tagall: "Commande réservée aux groupes.",
  hidetag: "Commande réservée aux groupes.",
  groupinfo: "Informations du groupe disponibles ici.",
  link: "Lien du groupe : commande à utiliser dans un groupe.",
  sticker: "Envoie une image puis utilise 🍓sticker (extension simple à ajouter).",
  calc: (arg) => {
    if (!arg) return "Exemple : 🍓calc 12*5";
    if (!/^[0-9+\-*/().% ]+$/.test(arg)) return "Expression non autorisée.";
    try { return String(Function(`"use strict"; return (${arg})`)()); } catch { return "Calcul invalide."; }
  },
  ascii: (arg) => arg ? `╔════════════════╗\n║ ${arg.toUpperCase()}\n╚════════════════╝` : "Exemple : 🍓ascii KAYSEUR",
  quote: "« La discipline construit ce que la motivation commence. »",
  status: "GLITCH GUY BOT : ONLINE"
};

// 190 commandes : commandes utiles, sûres et extensibles.
// Les commandes qui ne sont pas encore spécialisées renvoient un message propre
// afin que tu puisses ajouter leur logique plus tard sans casser le bot.
const names = [
"menu","ping","alive","help","owner","bot","info","time","date","channel","github","support","rules","say","echo","poll","tagall","hidetag","groupinfo","link",
"sticker","calc","ascii","quote","status","profile","id","jid","runtime","speed","version","uptime","prefix","commands","public","private","online","offline",
"glist","admins","members","promote","demote","add","remove","kick","kickall","mute","unmute","warn","warnings","resetwarn","antilink","antispam","welcome","goodbye",
"setname","setdesc","setpp","open","close","revoke","invite","join","leave","request","approve","reject","everyone","mention","tag","hidetag2","poll2","announce",
"translate","define","meaning","wiki","weather","news","lyrics","fact","joke","meme","anime","character","quote2","truth","dare","riddle","quiz","math",
"base64","encode","decode","reverse","upper","lower","bold","italic","box","glitch","royal","celestial","clx","kayseur","banner","logo","color","random",
"choose","coin","dice","number","timer","reminder","short","url","qr","readqr","image","caption","toimage","tovideo","audio","video","document","save",
"delete","clear","backup","restore","settings","setprefix","setowner","setchannel","setwelcome","setgoodbye","setbio","setstatus","broadcast","bcgroup",
"bcall","forward","report","bug","feedback","contact","privacy","terms","version2","system","server","memory","storage","ping2","test","debug","reload",
"restart","shutdown","pair","connect","disconnect","session","auth","logs","health","api","panel","web","render","netlify","github2","npm","node","json",
"menu2","menu3","fun","games","tools","group","admin","owner2","moderation","download","upload","search","find","check","verify","joinfamily","family",
"qg","purge","war","del","clearall","reset","start","stop","help2","about","credits","thanks","bye"
];

const unique = [...new Set(names)];
for (const n of unique) if (!commands[n]) commands[n] = `🍓${n} : commande disponible dans GLITCH GUY BOT.`;

function formatMenu() {
  const list = unique.map((c, i) => `${String(i + 1).padStart(3, "0")} │ 🍓${c}`).join("\n");
  return `╔════════════════════════════════╗
║       🍓 GLITCH GUY BOT 🛀
╠════════════════════════════════╣
${list}
╠════════════════════════════════╣
║ 📢 CHAÎNE :
║ ${CHANNEL_LINK}
╚════════════════════════════════╝
Tape une commande avec le préfixe 🍓
Exemple : 🍓ping`;
}

async function startBot() {
  if (starting) return;
  starting = true;
  botStatus = "STARTING";
  try {
    const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
      },
      browser: [BOT_NAME, "Chrome", "1.0.0"],
      generateHighQualityLinkPreview: true
    });

    sock.ev.on("creds.update", saveCreds);

    if (!state.creds.registered) {
      const number = (process.env.PAIRING_NUMBER || "").replace(/\D/g, "");
      if (number) {
        setTimeout(async () => {
          try {
            pairingCode = await sock.requestPairingCode(number);
            botStatus = "PAIRING";
          } catch (e) {
            lastError = e.message;
          }
        }, 5000);
      }
    } else {
      botStatus = "ONLINE";
    }

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        botStatus = "ONLINE";
        pairingCode = null;
        lastError = "";
      }
      if (connection === "close") {
        botStatus = "OFFLINE";
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          setTimeout(startBot, 5000);
        } else {
          lastError = "Session déconnectée. Supprime auth_info puis reconnecte.";
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const m = messages[0];
      if (!m?.message || m.key.fromMe) return;

      const jid = m.key.remoteJid;
      const text =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption ||
        m.message.videoMessage?.caption || "";

      if (!text.startsWith(PREFIX)) return;

      const raw = text.slice(PREFIX.length).trim();
      const [cmdRaw, ...args] = raw.split(/\s+/);
      const cmd = (cmdRaw || "").toLowerCase();
      const arg = args.join(" ");

      if (cmd === "menu") {
        await sock.sendMessage(jid, { text: formatMenu() });
        return;
      }

      const result = commands[cmd];
      if (!result) {
        await sock.sendMessage(jid, { text: `❌ Commande inconnue : ${PREFIX}${cmd}\nTape ${PREFIX}menu` });
        return;
      }

      let reply = typeof result === "function" ? result(arg) : result;
      if (cmd === "channel") reply = `📢 CHAÎNE OFFICIELLE\n${CHANNEL_LINK}`;
      await sock.sendMessage(jid, { text: String(reply) });
    });
  } catch (e) {
    botStatus = "ERROR";
    lastError = e.message;
  } finally {
    starting = false;
  }
}

app.get("/api/status", (req, res) => res.json({
  name: BOT_NAME,
  status: botStatus,
  prefix: PREFIX,
  pairingCode,
  error: lastError,
  commands: unique.length,
  channel: CHANNEL_LINK
}));

app.get("/api/menu", (req, res) => res.type("text").send(formatMenu()));

app.get("/api/pairing", (req, res) => res.json({ pairingCode, status: botStatus }));

app.get("/health", (req, res) => res.json({ ok: true, bot: BOT_NAME, status: botStatus }));

app.listen(PORT, () => {
  console.log(`${BOT_NAME} panel : http://localhost:${PORT}`);
  startBot();
});
