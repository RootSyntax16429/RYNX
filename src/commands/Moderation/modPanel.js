import fs from "fs";
import path from "path";
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
import { isBotOwner } from "../../config/bot.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const JAIL_STORE_PATH = path.join(DATA_DIR, "jailed_roles.json");
const CONFIG_STORE_PATH = path.join(DATA_DIR, "mod_configs.json");
const WARNS_STORE_PATH = path.join(DATA_DIR, "mod_warns.json");
const EXEMPTION_STORE_PATH = path.join(DATA_DIR, "jail_exemptions.json");

const DEFAULT_JAIL_REASONS = [
  "قذف أو سب الأعضاء",
  "نشر روابط أو إعلانات",
  "السبام والإزعاج المتكرر",
  "مخالفة قوانين السيرفر",
];

function readJsonMap(filePath) {
  try {
    if (!fs.existsSync(filePath)) return new Map();
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return new Map(Object.entries(raw || {}));
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err);
    return new Map();
  }
}

function writeJsonMap(filePath, map) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const obj = Object.fromEntries(map.entries());
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error(`Failed to write ${filePath}:`, err);
  }
}

const jailedMembers = readJsonMap(JAIL_STORE_PATH);
const guildModConfigs = readJsonMap(CONFIG_STORE_PATH);
const guildWarns = readJsonMap(WARNS_STORE_PATH);
const exemptionRequests = readJsonMap(EXEMPTION_STORE_PATH);

function isOwnerUser(userId, guild = null) {
  if (!userId) return false;
  if (typeof isBotOwner === "function" && isBotOwner(userId)) return true;
  if (guild?.ownerId === userId) return true;
  const envOwners = String(process.env.BOT_OWNER_IDS || process.env.OWNER_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return envOwners.includes(String(userId));
}

function isProtectedTarget(member, guild) {
  if (!member) return false;
  if (isOwnerUser(member.id, guild)) return true;
  return false;
}

function hasModPerm(member, perm, guild = null) {
  if (!member) return false;
  if (isOwnerUser(member.id, guild)) return true;
  return (
    member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions?.has(perm)
  );
}

function getJailConfig(guildId) {
  const existing = guildModConfigs.get(guildId);
  if (existing && typeof existing === "object") {
    return {
      jailRoleId: existing.jailRoleId || null,
      jailChannelId: existing.jailChannelId || null,
      exemptionChannelId: existing.exemptionChannelId || null,
      autoJailEnabled:
        typeof existing.autoJailEnabled === "boolean"
          ? existing.autoJailEnabled
          : true,
      autoJailWords: Array.isArray(existing.autoJailWords)
        ? existing.autoJailWords
        : [],
      jailReasons:
        Array.isArray(existing.jailReasons) && existing.jailReasons.length
          ? existing.jailReasons
          : [...DEFAULT_JAIL_REASONS],
    };
  }

  const defaultCfg = {
    jailRoleId: null,
    jailChannelId: null,
    exemptionChannelId: null,
    autoJailEnabled: true,
    autoJailWords: [],
    jailReasons: [...DEFAULT_JAIL_REASONS],
  };
  guildModConfigs.set(guildId, defaultCfg);
  writeJsonMap(CONFIG_STORE_PATH, guildModConfigs);
  return defaultCfg;
}

function saveJailConfig(guildId, cfg) {
  guildModConfigs.set(guildId, cfg);
  writeJsonMap(CONFIG_STORE_PATH, guildModConfigs);
}

function addUserWarning(guildId, userId, reason = "مخالفة القوانين", moderatorId = null) {
  const key = `${guildId}:${userId}`;
  const current = Array.isArray(guildWarns.get(key)) ? guildWarns.get(key) : [];
  current.push({
    reason,
    moderatorId,
    at: new Date().toISOString(),
  });
  guildWarns.set(key, current);
  writeJsonMap(WARNS_STORE_PATH, guildWarns);
  return current.length;
}

function getUserWarnings(guildId, userId) {
  const key = `${guildId}:${userId}`;
  return Array.isArray(guildWarns.get(key)) ? guildWarns.get(key) : [];
}

function normalizeArabic(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .trim();
}

function parseId(raw = "") {
  return String(raw).replace(/[<@!#&>]/g, "").trim();
}

function parseDurationMs(raw = "") {
  if (!raw) return 10 * 60 * 1000;
  const match = String(raw)
    .trim()
    .match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day)?$/i);
  if (!match) return 10 * 60 * 1000;
  const val = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  if (unit.startsWith("s")) return val * 1000;
  if (unit.startsWith("h")) return val * 60 * 60 * 1000;
  if (unit.startsWith("d")) return val * 24 * 60 * 60 * 1000;
  return val * 60 * 1000;
}

function getRestorableRoles(guild, savedRoleIds = []) {
  const botMember = guild.members.me;
  const botHighestPos = botMember?.roles?.highest?.position ?? 0;

  return savedRoleIds.filter((roleId) => {
    const role = guild.roles.cache.get(roleId);
    if (!role || role.managed || role.id === guild.roles.everyone.id) return false;
    if (botMember && role.position >= botHighestPos) return false;
    return true;
  });
}

function resolveJailReason(rawReason = "", reasonsList = DEFAULT_JAIL_REASONS) {
  const trimmed = String(rawReason || "").trim();
  if (!trimmed || trimmed === "بدون سبب") {
    return reasonsList[0] || "مخالفة القوانين";
  }

  const idx = Number(trimmed) - 1;
  if (!Number.isNaN(idx) && reasonsList[idx]) {
    return reasonsList[idx];
  }

  const matched = reasonsList.find((r) =>
    normalizeArabic(r).includes(normalizeArabic(trimmed))
  );
  return matched || trimmed;
}

async function setupSaidnayaAndExemptionRooms(guild, cfg) {
  let jailRole = cfg.jailRoleId ? guild.roles.cache.get(cfg.jailRoleId) : null;
  if (!jailRole) {
    jailRole = await guild.roles
      .create({
        name: "سجين • صيدنايا",
        color: "#5865F2",
        reason: "إنشاء رتبة السجن لنظام صيدنايا",
      })
      .catch(() => null);
    if (jailRole) cfg.jailRoleId = jailRole.id;
  }

  let jailChannel = cfg.jailChannelId
    ? guild.channels.cache.get(cfg.jailChannelId)
    : null;
  if (!jailChannel) {
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
    ];
    if (jailRole) {
      overwrites.push({
        id: jailRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    jailChannel = await guild.channels
      .create({
        name: "صيدنايا",
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites,
        reason: "إنشاء روم صيدنايا للسجناء",
      })
      .catch(() => null);
    if (jailChannel) cfg.jailChannelId = jailChannel.id;
  }

  let exemptionChannel = cfg.exemptionChannelId
    ? guild.channels.cache.get(cfg.exemptionChannelId)
    : null;
  if (!exemptionChannel) {
    exemptionChannel = await guild.channels
      .create({
        name: "طلبات-الإعفاء",
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ],
        reason: "إنشاء روم طلبات الإعفاء للإدارة",
      })
      .catch(() => null);
    if (exemptionChannel) cfg.exemptionChannelId = exemptionChannel.id;
  }

  saveJailConfig(guild.id, cfg);

  if (jailChannel && typeof jailChannel.send === "function") {
    const welcomeJailEmbed = new EmbedBuilder()
      .setColor("#2B2D31")
      .setTitle("🔒 صيدنايا — قسم السجناء")
      .setDescription(
        "أنت الآن في **صيدنايا**.\nإذا عندك عذر وتبي تطلب إعفاء، اضغط على زر **تقديم إعفاء** بالأسفل واكتب سبب طلبك."
      )
      .setFooter({ text: "سنيفر سيستم • نظام الإعفاء" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("snaifer_exemption_open")
        .setLabel("تقديم إعفاء")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Primary)
    );

    await jailChannel.send({ embeds: [welcomeJailEmbed], components: [row] }).catch(() => {});
  }

  return { jailRole, jailChannel, exemptionChannel };
}

async function applyJailToMember(
  guild,
  member,
  cfg,
  reason = "مخالفة القوانين",
  moderatorId = null
) {
  const key = `${guild.id}:${member.id}`;
  const previousRoles = member.roles.cache
    .filter((r) => r.id !== guild.roles.everyone.id && r.id !== cfg.jailRoleId)
    .map((r) => r.id);

  jailedMembers.set(key, previousRoles);
  writeJsonMap(JAIL_STORE_PATH, jailedMembers);

  if (cfg.jailRoleId && guild.roles.cache.has(cfg.jailRoleId)) {
    const jailRole = guild.roles.cache.get(cfg.jailRoleId);
    const botHighestPos = guild.members.me?.roles?.highest?.position ?? 0;
    if (jailRole && !jailRole.managed && jailRole.position < botHighestPos) {
      await member.roles.set([cfg.jailRoleId], reason).catch(() => {});
    }
  }

  if (cfg.jailChannelId) {
    const jailChannel = guild.channels.cache.get(cfg.jailChannelId);
    if (jailChannel && typeof jailChannel.send === "function") {
      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("🔒 تم إيداع عضو في صيدنايا")
        .addFields(
          { name: "👤 العضو", value: `${member} (\`${member.id}\`)`, inline: true },
          {
            name: "👮 بواسطة",
            value: moderatorId ? `<@${moderatorId}>` : "النظام التلقائي",
            inline: true,
          },
          { name: "📌 السبب", value: `**${reason}**`, inline: false }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("snaifer_exemption_open")
          .setLabel("تقديم إعفاء")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Primary)
      );

      await jailChannel
        .send({ content: `${member}`, embeds: [embed], components: [row] })
        .catch(() => {});
    }
  }
}

async function releaseJailFromMember(guild, member, cfg, reason = "فك السجن") {
  const key = `${guild.id}:${member.id}`;
  const savedRoles = jailedMembers.get(key);
  const prevRoles = Array.isArray(savedRoles) ? savedRoles : [];
  const manageableRoles = getRestorableRoles(guild, prevRoles);

  if (manageableRoles.length > 0) {
    await member.roles.set(manageableRoles, reason).catch(() => {});
  } else if (cfg.jailRoleId && member.roles.cache.has(cfg.jailRoleId)) {
    await member.roles.remove(cfg.jailRoleId, reason).catch(() => {});
  }

  jailedMembers.delete(key);
  writeJsonMap(JAIL_STORE_PATH, jailedMembers);
}

export function buildModPanelEmbed(guild) {
  const cfg = getJailConfig(guild.id);
  const jailRoleText = cfg.jailRoleId ? `<@&${cfg.jailRoleId}>` : "غير محدد";
  const jailChannelText = cfg.jailChannelId ? `<#${cfg.jailChannelId}>` : "غير محدد";
  const exemptionChannelText = cfg.exemptionChannelId
    ? `<#${cfg.exemptionChannelId}>`
    : "غير محدد";

  const wordsText = cfg.autoJailWords.length
    ? cfg.autoJailWords.map((w, i) => `${i + 1}. \`${w}\``).join(" ، ")
    : "لا توجد كلمات سجن تلقائي";

  const reasonsText = cfg.jailReasons.length
    ? cfg.jailReasons.map((r, i) => `${i + 1}. **${r}**`).join("\n")
    : "لا توجد خيارات أسباب مضافة";

  return new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle("🛡️ لوحة تحكم الإشراف وصيدنايا — سنيفر")
    .setDescription(
      "تحكم كامل بالخيارات، أسباب السجن، حفظ الرولات في ملف JSON، صيدنايا، الإعفاء، والكلمات التلقائية."
    )
    .addFields(
      { name: "🔒 رتبة السجن", value: jailRoleText, inline: true },
      { name: "🏠 روم صيدنايا", value: jailChannelText, inline: true },
      { name: "📩 روم الإعفاء", value: exemptionChannelText, inline: true },
      {
        name: "⚡ السجن التلقائي",
        value: cfg.autoJailEnabled ? "مفعّل ✅" : "معطّل ⛔",
        inline: true,
      },
      { name: "📋 خيارات أسباب السجن (من تحكمك)", value: reasonsText, inline: false },
      { name: "🚨 كلمات السجن التلقائي", value: wordsText, inline: false },
      {
        name: "📌 أوامر الشات السريعة",
        value:
          "`سجن @عضو [رقم السبب أو نصه]` • `فك_سجن @عضو`\n" +
          "`انشاء_السجن` • `اعفاء [السبب]` • `سجن_اعداد [رتبة] [صيدنايا] [الإعفاء]`\n" +
          "`كتم @عضو [المدة]` • `تكلم @عضو` • `طرد @عضو` • `باند @عضو` • `لاباند ID`\n" +
          "`تايم @عضو [10m]` • `لاتايم @عضو` • `تحذير @عضو` • `تحذيرات @عضو`\n" +
          "`مسح [1-100]` • `قفل` • `فتح`",
        inline: false,
      }
    )
    .setFooter({ text: "سنيفر سيستم • لوحة التحكم الموسّعة" });
}

function buildModPanelComponents(guild) {
  const cfg = getJailConfig(guild.id);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_mod_jail")
      .setLabel("سجن")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_unjail")
      .setLabel("فك سجن")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_create_rooms")
      .setLabel("إنشاء صيدنايا والإعفاء")
      .setEmoji("🏗️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_set_jail")
      .setLabel("إعداد الرومات والرتبة")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_mod_add_reason")
      .setLabel("إضافة خيار سبب")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_pop_reason")
      .setLabel("حذف آخر سبب")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_clear_reasons")
      .setLabel("تصفير الأسباب")
      .setEmoji("🧹")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_warn_check")
      .setLabel("عرض تحذيرات")
      .setEmoji("📄")
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_mod_timeout")
      .setLabel("تايم أوت")
      .setEmoji("⏳")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_untimeout")
      .setLabel("فك تايم أوت")
      .setEmoji("⏱️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_warn")
      .setLabel("تحذير")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_kick")
      .setLabel("طرد")
      .setEmoji("👢")
      .setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_mod_ban")
      .setLabel("باند")
      .setEmoji("🔨")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_unban")
      .setLabel("فك باند")
      .setEmoji("🕊️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_toggle_auto")
      .setLabel(cfg.autoJailEnabled ? "إيقاف التلقائي" : "تفعيل التلقائي")
      .setEmoji("⚡")
      .setStyle(cfg.autoJailEnabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_add_word")
      .setLabel("إضافة كلمة تلقائية")
      .setEmoji("🚨")
      .setStyle(ButtonStyle.Primary)
  );

  return [row1, row2, row3, row4];
}

async function submitExemptionRequest(guild, member, cfg, reasonText, replyFn) {
  const key = `${guild.id}:${member.id}`;
  const isJailed =
    jailedMembers.has(key) || (cfg.jailRoleId && member.roles.cache.has(cfg.jailRoleId));

  if (!isJailed && !isOwnerUser(member.id, guild)) {
    return replyFn({
      content: "❌ تقديم الإعفاء متاح فقط للأعضاء الموجودين في السجن.",
      ephemeral: true,
    });
  }

  const targetChannel = cfg.exemptionChannelId
    ? guild.channels.cache.get(cfg.exemptionChannelId)
    : null;

  if (!targetChannel || typeof targetChannel.send !== "function") {
    return replyFn({
      content:
        "❌ روم الإعفاء غير محدد بعد. استخدم زر **إنشاء صيدنايا والإعفاء** أو أمر `انشاء_السجن`.",
      ephemeral: true,
    });
  }

  const requestId = `${guild.id}:${member.id}:${Date.now()}`;
  exemptionRequests.set(requestId, {
    guildId: guild.id,
    userId: member.id,
    reason: reasonText,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  writeJsonMap(EXEMPTION_STORE_PATH, exemptionRequests);

  const embed = new EmbedBuilder()
    .setColor("#FEE75C")
    .setTitle("📝 طلب إعفاء جديد من صيدنايا")
    .addFields(
      { name: "👤 مقدم الطلب", value: `${member} (\`${member.id}\`)`, inline: true },
      { name: "📌 الحالة", value: "قيد المراجعة ⏳", inline: true },
      { name: "💬 سبب طلب الإعفاء", value: `**${reasonText}**`, inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`snaifer_ex_approve:${member.id}`)
      .setLabel("قبول الإعفاء وفك السجن")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`snaifer_ex_reject:${member.id}`)
      .setLabel("رفض الإعفاء")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );

  await targetChannel.send({ embeds: [embed], components: [row] }).catch(() => {});

  return replyFn({
    content: "✅ تم إرسال طلب الإعفاء للإدارة بنجاح، انتظر مراجعته.",
    ephemeral: true,
  });
}

export async function handleAutoJailMessage(message) {
  if (!message?.guild || message.author?.bot) return false;
  if (isOwnerUser(message.author.id, message.guild)) return false;

  const cfg = getJailConfig(message.guild.id);
  if (!cfg.autoJailEnabled || !cfg.autoJailWords?.length) return false;

  const normalizedContent = normalizeArabic(message.content || "");
  if (!normalizedContent) return false;

  const matched = cfg.autoJailWords.find((w) => {
    const clean = normalizeArabic(w);
    return clean && normalizedContent.includes(clean);
  });

  if (!matched) return false;

  const member =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));

  const reason = `سجن تلقائي بسبب الكلمة: ${matched}`;
  if (member && !isProtectedTarget(member, message.guild)) {
    await applyJailToMember(message.guild, member, cfg, reason, null);
  }

  await message.delete().catch(() => {});
  await message.channel
    .send({
      content: `🔒 تم سجن ${message.author} تلقائياً بسبب مخالفة كلمة محظورة.`,
    })
    .catch(() => {});

  return true;
}

export async function handleSnaiferModInteraction(interaction) {
  if (!interaction?.guild) return false;

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith("snaifer_jail_reason_select:")) {
      const targetUserId = interaction.customId.split(":")[1];
      const chosenReason = interaction.values?.[0] || "مخالفة القوانين";
      const cfg = getJailConfig(interaction.guild.id);
      const member = await interaction.guild.members
        .fetch(targetUserId)
        .catch(() => null);

      if (!member) {
        await interaction.update({
          content: "❌ لم يتم العثور على العضو.",
          components: [],
        });
        return true;
      }

      if (isProtectedTarget(member, interaction.guild)) {
        await interaction.update({
          content: "❌ لا يمكن سجن الأونر.",
          components: [],
        });
        return true;
      }

      await applyJailToMember(
        interaction.guild,
        member,
        cfg,
        chosenReason,
        interaction.user.id
      );

      await interaction.update({
        content: `🔒 تم سجن ${member} في صيدنايا | السبب: **${chosenReason}**`,
        components: [],
      });
      return true;
    }
  }

  if (interaction.isButton()) {
    const cfg = getJailConfig(interaction.guild.id);

    if (interaction.customId === "snaifer_exemption_open") {
      const modal = new ModalBuilder()
        .setCustomId("snaifer_modal_exemption")
        .setTitle("تقديم طلب إعفاء من صيدنايا");

      const reasonInput = new TextInputBuilder()
        .setCustomId("exemption_reason")
        .setLabel("اكتب سبب طلب الإعفاء")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
      return true;
    }

    if (
      interaction.customId.startsWith("snaifer_ex_approve:") ||
      interaction.customId.startsWith("snaifer_ex_reject:")
    ) {
      if (
        !hasModPerm(
          interaction.member,
          PermissionFlagsBits.ModerateMembers,
          interaction.guild
        )
      ) {
        await interaction.reply({
          content: "❌ هذا الإجراء مخصص للإدارة فقط.",
          ephemeral: true,
        });
        return true;
      }

      const [actionPart, targetUserId] = interaction.customId.split(":");
      const targetMember = await interaction.guild.members
        .fetch(targetUserId)
        .catch(() => null);

      if (actionPart === "snaifer_ex_approve") {
        if (targetMember) {
          await releaseJailFromMember(
            interaction.guild,
            targetMember,
            cfg,
            `قبول طلب الإعفاء بواسطة ${interaction.user.tag}`
          );
        }
        await interaction.update({
          content: `✅ تم **قبول الإعفاء** وفك سجن <@${targetUserId}> بواسطة ${interaction.user}.`,
          components: [],
        });
        return true;
      }

      if (actionPart === "snaifer_ex_reject") {
        await interaction.update({
          content: `❌ تم **رفض الإعفاء** للعضو <@${targetUserId}> بواسطة ${interaction.user}.`,
          components: [],
        });
        return true;
      }
    }

    if (interaction.customId.startsWith("snaifer_mod_")) {
      if (
        !hasModPerm(
          interaction.member,
          PermissionFlagsBits.ModerateMembers,
          interaction.guild
        )
      ) {
        await interaction.reply({
          content: "❌ ما عندك صلاحية استخدام اللوحة.",
          ephemeral: true,
        });
        return true;
      }

      if (interaction.customId === "snaifer_mod_create_rooms") {
        if (
          !hasModPerm(
            interaction.member,
            PermissionFlagsBits.ManageChannels,
            interaction.guild
          )
        ) {
          await interaction.reply({
            content: "❌ تحتاج صلاحية إدارة الرومات لإنشاء صيدنايا والإعفاء.",
            ephemeral: true,
          });
          return true;
        }

        const { jailRole, jailChannel, exemptionChannel } =
          await setupSaidnayaAndExemptionRooms(interaction.guild, cfg);

        await interaction.reply({
          content:
            `✅ تم تجهيز الرومات والرتبة:\n` +
            `• روم صيدنايا: ${jailChannel ? `<#${jailChannel.id}>` : "غير متاح"}\n` +
            `• روم الإعفاء: ${exemptionChannel ? `<#${exemptionChannel.id}>` : "غير متاح"}\n` +
            `• رتبة السجن: ${jailRole ? `<@&${jailRole.id}>` : "غير متاح"}`,
          ephemeral: true,
        });
        return true;
      }

      if (interaction.customId === "snaifer_mod_toggle_auto") {
        cfg.autoJailEnabled = !cfg.autoJailEnabled;
        saveJailConfig(interaction.guild.id, cfg);
        await interaction.update({
          embeds: [buildModPanelEmbed(interaction.guild)],
          components: buildModPanelComponents(interaction.guild),
        });
        return true;
      }

      if (interaction.customId === "snaifer_mod_pop_reason") {
        if (cfg.jailReasons.length > 0) {
          cfg.jailReasons.pop();
          saveJailConfig(interaction.guild.id, cfg);
        }
        await interaction.update({
          embeds: [buildModPanelEmbed(interaction.guild)],
          components: buildModPanelComponents(interaction.guild),
        });
        return true;
      }

      if (interaction.customId === "snaifer_mod_clear_reasons") {
        cfg.jailReasons = [];
        saveJailConfig(interaction.guild.id, cfg);
        await interaction.update({
          embeds: [buildModPanelEmbed(interaction.guild)],
          components: buildModPanelComponents(interaction.guild),
        });
        return true;
      }

      if (interaction.customId === "snaifer_mod_add_reason") {
        const modal = new ModalBuilder()
          .setCustomId("snaifer_modal_add_reason")
          .setTitle("إضافة خيار سبب للسجن");

        const reasonInput = new TextInputBuilder()
          .setCustomId("mod_input_1")
          .setLabel("اكتب خيار السبب الجديد")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === "snaifer_mod_jail") {
        const modal = new ModalBuilder()
          .setCustomId("snaifer_modal_pick_jail_target")
          .setTitle("سجن عضو — اختر العضو");

        const targetInput = new TextInputBuilder()
          .setCustomId("mod_input_1")
          .setLabel("آيدي أو منشن العضو")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(targetInput));
        await interaction.showModal(modal);
        return true;
      }

      const actionMap = {
        snaifer_mod_unjail: {
          id: "snaifer_modal_unjail",
          title: "فك سجن عضو",
          targetLabel: "آيدي أو منشن العضو",
          extraLabel: "السبب (اختياري)",
        },
        snaifer_mod_timeout: {
          id: "snaifer_modal_timeout",
          title: "إعطاء تايم أوت",
          targetLabel: "آيدي أو منشن العضو",
          extraLabel: "المدة (مثال: 10m أو 1h)",
        },
        snaifer_mod_untimeout: {
          id: "snaifer_modal_untimeout",
          title: "فك تايم أوت عن عضو",
          targetLabel: "آيدي أو منشن العضو",
          extraLabel: "السبب (اختياري)",
        },
        snaifer_mod_warn: {
          id: "snaifer_modal_warn",
          title: "تحذير عضو",
          targetLabel: "آيدي أو منشن العضو",
          extraLabel: "سبب التحذير",
        },
        snaifer_mod_warn_check: {
          id: "snaifer_modal_warn_check",
          title: "عرض تحذيرات عضو",
          targetLabel: "آيدي أو منشن العضو",
          extraLabel: "ملاحظة (اختياري)",
        },
        snaifer_mod_kick: {
          id: "snaifer_modal_kick",
          title: "طرد عضو",
          targetLabel: "آيدي أو منشن العضو",
          extraLabel: "السبب (اختياري)",
        },
        snaifer_mod_ban: {
          id: "snaifer_modal_ban",
          title: "حظر عضو (باند)",
          targetLabel: "آيدي أو منشن العضو",
          extraLabel: "السبب (اختياري)",
        },
        snaifer_mod_unban: {
          id: "snaifer_modal_unban",
          title: "فك باند عن عضو",
          targetLabel: "آيدي العضو",
          extraLabel: "السبب (اختياري)",
        },
        snaifer_mod_set_jail: {
          id: "snaifer_modal_set_jail",
          title: "إعداد السجن وصيدنايا",
          targetLabel: "آيدي رتبة السجن",
          extraLabel: "آيدي روم صيدنايا (اختياري)",
        },
        snaifer_mod_add_word: {
          id: "snaifer_modal_add_word",
          title: "إضافة كلمة سجن تلقائي",
          targetLabel: "الكلمة الممنوعة",
          extraLabel: "ملاحظة (اختياري)",
        },
      };

      const meta = actionMap[interaction.customId];
      if (!meta) return false;

      const modal = new ModalBuilder().setCustomId(meta.id).setTitle(meta.title);
      const input1 = new TextInputBuilder()
        .setCustomId("mod_input_1")
        .setLabel(meta.targetLabel)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const input2 = new TextInputBuilder()
        .setCustomId("mod_input_2")
        .setLabel(meta.extraLabel)
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(input1),
        new ActionRowBuilder().addComponents(input2)
      );

      await interaction.showModal(modal);
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    const cfg = getJailConfig(interaction.guild.id);

    if (interaction.customId === "snaifer_modal_exemption") {
      const reasonText =
        interaction.fields.getTextInputValue("exemption_reason").trim() ||
        "طلب إعفاء";

      await submitExemptionRequest(
        interaction.guild,
        interaction.member,
        cfg,
        reasonText,
        (payload) => interaction.reply(payload)
      );
      return true;
    }

    if (interaction.customId === "snaifer_modal_pick_jail_target") {
      const rawTarget = interaction.fields.getTextInputValue("mod_input_1").trim();
      const userId = parseId(rawTarget);
      const member = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!member) {
        await interaction.reply({
          content: "❌ لم يتم العثور على العضو في السيرفر.",
          ephemeral: true,
        });
        return true;
      }

      if (isProtectedTarget(member, interaction.guild)) {
        await interaction.reply({
          content: "❌ لا يمكن سجن الأونر.",
          ephemeral: true,
        });
        return true;
      }

      if (!cfg.jailReasons.length) {
        await applyJailToMember(
          interaction.guild,
          member,
          cfg,
          "مخالفة القوانين",
          interaction.user.id
        );
        await interaction.reply({
          content: `🔒 تم سجن ${member} في صيدنايا | السبب: **مخالفة القوانين**`,
        });
        return true;
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`snaifer_jail_reason_select:${member.id}`)
        .setPlaceholder("اختر سبب السجن من خياراتك")
        .addOptions(
          cfg.jailReasons.slice(0, 25).map((reason, idx) => ({
            label: reason.slice(0, 100),
            value: reason.slice(0, 100),
            description: `خيار رقم ${idx + 1}`,
          }))
        );

      const row = new ActionRowBuilder().addComponents(menu);
      await interaction.reply({
        content: `اختر سبب سجن ${member} من القائمة:`,
        components: [row],
        ephemeral: true,
      });
      return true;
    }

    if (interaction.customId.startsWith("snaifer_modal_")) {
      const val1 = interaction.fields.getTextInputValue("mod_input_1").trim();
      const val2 =
        interaction.fields.getTextInputValue("mod_input_2")?.trim() || "بدون سبب";

      if (interaction.customId === "snaifer_modal_add_reason") {
        if (val1 && !cfg.jailReasons.includes(val1)) {
          cfg.jailReasons.push(val1);
          saveJailConfig(interaction.guild.id, cfg);
        }
        await interaction.update({
          embeds: [buildModPanelEmbed(interaction.guild)],
          components: buildModPanelComponents(interaction.guild),
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_add_word") {
        if (val1 && !cfg.autoJailWords.includes(val1)) {
          cfg.autoJailWords.push(val1);
          saveJailConfig(interaction.guild.id, cfg);
        }
        await interaction.update({
          embeds: [buildModPanelEmbed(interaction.guild)],
          components: buildModPanelComponents(interaction.guild),
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_set_jail") {
        const roleId = parseId(val1);
        const channelId = val2 && val2 !== "بدون سبب" ? parseId(val2) : null;
        if (roleId && interaction.guild.roles.cache.has(roleId)) cfg.jailRoleId = roleId;
        if (channelId && interaction.guild.channels.cache.has(channelId))
          cfg.jailChannelId = channelId;
        saveJailConfig(interaction.guild.id, cfg);

        await interaction.update({
          embeds: [buildModPanelEmbed(interaction.guild)],
          components: buildModPanelComponents(interaction.guild),
        });
        return true;
      }

      const userId = parseId(val1);
      const member = await interaction.guild.members.fetch(userId).catch(() => null);

      if (interaction.customId === "snaifer_modal_unjail") {
        if (!member) {
          await interaction.reply({
            content: "❌ لم يتم العثور على العضو.",
            ephemeral: true,
          });
          return true;
        }
        await releaseJailFromMember(interaction.guild, member, cfg, val2);
        await interaction.reply({
          content: `🔓 تم فك سجن ${member} واسترجاع رولاتة.`,
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_timeout") {
        if (!member) {
          await interaction.reply({
            content: "❌ لم يتم العثور على العضو.",
            ephemeral: true,
          });
          return true;
        }
        if (isProtectedTarget(member, interaction.guild)) {
          await interaction.reply({
            content: "❌ لا يمكن إعطاء تايم أوت للأونر.",
            ephemeral: true,
          });
          return true;
        }
        const ms = parseDurationMs(val2 === "بدون سبب" ? "10m" : val2);
        await member.timeout(ms, "تايم أوت من لوحة سنيفر");
        await interaction.reply({
          content: `⏳ تم إعطاء ${member} تايم أوت.`,
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_untimeout") {
        if (!member) {
          await interaction.reply({
            content: "❌ لم يتم العثور على العضو.",
            ephemeral: true,
          });
          return true;
        }
        await member.timeout(null, "فك التايم أوت من لوحة سنيفر");
        await interaction.reply({
          content: `⏱️ تم فك التايم أوت عن ${member}.`,
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_warn") {
        if (!member) {
          await interaction.reply({
            content: "❌ لم يتم العثور على العضو.",
            ephemeral: true,
          });
          return true;
        }
        if (isProtectedTarget(member, interaction.guild)) {
          await interaction.reply({
            content: "❌ لا يمكن تحذير الأونر.",
            ephemeral: true,
          });
          return true;
        }
        const count = addUserWarning(
          interaction.guild.id,
          member.id,
          val2,
          interaction.user.id
        );
        await interaction.reply({
          content: `⚠️ تم تحذير ${member} (الإجمالي: **${count}**) | السبب: **${val2}**`,
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_warn_check") {
        const warns = getUserWarnings(interaction.guild.id, userId);
        if (!warns.length) {
          await interaction.reply({
            content: `ℹ️ لا توجد تحذيرات مسجلة للعضو <@${userId}>.`,
            ephemeral: true,
          });
          return true;
        }
        const list = warns.map((w, idx) => `${idx + 1}. **${w.reason}**`).join("\n");
        await interaction.reply({
          content: `⚠️ تحذيرات <@${userId}> (**${warns.length}**):\n${list}`,
          ephemeral: true,
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_kick") {
        if (!member) {
          await interaction.reply({
            content: "❌ لم يتم العثور على العضو.",
            ephemeral: true,
          });
          return true;
        }
        if (isProtectedTarget(member, interaction.guild)) {
          await interaction.reply({
            content: "❌ لا يمكن طرد الأونر.",
            ephemeral: true,
          });
          return true;
        }
        await member.kick(val2);
        await interaction.reply({
          content: `👢 تم طرد ${member} | السبب: **${val2}**`,
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_ban") {
        if (isOwnerUser(userId, interaction.guild)) {
          await interaction.reply({
            content: "❌ لا يمكن حظر الأونر.",
            ephemeral: true,
          });
          return true;
        }
        await interaction.guild.members.ban(userId, { reason: val2 });
        await interaction.reply({
          content: `🔨 تم حظر العضو \`${userId}\` | السبب: **${val2}**`,
        });
        return true;
      }

      if (interaction.customId === "snaifer_modal_unban") {
        await interaction.guild.members.unban(userId, val2);
        await interaction.reply({
          content: `🕊️ تم فك الحظر عن \`${userId}\`.`,
        });
        return true;
      }
    }
  }

  return false;
}

export default {
  data: new SlashCommandBuilder()
    .setName("modpanel")
    .setDescription("لوحة الإشراف وصيدنايا وأوامر الإدارة"),
  name: "modpanel",
  aliases: [
    "اوامر_سجن",
    "سجن_اعداد",
    "اعداد_السجن",
    "إعداد_السجن",
    "انشاء_السجن",
    "إنشاء_السجن",
    "صيدنايا",
    "اعفاء",
    "إعفاء",
    "طلب_اعفاء",
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
  ],
  description: "لوحة الإشراف وصيدنايا وأوامر الإدارة",
  async execute(messageOrInteraction, args = []) {
    const guild = messageOrInteraction.guild;
    if (!guild) return;

    const actor = messageOrInteraction.user || messageOrInteraction.author;
    const member =
      messageOrInteraction.member ||
      (actor ? await guild.members.fetch(actor.id).catch(() => null) : null);

    const content = messageOrInteraction.content
      ? String(messageOrInteraction.content).trim()
      : "";
    const firstWord = content
      ? content.split(/\s+/)[0].replace(/^[\$!]+/, "")
      : "modpanel";
    const cfg = getJailConfig(guild.id);

    const reply = async (payload) => {
      if (typeof messageOrInteraction.reply === "function") {
        return messageOrInteraction.reply(payload).catch(() => {});
      }
    };

    if (["اوامر_سجن", "اشراف", "الاشراف", "modpanel"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية فتح لوحة الإشراف.",
          ephemeral: true,
        });
      }
      return reply({
        embeds: [buildModPanelEmbed(guild)],
        components: buildModPanelComponents(guild),
      });
    }

    if (["انشاء_السجن", "إنشاء_السجن", "صيدنايا"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ManageChannels, guild)) {
        return reply({
          content: "❌ تحتاج صلاحية إدارة الرومات لإنشاء صيدنايا والإعفاء.",
          ephemeral: true,
        });
      }
      const { jailRole, jailChannel, exemptionChannel } =
        await setupSaidnayaAndExemptionRooms(guild, cfg);
      return reply({
        content:
          `✅ تم إنشاء وتجهيز النظام:\n` +
          `• روم صيدنايا: ${jailChannel ? `<#${jailChannel.id}>` : "غير متاح"}\n` +
          `• روم الإعفاء: ${exemptionChannel ? `<#${exemptionChannel.id}>` : "غير متاح"}\n` +
          `• رتبة السجن: ${jailRole ? `<@&${jailRole.id}>` : "غير متاح"}`,
      });
    }

    if (["اعفاء", "إعفاء", "طلب_اعفاء"].includes(firstWord)) {
      if (!member) return;
      const reasonText = args.join(" ").trim() || "طلب إعفاء من السجن";
      return submitExemptionRequest(guild, member, cfg, reasonText, reply);
    }

    if (["سجن_اعداد", "اعداد_السجن", "إعداد_السجن"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.Administrator, guild)) {
        return reply({
          content: "❌ هذا الأمر للأونر والإدارة العليا فقط.",
          ephemeral: true,
        });
      }
      const roleId = parseId(args[0]);
      const jailChId = parseId(args[1]);
      const exChId = parseId(args[2]);
      if (roleId && guild.roles.cache.has(roleId)) cfg.jailRoleId = roleId;
      if (jailChId && guild.channels.cache.has(jailChId)) cfg.jailChannelId = jailChId;
      if (exChId && guild.channels.cache.has(exChId)) cfg.exemptionChannelId = exChId;
      saveJailConfig(guild.id, cfg);
      return reply({
        content:
          `✅ تم تحديث إعدادات السجن:\n` +
          `• الرتبة: ${cfg.jailRoleId ? `<@&${cfg.jailRoleId}>` : "غير محدد"}\n` +
          `• روم صيدنايا: ${cfg.jailChannelId ? `<#${cfg.jailChannelId}>` : "غير محدد"}\n` +
          `• روم الإعفاء: ${cfg.exemptionChannelId ? `<#${cfg.exemptionChannelId}>` : "غير محدد"}`,
      });
    }

    if (["سجن", "السجن"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية السجن.", ephemeral: true });
      }
      const targetId = parseId(args[0]);
      const reason = resolveJailReason(args.slice(1).join(" "), cfg.jailReasons);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) {
        return reply({
          content:
            "❌ حدد عضو صحيح: `سجن @عضو [رقم السبب أو نصه]`",
        });
      }
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن سجن الأونر." });
      }

      await applyJailToMember(guild, target, cfg, reason, actor?.id || null);
      return reply({
        content: `🔒 تم سجن ${target} في صيدنايا | السبب: **${reason}**`,
      });
    }

    if (["فك_سجن", "افراج"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية فك السجن.",
          ephemeral: true,
        });
      }
      const targetId = parseId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `فك_سجن @عضو`" });

      await releaseJailFromMember(guild, target, cfg, "فك السجن");
      return reply({
        content: `🔓 تم الإفراج عن ${target} واسترجاع رولاتة.`,
      });
    }

    if (["كتم", "اسكت", "انبح"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية الكتم.", ephemeral: true });
      }
      const targetId = parseId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `كتم @عضو [المدة]`" });
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن كتم الأونر." });
      }
      const ms = parseDurationMs(args[1] || "10m");
      await target.timeout(ms, "كتم").catch(() => {});
      return reply({ content: `🔇 تم كتم ${target}.` });
    }

    if (["تكلم"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية فك الكتم.",
          ephemeral: true,
        });
      }
      const targetId = parseId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `تكلم @عضو`" });
      await target.timeout(null, "فك الكتم").catch(() => {});
      return reply({ content: `🔊 تم فك الكتم عن ${target}.` });
    }

    if (["طرد", "بنعالي"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.KickMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية الطرد.", ephemeral: true });
      }
      const targetId = parseId(args[0]);
      const reason = args.slice(1).join(" ") || "بدون سبب";
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `طرد @عضو [السبب]`" });
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن طرد الأونر." });
      }
      await target.kick(reason).catch(() => {});
      return reply({ content: `👢 تم طرد ${target} | السبب: **${reason}**` });
    }

    if (["باند", "تف"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.BanMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية الباند.", ephemeral: true });
      }
      const targetId = parseId(args[0]);
      const reason = args.slice(1).join(" ") || "بدون سبب";
      if (!targetId) {
        return reply({ content: "❌ حدد عضو أو آيدي: `باند @عضو [السبب]`" });
      }
      if (isOwnerUser(targetId, guild)) {
        return reply({ content: "❌ لا يمكن حظر الأونر." });
      }
      await guild.members.ban(targetId, { reason }).catch(() => {});
      return reply({
        content: `🔨 تم حظر \`${targetId}\` | السبب: **${reason}**`,
      });
    }

    if (["لاباند"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.BanMembers, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية فك الباند.",
          ephemeral: true,
        });
      }
      const targetId = parseId(args[0]);
      if (!targetId) return reply({ content: "❌ حدد آيدي العضو: `لاباند ID`" });
      await guild.members.unban(targetId, "فك الباند").catch(() => {});
      return reply({ content: `✅ تم فك الحظر عن \`${targetId}\`.` });
    }

    if (["تايم"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية التايم أوت.",
          ephemeral: true,
        });
      }
      const targetId = parseId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `تايم @عضو [10m]`" });
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن إعطاء تايم أوت للأونر." });
      }
      const ms = parseDurationMs(args[1] || "10m");
      await target.timeout(ms, "تايم أوت").catch(() => {});
      return reply({ content: `⏳ تم إعطاء ${target} تايم أوت.` });
    }

    if (["لاتايم"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية إزالة التايم أوت.",
          ephemeral: true,
        });
      }
      const targetId = parseId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `لاتايم @عضو`" });
      await target.timeout(null, "إزالة التايم أوت").catch(() => {});
      return reply({ content: `✅ تم إزالة التايم أوت عن ${target}.` });
    }

    if (["تحذير"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية التحذير.",
          ephemeral: true,
        });
      }
      const targetId = parseId(args[0]);
      const reason = args.slice(1).join(" ") || "مخالفة القوانين";
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) {
        return reply({ content: "❌ حدد عضو صحيح: `تحذير @عضو [السبب]`" });
      }
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن تحذير الأونر." });
      }
      const count = addUserWarning(guild.id, target.id, reason, actor?.id || null);
      return reply({
        content: `⚠️ تم تحذير ${target} (الإجمالي: **${count}**) | السبب: **${reason}**`,
      });
    }

    if (["تحذيرات"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية عرض التحذيرات.",
          ephemeral: true,
        });
      }
      const targetId = parseId(args[0] || actor?.id);
      const warns = getUserWarnings(guild.id, targetId);
      if (!warns.length) {
        return reply({
          content: `ℹ️ لا توجد تحذيرات مسجلة للعضو <@${targetId}>.`,
        });
      }
      const list = warns
        .map((w, idx) => `${idx + 1}. **${w.reason}**`)
        .join("\n");
      return reply({
        content: `⚠️ تحذيرات <@${targetId}> (**${warns.length}**):\n${list}`,
      });
    }

    if (["مسح"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ManageMessages, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية مسح الرسائل.",
          ephemeral: true,
        });
      }
      const count = Math.min(Math.max(Number(args[0]) || 10, 1), 100);
      const deleted = await messageOrInteraction.channel
        ?.bulkDelete(count, true)
        .catch(() => null);
      return reply({ content: `🧹 تم مسح **${deleted?.size ?? 0}** رسالة.` });
    }

    if (["قفل"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ManageChannels, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية قفل الروم.",
          ephemeral: true,
        });
      }
      await messageOrInteraction.channel?.permissionOverwrites
        .edit(guild.roles.everyone.id, { SendMessages: false })
        .catch(() => {});
      return reply({ content: "🔒 تم قفل الروم." });
    }

    if (["فتح"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ManageChannels, guild)) {
        return reply({
          content: "❌ ما عندك صلاحية فتح الروم.",
          ephemeral: true,
        });
      }
      await messageOrInteraction.channel?.permissionOverwrites
        .edit(guild.roles.everyone.id, { SendMessages: true })
        .catch(() => {});
      return reply({ content: "🔓 تم فتح الروم." });
    }

    return reply({
      embeds: [buildModPanelEmbed(guild)],
      components: buildModPanelComponents(guild),
    });
  },
};
