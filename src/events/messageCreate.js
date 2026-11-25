import { Events } from "discord.js";
import { logger } from "../utils/logger.js";
import { parsePrefixCommand } from "../utils/prefixParser.js";
import {
  supportsPrefixExecution,
  executePrefixCommand,
  resolvePrefixAccessKey,
} from "../utils/messageAdapter.js";
import {
  resolveCommandAlias,
  resolveSubcommandAlias,
} from "../config/commands/commandAliases.js";
import { getPrefixRestriction } from "../config/commands/prefixRestrictions.js";
import { getGuildConfig } from "../services/config/guildConfig.js";
import {
  getCommandPrefix,
  getBotMessage,
  isBotOwner,
  isCommandCategoryEnabled,
  isMaintenanceMode,
} from "../config/bot.js";
import { enforceAbuseProtection, formatCooldownDuration } from "../utils/abuseProtection.js";
import { createEmbed } from "../utils/embeds.js";
import { isCommandEnabled } from "../services/commandAccessService.js";
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from "../services/countingGameService.js";
import { handleAutoJailMessage } from "../commands/Moderation/modPanel.js";
import { handleAutoTicketMessage } from "../commands/Tickets/ticket.js";
const NO_PREFIX_MOD_COMMANDS = new Set([
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
]);

const NO_PREFIX_TICKET_COMMANDS = new Set([
  "انشاء_تذكره",
  "انشاء_تذكرة",
  "تذكره",
  "تذكرة",
  "تذاكر",
  "لوحة_التذاكر",
  "لوحه_التذاكر",
]);

function findCommandInClient(client, resolvedName) {
  if (!client?.commands) return null;
  if (client.commands.has(resolvedName)) {
    return client.commands.get(resolvedName);
  }

  const normalizedTarget = resolvedName.replace(/[_-]/g, "").toLowerCase();
  for (const [, cmd] of client.commands) {
    const cmdName = String(cmd?.name || cmd?.data?.name || "").toLowerCase();
    if (
      cmdName === resolvedName.toLowerCase() ||
      cmdName.replace(/[_-]/g, "") === normalizedTarget
    ) {
      return cmd;
    }
    if (Array.isArray(cmd?.aliases)) {
      const matchedAlias = cmd.aliases.some(
        (a) =>
          String(a).toLowerCase() === resolvedName.toLowerCase() ||
          String(a).replace(/[_-]/g, "").toLowerCase() === normalizedTarget
      );
      if (matchedAlias) return cmd;
    }
  }

  return null;
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      const directHandled = await handleDirectSnaiferCommands(message, client);
      if (directHandled) {
        return;
      }

      await handlePrefixCommand(message, client);

      // نظام اللفلات معطّل بالكامل — فحص الكلمات التلقائية فقط
      const autoJailed = await handleAutoJailMessage(message);
      if (autoJailed) {
        return;
      }

      await handleAutoTicketMessage(message);
    } catch (error) {
      logger.error("Error in messageCreate event:", error);
    }
  },
};

async function handleDirectSnaiferCommands(message, client) {
  try {
    const trimmed = String(message.content || "").trim();
    if (!trimmed) return false;

    if (trimmed === "اوامر_سنيفر" || trimmed === "اوامر سنيفر" || trimmed === "اوامر") {
      const showCmd = findCommandInClient(client, "show");
      if (showCmd) {
        await showCmd.execute(message, [], client);
        return true;
      }
    }

    const parts = trimmed.split(/\s+/);
    const rawFirst = parts[0] || "";
    const cleanedFirst = rawFirst.replace(/^[\$!]+/, "");

    if (NO_PREFIX_MOD_COMMANDS.has(cleanedFirst)) {
      const modCmd = findCommandInClient(client, "modpanel");
      if (modCmd) {
        await modCmd.execute(message, parts.slice(1), client);
        return true;
      }
    }

    if (NO_PREFIX_TICKET_COMMANDS.has(cleanedFirst)) {
      const ticketCmd = findCommandInClient(client, "create_ticket");
      if (ticketCmd) {
        await ticketCmd.execute(message, parts.slice(1), client);
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error("Error in handleDirectSnaiferCommands:", error);
    return false;
  }
}

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);

    if (!parsed) {
      return;
    }

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set([
      "leave",
      "pause",
      "resume",
      "skip",
      "stop",
      "volume",
    ]);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = "music";
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(", ")}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = findCommandInClient(client, resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return;
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel
        .send({
          embeds: [
            createEmbed({
              title: "Maintenance Mode",
              description: getBotMessage("maintenanceMode"),
              color: "warning",
            }),
          ],
        })
        .catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel
        .send({
          embeds: [
            createEmbed({
              title: "Feature Disabled",
              description: getBotMessage("commandDisabled"),
              color: "error",
            }),
          ],
        })
        .catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: "Slash Command Only",
          description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: "info",
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (
      !(await isCommandEnabled(
        client,
        message.guild.id,
        resolvePrefixAccessKey(command.data, args),
        command.category
      ))
    ) {
      const embed = createEmbed({
        title: "Command Disabled",
        description: "This command has been disabled for this server.",
        color: "error",
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: "Command Cooldown",
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: "error",
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(
      `Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`
    );

    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error("Error handling prefix command:", error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(
        `❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`
      );
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error("Error handling counting game:", error);
    return false;
  }
}
