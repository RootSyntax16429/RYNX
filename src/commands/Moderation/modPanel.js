import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getCommandPrefix } from "../../config/bot.js";

const jailConfigs = new Map();
const warnsStore = new Map();
// حفظ صارم لرولات كل مسجون: key = `${guildId}_${userId}` -> { roles: [...], durationMs, expiresAt, reason, by, timer }
const jailedRolesBackup = new Map();

const DEFAULT_JAIL_CONFIG = {
  jailChannelId: null,
  jailRoleId: null,
  muteRoleId: null,
  allowedRoles: [],
  reasons: [],
  autoJailEnabled: true,
  autoJailDuration: "10m", // 0 أو دائم = بدون مؤقت تلقائي
  autoJailWords: [],
  jailedUsers: {},
};

export function getJailConfig(guildId) {
  if (!jailConfigs.has(guildId)) {
    jailConfigs.set(guildId, {
      ...DEFAULT_JAIL_CONFIG,
      allowedRoles: [],
      reasons: [],
      autoJailWords: [],
      jailedUsers: {},
    });
  }
  return jailConfigs.get(guildId);
}

function normalizeArabicCommand(word = "") {
  return String(word)
    .trim()
    .replace(/^[!$]+/, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function normalizeTextForMatch(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .trim();
}

function addWarning(guildId, userId, reason, moderatorId) {
  const key = `${guildId}_${userId}`;
  const list = warnsStore.get(key) || [];
  list.push({
    reason: reason || "بدون سبب محدد",
    by: moderatorId,
    at: Date.now(),
  });
  warnsStore.set(key, list);
  return list;
}

function getWarnings(guildId, userId) {
  return warnsStore.get(`${guildId}_${userId}`) || [];
}

function parseDurationToMs(input) {
  if (!input) return null;
  const clean = String(input).trim().toLowerCase();
  if (clean === "0" || clean === "دائم" || clean === "off" || clean === "none") {
    return 0;
  }
  const match = clean.match(/^(\d+)\s*(s|m|h|d|ث|د|س|ي)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2] || "m";

  if (unit === "s" || unit === "ث") return amount * 1000;
  if (unit === "m" || unit === "د") return amount * 60 * 1000;
  if (unit === "h" || unit === "س") return amount * 60 * 60 * 1000;
  if (unit === "d" || unit === "ي") return amount * 24 * 60 * 60 * 1000;
  return null;
}

function formatDurationArabic(ms) {
  if (!ms || ms <= 0) return "دائم (بدون مؤقت)";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} ثانية`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `${days} يوم`;
}

async function resolveTargetUser(messageOrInteraction, args = []) {
  const mentioned = messageOrInteraction.mentions?.users?.first();
  if (mentioned) return mentioned;

  if (messageOrInteraction.reference?.messageId) {
    const repliedMsg = await messageOrInteraction.channel.messages
      .fetch(messageOrInteraction.reference.messageId)
      .catch(() => null);
    if (repliedMsg?.author && !repliedMsg.author.bot) {
      return repliedMsg.author;
    }
  }

  for (const arg of args) {
    const cleanId = String(arg || "").replace(/[<@!>]/g, "").trim();
    if (/^\d{17,20}$/.test(cleanId)) {
      const fetched = await messageOrInteraction.client.users.fetch(cleanId).catch(() => null);
      if (fetched) return fetched;
    }
  }

  return null;
}

async function ensureMuteRole(guild, config) {
  let muteRole = config.muteRoleId ? guild.roles.cache.get(config.muteRoleId) : null;
  if (!muteRole) {
    muteRole = guild.roles.cache.find((r) => r.name === "ميوت" || r.name === "Muted");
  }
  if (!muteRole) {
    muteRole = await guild.roles.create({
      name: "ميوت",
      color: "#6B7280",
      reason: "إنشاء رتبة الكتم تلقائياً بواسطة سنيفر",
    });
  }
  config.muteRoleId = muteRole.id;

  for (const [, ch] of guild.channels.cache) {
    if (ch.permissionOverwrites) {
      await ch.permissionOverwrites
        .edit(muteRole.id, {
          SendMessages: false,
          Speak: false,
          AddReactions: false,
        })
        .catch(() => {});
    }
  }
  return muteRole;
}

async function ensureJailSetup(guild, config) {
  let jailRole = config.jailRoleId ? guild.roles.cache.get(config.jailRoleId) : null;
  if (!jailRole) {
    jailRole = guild.roles.cache.find((r) => r.name === "مسجون" || r.name === "السجن");
  }
  if (!jailRole) {
    jailRole = await guild.roles.create({
      name: "مسجون",
      color: "#4B4E54",
      reason: "إنشاء رتبة السجن تلقائياً بواسطة سنيفر",
    });
  }
  config.jailRoleId = jailRole.id;

  let jailChannel = config.jailChannelId
    ? guild.channels.cache.get(config.jailChannelId)
    : null;
  if (!jailChannel) {
    jailChannel = guild.channels.cache.find(
      (c) => c.name === "السجن" && c.type === ChannelType.GuildText
    );
  }
  if (!jailChannel) {
    jailChannel = await guild.channels.create({
      name: "السجن",
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: jailRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
      reason: "إنشاء روم السجن تلقائياً بواسطة سنيفر",
    });
  } else {
    await jailChannel.permissionOverwrites
      .edit(guild.roles.everyone.id, { ViewChannel: false })
      .catch(() => {});
    await jailChannel.permissionOverwrites
      .edit(jailRole.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      })
      .catch(() => {});
  }
  config.jailChannelId = jailChannel.id;

  return { jailRole, jailChannel };
}

async function applyJailWithSavedRoles(guild, targetMember, config, reason, executorId, durationMs = 0, notifyChannel = null) {
  const { jailRole, jailChannel } = await ensureJailSetup(guild, config);
  const freshMember = await guild.members.fetch(targetMember.id).catch(() => targetMember);

  const backupKey = `${guild.id}_${freshMember.id}`;
  const existingBackup = jailedRolesBackup.get(backupKey);

  // إذا كان العضو مسجون مسبقاً، نحتفظ بالرولات الأصلية الأولى عشان ما تروح لو انسجن مرتين قبل الفك
  const rolesToSave = existingBackup?.roles?.length
    ? existingBackup.roles
    : freshMember.roles.cache
        .filter((r) => r.id !== guild.id && !r.managed && r.id !== jailRole.id)
        .map((r) => r.id);

  if (existingBackup?.timer) {
    clearTimeout(existingBackup.timer);
  }

  const expiresAt = durationMs && durationMs > 0 ? Date.now() + durationMs : null;

  const entryData = {
    roles: rolesToSave,
    reason,
    by: executorId,
    at: Date.now(),
    durationMs: durationMs || 0,
    expiresAt,
  };

  config.jailedUsers[freshMember.id] = entryData;

  if (rolesToSave.length > 0) {
    await freshMember.roles
      .remove(rolesToSave, `حفظ وسحب الرولات للسجن - السبب: ${reason}`)
      .catch(() => {});
  }
  await freshMember.roles.add(jailRole.id, `إدخال السجن - السبب: ${reason}`).catch(() => {});

  let timer = null;
  if (durationMs && durationMs > 0) {
    timer = setTimeout(async () => {
      await releaseMemberFromJail(guild, freshMember.id, config, "انتهاء مدة السجن التلقائي", notifyChannel || jailChannel).catch(() => {});
    }, durationMs);
  }

  jailedRolesBackup.set(backupKey, {
    ...entryData,
    timer,
  });

  return { jailRole, jailChannel, savedRolesCount: rolesToSave.length };
}

export async function releaseMemberFromJail(guild, userId, config, releaseReason = "فك السجن", notifyChannel = null) {
  const backupKey = `${guild.id}_${userId}`;
  const backup = jailedRolesBackup.get(backupKey);
  const savedFromConfig = config.jailedUsers?.[userId];

  if (backup?.timer) {
    clearTimeout(backup.timer);
  }

  const rolesToRestore = backup?.roles?.length
    ? backup.roles
    : savedFromConfig?.roles || [];

  const { jailRole, jailChannel } = await ensureJailSetup(guild, config);
  const member = await guild.members.fetch(userId).catch(() => null);

  let restoredCount = 0;
  if (member) {
    if (member.roles.cache.has(jailRole.id)) {
      await member.roles.remove(jailRole.id, releaseReason).catch(() => {});
    }
    if (rolesToRestore.length > 0) {
      const validRoles = rolesToRestore.filter(
        (rId) => guild.roles.cache.has(rId) && rId !== jailRole.id
      );
      if (validRoles.length > 0) {
        await member.roles.add(validRoles, releaseReason).catch(() => {});
        restoredCount = validRoles.length;
      }
    }
  }

  jailedRolesBackup.delete(backupKey);
  if (config.jailedUsers?.[userId]) {
    delete config.jailedUsers[userId];
  }

  const targetChannel = notifyChannel || jailChannel;
  if (targetChannel) {
    const releaseEmbed = new EmbedBuilder()
      .setColor("#16A34A")
      .setTitle("🔓 تم الإفراج عن عضو وإرجاع رولاته")
      .addFields(
        { name: "العضو", value: `<@${userId}>`, inline: true },
        { name: "الرولات المسترجعة", value: `${restoredCount} رتبة`, inline: true },
        { name: "السبب", value: releaseReason, inline: false }
      )
      .setTimestamp();

    await targetChannel.send({ embeds: [releaseEmbed] }).catch(() => {});
  }

  return { restoredCount };
}

export function buildJailSetupPanel(guild, prefix) {
  const config = getJailConfig(guild.id);
  const jailChannelText = config.jailChannelId
    ? `<#${config.jailChannelId}>`
    : "غير محدد (يُنشأ تلقائياً)";
  const jailRoleText = config.jailRoleId
    ? `<@&${config.jailRoleId}>`
    : "غير محدد (تُنشأ تلقائياً)";
  const allowedRolesText =
    config.allowedRoles.length > 0
      ? config.allowedRoles.map((id) => `<@&${id}>`).join(" ، ")
      : "الكل (أصحاب صلاحية الإدارة)";
  const reasonsText =
    config.reasons.length > 0
      ? config.reasons.map((r, i) => `${i + 1}. ${r}`).join("\n")
      : "لم تضف أي أسباب بعد — اضغط (إضافة سبب جديد)";
  const autoWordsText =
    config.autoJailWords.length > 0
      ? config.autoJailWords.map((w, i) => `${i + 1}. \`${w}\``).join(" ، ")
      : "لا توجد كلمات سجن تلقائي مضافة — اضغط (إضافة كلمة سجن تلقائي)";

  const durationMs = parseDurationToMs(config.autoJailDuration);
  const autoDurationLabel = formatDurationArabic(durationMs ?? 10 * 60 * 1000);

  const embed = new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle("🔒 لوحة إعدادات نظام السجن — سنيفر")
    .setDescription(
      `إعداد روم السجن، رتبة السجن، الرولات المسموح لها، أسباب السجن، وكلمات السجن التلقائي.\nالحالة التلقائية: **${
        config.autoJailEnabled ? "مفعّلة ✅" : "معطّلة ⛔"
      }** | مدة السجن التلقائي: **${autoDurationLabel}**`
    )
    .addFields(
      { name: "🏠 روم السجن", value: jailChannelText, inline: true },
      { name: "⛓️ رتبة السجن", value: jailRoleText, inline: true },
      { name: "⏱️ مدة السجن التلقائي", value: autoDurationLabel, inline: true },
      { name: "👮 الرولات المسموح لها تدخل السجن", value: allowedRolesText, inline: false },
      { name: "📋 الأسباب المضافة من قبلك", value: reasonsText, inline: false },
      { name: "🚨 كلمات السجن التلقائي (يلقطها البوت ويسجنه)", value: autoWordsText, inline: false }
    )
    .setFooter({ text: "سنيفر سيستم • حفظ واسترجاع الرولات تلقائياً عند انتهاء السجن" });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("jail_setup_auto")
      .setLabel("إنشاء/تجهيز روم ورتبة السجن")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("jail_add_reason")
      .setLabel("إضافة سبب جديد")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("jail_clear_reasons")
      .setLabel("مسح الأسباب")
      .setStyle(ButtonStyle.Danger)
  );

  const rowAuto = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("jail_add_auto_word")
      .setLabel("إضافة كلمة سجن تلقائي")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("jail_set_auto_duration")
      .setLabel("تحديد مدة التلقائي")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("jail_toggle_auto_word")
      .setLabel(config.autoJailEnabled ? "إيقاف التلقائي" : "تفعيل التلقائي")
      .setStyle(config.autoJailEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("jail_clear_auto_words")
      .setLabel("مسح الكلمات")
      .setStyle(ButtonStyle.Secondary)
  );

  const selectableRoles = guild.roles.cache
    .filter((r) => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .first(25);

  const rolesMenu = new StringSelectMenuBuilder()
    .setCustomId("jail_select_allowed_roles")
    .setPlaceholder("اختر الرولات المسموح لها باستخدام أمر السجن...")
    .setMinValues(0)
    .setMaxValues(Math.min(25, Math.max(1, selectableRoles.length)));

  if (selectableRoles.length > 0) {
    rolesMenu.addOptions(
      selectableRoles.map((role) => ({
        label: role.name.slice(0, 100),
        value: role.id,
        default: config.allowedRoles.includes(role.id),
      }))
    );
  } else {
    rolesMenu.setDisabled(true).addOptions({ label: "لا توجد رولات متاحة", value: "none" });
  }

  const rowMenu = new ActionRowBuilder().addComponents(rolesMenu);

  return { embeds: [embed], components: [row1, rowAuto, rowMenu] };
}

export async function handleAutoJailMessage(message) {
  if (!message?.guild || message.author?.bot) return false;

  const config = getJailConfig(message.guild.id);
  if (!config.autoJailEnabled || !config.autoJailWords?.length) return false;

  const member = message.member;
  if (!member) return false;

  // استثناء أصحاب صلاحية الإدارة أو الرولات المسموح لها بالسجن
  if (
    member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions?.has(PermissionsBitField.Flags.ModerateMembers) ||
    (config.allowedRoles.length > 0 &&
      member.roles?.cache?.some((r) => config.allowedRoles.includes(r.id)))
  ) {
    return false;
  }

  const normalizedContent = normalizeTextForMatch(message.content || "");
  if (!normalizedContent) return false;

  const matchedWord = config.autoJailWords.find((word) => {
    const cleanWord = normalizeTextForMatch(word);
    return cleanWord && normalizedContent.includes(cleanWord);
  });

  if (!matchedWord) return false;

  const parsedDuration = parseDurationToMs(config.autoJailDuration);
  const durationMs = parsedDuration === null ? 10 * 60 * 1000 : parsedDuration;
  const durationText = formatDurationArabic(durationMs);

  const reason = `سجن تلقائي بسبب استخدام كلمة ممنوعة: (${matchedWord})`;
  const { jailChannel, savedRolesCount } = await applyJailWithSavedRoles(
    message.guild,
    member,
    config,
    reason,
    message.client.user.id,
    durationMs,
    message.channel
  );

  const alertEmbed = new EmbedBuilder()
    .setColor("#DC2626")
    .setTitle("🚨 سجن تلقائي بالكلمات")
    .addFields(
      { name: "المسجون", value: `<@${message.author.id}>`, inline: true },
      { name: "الكلمة الملتقطة", value: `\`${matchedWord}\``, inline: true },
      { name: "المدة", value: durationText, inline: true },
      { name: "الرولات المحفوظة", value: `${savedRolesCount} رتبة`, inline: true },
      { name: "السبب", value: reason, inline: false }
    )
    .setTimestamp();

  await message.channel.send({ embeds: [alertEmbed] }).catch(() => {});

  if (jailChannel && jailChannel.id !== message.channel.id) {
    await jailChannel
      .send({
        content: `<@${message.author.id}>`,
        embeds: [alertEmbed],
      })
      .catch(() => {});
  }

  return true;
}

export function buildModerationGuideEmbed(prefix) {
  return new EmbedBuilder()
    .setColor("#1E1F22")
    .setTitle("🛡️ أوامر الإشراف الكاملة — سنيفر")
    .addFields({
      name: "🔨 العقوبات والإدارة",
      value: [
        `• \`${prefix}مسح [عدد]\` — مسح رسائل الروم`,
        `• \`${prefix}كتم @منشن [سبب]\` أو \`اسكت @منشن\` / \`${prefix}تكلم @منشن\` — كتم وفك الكتم`,
        `• \`${prefix}باند @منشن [سبب]\` أو \`تف @منشن\` / \`${prefix}لاباند [آيدي]\` — باند وفك الباند`,
        `• \`${prefix}طرد @منشن [سبب]\` أو \`بنعالي @منشن\` — طرد عضو من السيرفر`,
        `• \`${prefix}تايم @منشن [مدة مثل 10m] [سبب]\` / \`${prefix}لاتايم @منشن\` — تايم آوت وفكه`,
        `• \`${prefix}تحذير @منشن [سبب]\` / \`${prefix}تحذيرات @منشن\` — تحذير وعرض التحذيرات`,
        `• \`${prefix}قفل\` / \`${prefix}فتح\` — قفل وفتح الروم الحالي`,
        `• \`اوامر_سجن\` / \`إعداد_السجن\` — لوحة السجن ومدة وكلمات السجن التلقائي`,
        `• \`${prefix}سجن @منشن\` / \`${prefix}فك_سجن @منشن\` — سجن عضو أو الإفراج عنه وإرجاع رولاته`,
      ].join("\n"),
      inline: false,
    });
}

function canUseModeration(member, guild, actionKey) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  const config = getJailConfig(guild.id);
  if (
    ["jail", "unjail"].includes(actionKey) &&
    config.allowedRoles.length > 0 &&
    member.roles?.cache?.some((r) => config.allowedRoles.includes(r.id))
  ) {
    return true;
  }

  switch (actionKey) {
    case "purge":
    case "lock":
    case "unlock":
      return member.permissions?.has(PermissionsBitField.Flags.ManageChannels);
    case "mute":
    case "unmute":
    case "timeout":
    case "untimeout":
    case "warn":
    case "warnings":
    case "jail":
    case "unjail":
      return member.permissions?.has(PermissionsBitField.Flags.ModerateMembers);
    case "kick":
      return member.permissions?.has(PermissionsBitField.Flags.KickMembers);
    case "ban":
    case "unban":
      return member.permissions?.has(PermissionsBitField.Flags.BanMembers);
    default:
      return false;
  }
}

function mapActionKey(normalizedWord, fallbackArg) {
  const token = normalizedWord || normalizeArabicCommand(fallbackArg || "");
  if (["اوامر_سجن", "سجن_اعداد", "اعداد_السجن", "اعداد_سجن"].includes(token)) {
    return "jail_setup";
  }
  if (["سجن", "السجن"].includes(token)) return "jail";
  if (["فك_سجن", "افراج"].includes(token)) return "unjail";
  if (["مسح"].includes(token)) return "purge";
  if (["كتم", "اسكت"].includes(token)) return "mute";
  if (["تكلم", "فك_كتم", "انبح"].includes(token)) return "unmute";
  if (["باند", "تف"].includes(token)) return "ban";
  if (["لاباند"].includes(token)) return "unban";
  if (["طرد", "بنعالي"].includes(token)) return "kick";
  if (["تايم"].includes(token)) return "timeout";
  if (["لاتايم"].includes(token)) return "untimeout";
  if (["تحذير"].includes(token)) return "warn";
  if (["تحذيرات"].includes(token)) return "warnings";
  if (["قفل"].includes(token)) return "lock";
  if (["فتح", "لاقفل"].includes(token)) return "unlock";
  if (["اشراف", "الاشراف"].includes(token)) return "guide";
  return null;
}

export default {
  data: new SlashCommandBuilder()
    .setName("modpanel")
    .setDescription("أوامر الإشراف الكاملة ونظام السجن"),
  name: "modpanel",
  aliases: [
    "اشراف",
    "الاشراف",
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
    "سجن",
    "السجن",
    "اوامر_سجن",
    "سجن_اعداد",
    "إعداد_السجن",
    "فك_سجن",
    "افراج",
  ],
  description: "أوامر الإشراف الكاملة ونظام السجن",
  async execute(messageOrInteraction, args = []) {
    const guild = messageOrInteraction.guild;
    if (!guild) return;

    const prefix = getCommandPrefix(guild.id) || "!";
    const member = messageOrInteraction.member;
    const rawContent = String(messageOrInteraction.content || "").trim();
    const firstToken = rawContent.split(/\s+/)[0] || "";
    const normalizedFirst = normalizeArabicCommand(firstToken);
    const actionKey = mapActionKey(normalizedFirst, args[0]);

    if (!actionKey || actionKey === "guide") {
      return messageOrInteraction.reply({ embeds: [buildModerationGuideEmbed(prefix)] });
    }

    const config = getJailConfig(guild.id);

    if (actionKey === "jail_setup") {
      if (!member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
        return messageOrInteraction.reply({
          content: "❌ هذا الأمر مخصص لإدارة السيرفر فقط.",
        });
      }
      return messageOrInteraction.reply(buildJailSetupPanel(guild, prefix));
    }

    if (!canUseModeration(member, guild, actionKey)) {
      return messageOrInteraction.reply({
        content: "❌ ما عندك صلاحية كافية لاستخدام هذا الأمر.",
      });
    }

    if (actionKey === "purge") {
      const count = Math.min(100, Math.max(1, Number(args[0]) || 10));
      const deleted = await messageOrInteraction.channel.bulkDelete(count, true).catch(() => null);
      const replyMsg = await messageOrInteraction.reply({
        content: `🧹 تم مسح **${deleted?.size ?? 0}** رسالة.`,
      });
      setTimeout(() => replyMsg.delete().catch(() => {}), 4000);
      return replyMsg;
    }

    if (actionKey === "lock" || actionKey === "unlock") {
      const isLock = actionKey === "lock";
      await messageOrInteraction.channel.permissionOverwrites.edit(guild.roles.everyone.id, {
        SendMessages: !isLock,
      });
      return messageOrInteraction.reply({
        content: isLock ? "🔒 تم قفل الروم بنجاح." : "🔓 تم فتح الروم بنجاح.",
      });
    }

    if (actionKey === "unban") {
      const userId = args[0]?.replace(/[<@!>]/g, "");
      if (!userId) {
        return messageOrInteraction.reply({
          content: `⚠️ اكتب آيدي الشخص، مثال: \`${prefix}لاباند 123456789012345678\``,
        });
      }
      await guild.members.unban(userId).catch(() => null);
      return messageOrInteraction.reply({
        content: `🔓 تم فك الباند عن الآيدي \`${userId}\`.`,
      });
    }

    const targetUser = await resolveTargetUser(messageOrInteraction, args);
    if (!targetUser) {
      return messageOrInteraction.reply({
        content: `⚠️ منشن العضو أو رد على رسالته، مثال: \`${prefix}سجن @العضو\``,
      });
    }

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

    if (actionKey === "warnings") {
      const list = getWarnings(guild.id, targetUser.id);
      if (list.length === 0) {
        return messageOrInteraction.reply({
          content: `✅ العضو ${targetUser} ما عليه أي تحذيرات.`,
        });
      }
      const text = list
        .map((w, idx) => `${idx + 1}. **السبب:** ${w.reason} — **بواسطة:** <@${w.by}>`)
        .join("\n");
      return messageOrInteraction.reply({
        content: `⚠️ تحذيرات ${targetUser} (${list.length}):\n${text}`,
      });
    }

    if (actionKey === "warn") {
      const reason = args.slice(1).join(" ").trim() || "مخالفة القوانين";
      const list = addWarning(guild.id, targetUser.id, reason, messageOrInteraction.author.id);
      return messageOrInteraction.reply({
        content: `⚠️ تم إعطاء تحذير لـ ${targetUser}\n**السبب:** ${reason}\n**إجمالي التحذيرات:** ${list.length}`,
      });
    }

    if (actionKey === "mute" || actionKey === "unmute") {
      if (!targetMember) {
        return messageOrInteraction.reply({ content: "❌ العضو غير موجود في السيرفر." });
      }
      const muteRole = await ensureMuteRole(guild, config).catch(() => null);
      if (!muteRole) {
        return messageOrInteraction.reply({
          content: "❌ ما قدرت أنشئ أو أعدل رتبة الكتم، تأكد من صلاحية Manage Roles للبوت.",
        });
      }
      if (actionKey === "mute") {
        const reason = args.slice(1).join(" ").trim() || "كتم إشرافي";
        await targetMember.roles.add(muteRole.id, reason).catch(() => null);
        return messageOrInteraction.reply({
          content: `🔇 تم كتم ${targetUser}\n**السبب:** ${reason}`,
        });
      } else {
        await targetMember.roles.remove(muteRole.id, "فك الكتم").catch(() => null);
        return messageOrInteraction.reply({
          content: `🔊 تم فك الكتم عن ${targetUser}.`,
        });
      }
    }

    if (actionKey === "timeout" || actionKey === "untimeout") {
      if (!targetMember) {
        return messageOrInteraction.reply({ content: "❌ العضو غير موجود في السيرفر." });
      }
      if (actionKey === "untimeout") {
        await targetMember.timeout(null, "فك التايم آوت");
        return messageOrInteraction.reply({
          content: `✅ تم فك التايم آوت عن ${targetUser}.`,
        });
      }
      const durationMs = parseDurationToMs(args[1]) || 10 * 60 * 1000;
      const reason = args.slice(2).join(" ").trim() || "تايم آوت إشرافي";
      await targetMember.timeout(durationMs, reason);
      return messageOrInteraction.reply({
        content: `⏱️ تم إعطاء تايم آوت لـ ${targetUser}\n**السبب:** ${reason}`,
      });
    }

    if (actionKey === "kick") {
      if (!targetMember) {
        return messageOrInteraction.reply({ content: "❌ العضو غير موجود في السيرفر." });
      }
      const reason = args.slice(1).join(" ").trim() || "طرد إشرافي";
      await targetMember.kick(reason);
      return messageOrInteraction.reply({
        content: `👢 تم طرد ${targetUser}\n**السبب:** ${reason}`,
      });
    }

    if (actionKey === "ban") {
      const reason = args.slice(1).join(" ").trim() || "باند إشرافي";
      await guild.members.ban(targetUser.id, { reason });
      return messageOrInteraction.reply({
        content: `🔨 تم إعطاء باند لـ ${targetUser}\n**السبب:** ${reason}`,
      });
    }

    if (actionKey === "unjail") {
      const { restoredCount } = await releaseMemberFromJail(
        guild,
        targetUser.id,
        config,
        `فك السجن بواسطة ${messageOrInteraction.author.tag}`,
        messageOrInteraction.channel
      );
      return messageOrInteraction.reply({
        content: `🔓 تم الإفراج عن ${targetUser} وإرجاع **${restoredCount}** رتبة بنجاح.`,
      });
    }

    if (actionKey === "jail") {
      if (!targetMember) {
        return messageOrInteraction.reply({ content: "❌ العضو غير موجود في السيرفر." });
      }
      const selectOptions = [];
      if (config.reasons.length > 0) {
        config.reasons.slice(0, 24).forEach((reason, idx) => {
          selectOptions.push({
            label: reason.slice(0, 100),
            value: `reason_${idx}`,
            description: "اضغط لاختيار هذا السبب وسجن العضو",
          });
        });
      }
      selectOptions.push({
        label: "كتابة سبب",
        value: "custom_reason",
        description: "اكتب سبب السجن الآن",
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`jail_pick_reason_${targetUser.id}_${messageOrInteraction.author.id}`)
        .setPlaceholder(`اختر سبب سجن ${targetUser.username}...`)
        .addOptions(selectOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      const embed = new EmbedBuilder()
        .setColor("#D9534F")
        .setTitle("⛓️ تحديد سبب السجن")
        .setDescription(`العضو المستهدف: ${targetUser}\nاختر السبب من القائمة بالأسفل:`);

      return messageOrInteraction.reply({ embeds: [embed], components: [row] });
    }
  },
};

export async function handleJailInteraction(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;

  const config = getJailConfig(guild.id);
  const prefix = getCommandPrefix(guild.id) || "!";

  try {
    if (interaction.isButton()) {
      if (interaction.customId === "jail_setup_auto") {
        await interaction.deferUpdate();
        await ensureJailSetup(guild, config);
        await interaction.editReply(buildJailSetupPanel(guild, prefix));
        return true;
      }

      if (interaction.customId === "jail_add_reason") {
        const modal = new ModalBuilder()
          .setCustomId("jail_modal_add_reason")
          .setTitle("إضافة سبب جديد للسجن");

        const input = new TextInputBuilder()
          .setCustomId("jail_reason_text")
          .setLabel("اكتب السبب")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === "jail_clear_reasons") {
        config.reasons = [];
        await interaction.update(buildJailSetupPanel(guild, prefix));
        return true;
      }

      if (interaction.customId === "jail_add_auto_word") {
        const modal = new ModalBuilder()
          .setCustomId("jail_modal_add_auto_word")
          .setTitle("إضافة كلمة سجن تلقائي");

        const input = new TextInputBuilder()
          .setCustomId("jail_auto_word_text")
          .setLabel("اكتب الكلمة أو العبارة التي تسجن تلقائياً")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === "jail_set_auto_duration") {
        const modal = new ModalBuilder()
          .setCustomId("jail_modal_set_auto_duration")
          .setTitle("تحديد مدة السجن التلقائي");

        const input = new TextInputBuilder()
          .setCustomId("jail_auto_duration_text")
          .setLabel("مثال: 30s أو 10m أو 1h أو 1d أو دائم")
          .setValue(config.autoJailDuration || "10m")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === "jail_toggle_auto_word") {
        config.autoJailEnabled = !config.autoJailEnabled;
        await interaction.update(buildJailSetupPanel(guild, prefix));
        return true;
      }

      if (interaction.customId === "jail_clear_auto_words") {
        config.autoJailWords = [];
        await interaction.update(buildJailSetupPanel(guild, prefix));
        return true;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "jail_modal_add_reason") {
        const newReason = interaction.fields.getTextInputValue("jail_reason_text").trim();
        if (newReason) {
          config.reasons.push(newReason);
        }
        await interaction.update(buildJailSetupPanel(guild, prefix));
        return true;
      }

      if (interaction.customId === "jail_modal_add_auto_word") {
        const word = interaction.fields.getTextInputValue("jail_auto_word_text").trim();
        if (word && !config.autoJailWords.includes(word)) {
          config.autoJailWords.push(word);
        }
        await interaction.update(buildJailSetupPanel(guild, prefix));
        return true;
      }

      if (interaction.customId === "jail_modal_set_auto_duration") {
        const rawDuration = interaction.fields.getTextInputValue("jail_auto_duration_text").trim();
        const parsed = parseDurationToMs(rawDuration);
        if (parsed === null) {
          await interaction.reply({
            content: "❌ صيغة المدة غير صحيحة. اكتب مثل `30s` أو `10m` أو `2h` أو `1d` أو `دائم`.",
            ephemeral: true,
          });
          return true;
        }
        config.autoJailDuration = parsed === 0 ? "دائم" : rawDuration;
        await interaction.update(buildJailSetupPanel(guild, prefix));
        return true;
      }

      if (interaction.customId.startsWith("jail_modal_custom_")) {
        const targetUserId = interaction.customId.replace("jail_modal_custom_", "");
        const customReason = interaction.fields.getTextInputValue("custom_reason_input").trim();
        await executeJailOnMember(interaction, guild, targetUserId, customReason, config);
        return true;
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "jail_select_allowed_roles") {
        config.allowedRoles = interaction.values;
        await interaction.update(buildJailSetupPanel(guild, prefix));
        return true;
      }

      if (interaction.customId.startsWith("jail_pick_reason_")) {
        const parts = interaction.customId.replace("jail_pick_reason_", "").split("_");
        const targetUserId = parts[0];
        const executorId = parts[1];

        if (interaction.user.id !== executorId) {
          await interaction.reply({
            content: "❌ هذه القائمة خاصة بالشخص الذي بدأ أمر السجن فقط.",
            ephemeral: true,
          });
          return true;
        }

        const selectedVal = interaction.values[0];
        if (selectedVal === "custom_reason") {
          const modal = new ModalBuilder()
            .setCustomId(`jail_modal_custom_${targetUserId}`)
            .setTitle("كتابة سبب السجن");

          const input = new TextInputBuilder()
            .setCustomId("custom_reason_input")
            .setLabel("سبب السجن")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(300);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await interaction.showModal(modal);
          return true;
        }

        const reasonIndex = Number(selectedVal.replace("reason_", ""));
        const chosenReason = config.reasons[reasonIndex];
        if (!chosenReason) {
          await interaction.reply({ content: "❌ هذا السبب غير متوفر.", ephemeral: true });
          return true;
        }

        await executeJailOnMember(interaction, guild, targetUserId, chosenReason, config);
        return true;
      }
    }
  } catch (err) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "❌ حصل خطأ أثناء تنفيذ العملية.", ephemeral: true })
        .catch(() => {});
    }
    return true;
  }

  return false;
}

async function executeJailOnMember(interaction, guild, targetUserId, reason, config) {
  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
  if (!targetMember) {
    await interaction.reply({ content: "❌ لم يتم العثور على العضو.", ephemeral: true });
    return;
  }

  const { jailChannel, savedRolesCount } = await applyJailWithSavedRoles(
    guild,
    targetMember,
    config,
    reason,
    interaction.user.id,
    0,
    interaction.channel
  );

  const resultEmbed = new EmbedBuilder()
    .setColor("#B91C1C")
    .setTitle("⛓️ تم إدخال عضو إلى السجن")
    .addFields(
      { name: "المسجون", value: `<@${targetUserId}>`, inline: true },
      { name: "بواسطة", value: `<@${interaction.user.id}>`, inline: true },
      { name: "الرولات المحفوظة", value: `${savedRolesCount} رتبة`, inline: true },
      { name: "السبب", value: reason, inline: false }
    )
    .setTimestamp();

  await interaction.update({ embeds: [resultEmbed], components: [] });

  if (jailChannel && jailChannel.id !== interaction.channel?.id) {
    await jailChannel
      .send({
        content: `<@${targetUserId}>`,
        embeds: [resultEmbed],
      })
      .catch(() => {});
  }
}
