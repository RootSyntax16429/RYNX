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

const DEFAULT_JAIL_CONFIG = {
  jailChannelId: null,
  jailRoleId: null,
  muteRoleId: null,
  allowedRoles: [],
  reasons: [],
  jailedUsers: {},
};

export function getJailConfig(guildId) {
  if (!jailConfigs.has(guildId)) {
    jailConfigs.set(guildId, {
      ...DEFAULT_JAIL_CONFIG,
      allowedRoles: [],
      reasons: [],
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
  const match = String(input)
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*(s|m|h|d|ث|د|س|ي)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2] || "m";

  if (unit === "s" || unit === "ث") return amount * 1000;
  if (unit === "m" || unit === "د") return amount * 60 * 1000;
  if (unit === "h" || unit === "س") return amount * 60 * 60 * 1000;
  if (unit === "d" || unit === "ي") return amount * 24 * 60 * 60 * 1000;
  return null;
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
    await jailChannel.permissionOverwrites.edit(guild.roles.everyone.id, {
      ViewChannel: false,
    });
    await jailChannel.permissionOverwrites.edit(jailRole.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
  }
  config.jailChannelId = jailChannel.id;

  for (const [, ch] of guild.channels.cache) {
    if (ch.id !== jailChannel.id && ch.permissionOverwrites) {
      await ch.permissionOverwrites
        .edit(jailRole.id, {
          ViewChannel: false,
          SendMessages: false,
          Connect: false,
        })
        .catch(() => {});
    }
  }

  return { jailRole, jailChannel };
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

  const embed = new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle("🔒 لوحة إعدادات نظام السجن — سنيفر")
    .setDescription(
      `إعداد روم السجن، رتبة السجن، الرولات المسموح لها بالسجن، وأسباب السجن الخاصة بك.\nاستخدم \`${prefix}سجن @منشن\` لسجن عضو، و \`${prefix}فك_سجن @منشن\` لإخراجه.`
    )
    .addFields(
      { name: "🏠 روم السجن", value: jailChannelText, inline: true },
      { name: "⛓️ رتبة السجن", value: jailRoleText, inline: true },
      { name: "👮 الرولات المسموح لها تدخل السجن", value: allowedRolesText, inline: false },
      { name: "📋 الأسباب المضافة من قبلك", value: reasonsText, inline: false }
    )
    .setFooter({ text: "سنيفر سيستم • نظام السجن" });

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

  const row2 = new ActionRowBuilder().addComponents(rolesMenu);

  return { embeds: [embed], components: [row1, row2] };
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
        `• \`${prefix}باند @منشن [سبب]\` / \`${prefix}لاباند [آيدي]\` — باند وفك الباند`,
        `• \`${prefix}طرد @منشن [سبب]\` — طرد عضو من السيرفر`,
        `• \`${prefix}تايم @منشن [مدة مثل 10m] [سبب]\` / \`${prefix}لاتايم @منشن\` — تايم آوت وفكه`,
        `• \`${prefix}تحذير @منشن [سبب]\` / \`${prefix}تحذيرات @منشن\` — تحذير وعرض التحذيرات`,
        `• \`${prefix}قفل\` / \`${prefix}فتح\` — قفل وفتح الروم الحالي`,
        `• \`اوامر_سجن\` / \`إعداد_السجن\` / \`${prefix}سجن @منشن\` / \`${prefix}فك_سجن @منشن\` — نظام السجن الكامل`,
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
      if (!targetMember) {
        return messageOrInteraction.reply({ content: "❌ العضو غير موجود في السيرفر." });
      }
      const { jailRole } = await ensureJailSetup(guild, config);
      const savedData = config.jailedUsers[targetUser.id];

      if (targetMember.roles.cache.has(jailRole.id)) {
        await targetMember.roles.remove(jailRole.id, "فك السجن");
      }
      if (savedData?.roles?.length) {
        const validRoles = savedData.roles.filter(
          (rId) => guild.roles.cache.has(rId) && rId !== jailRole.id
        );
        if (validRoles.length > 0) {
          await targetMember.roles.add(validRoles, "إرجاع الرولات بعد فك السجن").catch(() => {});
        }
        delete config.jailedUsers[targetUser.id];
      }
      return messageOrInteraction.reply({
        content: `🔓 تم الإفراج عن ${targetUser} وفك السجن بنجاح.`,
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
  }

  if (interaction.isModalSubmit() && interaction.customId === "jail_modal_add_reason") {
    const newReason = interaction.fields.getTextInputValue("jail_reason_text").trim();
    if (newReason) {
      config.reasons.push(newReason);
    }
    await interaction.update(buildJailSetupPanel(guild, prefix));
    return true;
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

  if (interaction.isModalSubmit() && interaction.customId.startsWith("jail_modal_custom_")) {
    const targetUserId = interaction.customId.replace("jail_modal_custom_", "");
    const customReason = interaction.fields.getTextInputValue("custom_reason_input").trim();
    await executeJailOnMember(interaction, guild, targetUserId, customReason, config);
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

  const { jailRole, jailChannel } = await ensureJailSetup(guild, config);

  const previousRoles = targetMember.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed && r.id !== jailRole.id)
    .map((r) => r.id);

  config.jailedUsers[targetUserId] = {
    roles: previousRoles,
    reason,
    by: interaction.user.id,
    at: Date.now(),
  };

  if (previousRoles.length > 0) {
    await targetMember.roles
      .remove(previousRoles, `سجن العضو - السبب: ${reason}`)
      .catch(() => {});
  }
  await targetMember.roles.add(jailRole.id, `سجن العضو - السبب: ${reason}`);

  const resultEmbed = new EmbedBuilder()
    .setColor("#B91C1C")
    .setTitle("⛓️ تم إدخال عضو إلى السجن")
    .addFields(
      { name: "المسجون", value: `<@${targetUserId}>`, inline: true },
      { name: "بواسطة", value: `<@${interaction.user.id}>`, inline: true },
      { name: "السبب", value: reason, inline: false }
    )
    .setTimestamp();

  await interaction.update({ embeds: [resultEmbed], components: [] });

  if (jailChannel) {
    await jailChannel
      .send({
        content: `<@${targetUserId}>`,
        embeds: [resultEmbed],
      })
      .catch(() => {});
  }
}
