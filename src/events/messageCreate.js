import { Events } from "discord.js";
import { handleAutoJailMessage } from "../commands/Moderation/modPanel.js";

const DEFAULT_PREFIX = "!";

function findCommandInClient(client, ...names) {
  if (!client?.commands) return null;
  const targets = names
    .filter(Boolean)
    .map((n) => String(n).toLowerCase().trim());

  for (const cmd of client.commands.values()) {
    const cmdName = String(cmd?.name || "").toLowerCase().trim();
    const aliases = Array.isArray(cmd?.aliases)
      ? cmd.aliases.map((a) => String(a).toLowerCase().trim())
      : [];

    if (targets.includes(cmdName) || aliases.some((a) => targets.includes(a))) {
      return cmd;
    }
  }
  return null;
}

async function handleDirectModerationCommands(message, client) {
  const content = String(message.content || "").trim();
  if (!content) return false;

  const parts = content.split(/\s+/);
  const cleanedFirst = parts[0]
    .replace(/^[!$]+/, "")
    .toLowerCase()
    .trim();

  const directModAliases = [
    "اوامر_سجن",
    "سجن_اعداد",
    "اعداد_السجن",
    "إعداد_السجن",
    "سجن",
    "السجن",
    "فك_سجن",
    "افراج",
    "مسح",
    "كتم",
    "اسكت",
    "تكلم",
    "انبح",
    "باند",
    "تف",
    "لاباند",
    "طرد",
    "بنعالي",
    "تايم",
    "لاتايم",
    "تحذير",
    "تحذيرات",
    "قفل",
    "فتح",
    "اشراف",
    "الاشراف",
    "modpanel",
  ];

  if (directModAliases.includes(cleanedFirst)) {
    const modCmd = findCommandInClient(client, "modpanel", cleanedFirst);
    if (modCmd && typeof modCmd.execute === "function") {
      await modCmd.execute(message, parts.slice(1), client);
      return true;
    }
  }

  if (["اوامر", "الاوامر", "اوامر_سنيفر", "اوامر سنيفر", "help", "commands"].includes(cleanedFirst)) {
    const helpCmd = findCommandInClient(client, "commands", "اوامر", "help");
    if (helpCmd && typeof helpCmd.execute === "function") {
      await helpCmd.execute(message, parts.slice(1), client);
      return true;
    }
  }

  return false;
}

export default {
  name: Events.MessageCreate,
  async execute(message, clientArg = null) {
    try {
      if (!message || message.author?.bot || !message.guild) return;

      const client = clientArg || message.client;

      // 1. فحص الكلمات التلقائية للسجن أولاً
      const autoJailed = await handleAutoJailMessage(message);
      if (autoJailed) return;

      // 2. تنفيذ أوامر الإدارة واللوحة بدون بريفكس
      const handledDirect = await handleDirectModerationCommands(message, client);
      if (handledDirect) return;

      // 3. تنفيذ الأوامر بالبريفكس (إن وُجد)
      const prefix = client?.prefix || DEFAULT_PREFIX;
      const rawContent = String(message.content || "");
      if (!rawContent.startsWith(prefix)) return;

      const withoutPrefix = rawContent.slice(prefix.length).trim();
      if (!withoutPrefix) return;

      const args = withoutPrefix.split(/\s+/);
      const commandName = args.shift()?.toLowerCase();
      if (!commandName) return;

      const command = findCommandInClient(client, commandName);
      if (!command || typeof command.execute !== "function") return;

      await command.execute(message, args, client);
    } catch (error) {
      console.error("[messageCreate] Error handling message:", error);
    }
  },
};
