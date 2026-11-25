import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const ticketConfigs = new Map();
// تخزين بيانات كل تذكرة حسب channelId: { ownerId, claimedBy, locked, reason }
const activeTickets = new Map();

const DEFAULT_TICKET_CONFIG = {
  panelTitle: "🎫 نظام التذاكر — سنيفر",
  panelDescription: "اضغط على الزر بالأسفل لفتح تذكرة جديدة والتواصل مع الإدارة.",
  panelColor: "#2B2D31",
  categoryId: null,
  supportRoleId: null,
  autoTicketEnabled: true,
  autoTicketWords: [],
};

export function getTicketConfig(guildId) {
  if (!ticketConfigs.has(guildId)) {
    ticketConfigs.set(guildId, {
      ...DEFAULT_TICKET_CONFIG,
      autoTicketWords: [],
    });
  }
  return ticketConfigs.get(guildId);
}

function normalizeForMatch(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .trim();
}

function isStaffMember(member) {
  if (!member) return false;
  return (
    member.permissions?.has(PermissionsBitField.Flags.ManageChannels) ||
    member.permissions?.has(PermissionsBitField.Flags.ManageMessages) ||
    member.permissions?.has(PermissionsBitField.Flags.Administrator)
  );
}

function buildPublicTicketPanel(config) {
  const embed = new EmbedBuilder()
    .setColor(config.panelColor || "#2B2D31")
    .setTitle(config.panelTitle || "🎫 نظام التذاكر — سنيفر")
    .setDescription(
      config.panelDescription || "اضغط على الزر بالأسفل لفتح تذكرة جديدة والتواصل مع الإدارة."
    )
    .setFooter({ text: "سنيفر سيستم • التذاكر" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_open_ticket")
      .setLabel("فتح تذكرة")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

export function buildTicketControlPanel(guild) {
  const config = getTicketConfig(guild.id);
  const categoryText = config.categoryId ? `<#${config.categoryId}>` : "غير محدد (يُنشأ بدون كاتقوري)";
  const supportRoleText = config.supportRoleId ? `<@&${config.supportRoleId}>` : "غير محدد";
  const wordsText =
    config.autoTicketWords.length > 0
      ? config.autoTicketWords.map((w, i) => `${i + 1}. \`${w}\``).join(" ، ")
      : "لا توجد كلمات تذكرة تلقائي مضافة";

  const embed = new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle("🛠️ لوحة التحكم الكاملة بالتذاكر — سنيفر")
    .setDescription(
      "عدّل كل إعدادات التذاكر من هنا مباشرة بدون لمس الكود، أو أرسل لوحة فتح التذاكر لأي روم."
    )
    .addFields(
      { name: "📌 عنوان اللوحة العامة", value: config.panelTitle, inline: true },
      { name: "🎨 لون اللوحة", value: config.panelColor, inline: true },
      { name: "⚡ التذكرة التلقائية", value: config.autoTicketEnabled ? "مفعّلة ✅" : "معطّلة ⛔", inline: true },
      { name: "📁 كاتقوري التذاكر", value: categoryText, inline: true },
      { name: "🛡️ رتبة الدعم/الإدارة", value: supportRoleText, inline: true },
      { name: "📝 وصف اللوحة العامة", value: config.panelDescription, inline: false },
      { name: "🚨 كلمات التذكرة التلقائي", value: wordsText, inline: false }
    )
    .setFooter({ text: "سنيفر سيستم • لوحة إدارة التذاكر" });

  const rowButtons1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_dash_edit_panel")
      .setLabel("تعديل نص/لون اللوحة")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_dash_send_panel")
      .setLabel("إرسال لوحة التذاكر هنا")
      .setEmoji("📤")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket_dash_open_now")
      .setLabel("فتح تذكرة لي الآن")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Secondary)
  );

  const rowButtons2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_add_auto_word")
      .setLabel("إضافة كلمة تلقائي")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket_toggle_auto_word")
      .setLabel(config.autoTicketEnabled ? "إيقاف التلقائي" : "تفعيل التلقائي")
      .setStyle(config.autoTicketEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket_clear_auto_words")
      .setLabel("مسح الكلمات")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket_dash_reset")
      .setLabel("إعادة ضبط الكل")
      .setStyle(ButtonStyle.Danger)
  );

  const categoryMenu = new ChannelSelectMenuBuilder()
    .setCustomId("ticket_dash_select_category")
    .setPlaceholder("📁 اختر كاتقوري (Category) لفتح التذاكر داخله...")
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(0)
    .setMaxValues(1);

  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId("ticket_dash_select_support_role")
    .setPlaceholder("🛡️ اختر رتبة الإدارة/الدعم المسموح لها بدخول التذاكر...")
    .setMinValues(0)
    .setMaxValues(1);

  return {
    embeds: [embed],
    components: [
      rowButtons1,
      rowButtons2,
      new ActionRowBuilder().addComponents(categoryMenu),
      new ActionRowBuilder().addComponents(roleMenu),
    ],
  };
}

function buildTicketControlComponents(ticketState) {
  const isClaimed = Boolean(ticketState?.claimedBy);
  const isLocked = Boolean(ticketState?.locked);

  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_claim_ticket")
      .setLabel(isClaimed ? "تم الاستلام" : "استلام")
      .setEmoji("🙋‍♂️")
      .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(isClaimed),
    new ButtonBuilder()
      .setCustomId("snaifer_lock_ticket")
      .setLabel(isLocked ? "فتح بعد الإقفال" : "إقفال")
      .setEmoji(isLocked ? "🔓" : "🔒")
      .setStyle(isLocked ? ButtonStyle.Primary : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("snaifer_delete_ticket")
      .setLabel("حذف التذكرة")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Secondary)
  );

  const optionsMenu = new StringSelectMenuBuilder()
    .setCustomId("snaifer_ticket_options_menu")
    .setPlaceholder("⚙️ خيارات التذكرة (إضافة / إزالة عضو / تنبيه)...")
    .addOptions([
      {
        label: "إضافة عضو للتذكرة",
        value: "add_member",
        description: "إدخال آيدي أو منشن عضو لإضافته للروم",
        emoji: "➕",
      },
      {
        label: "إزالة عضو من التذكرة",
        value: "remove_member",
        description: "إخراج عضو مضاف من التذكرة",
        emoji: "➖",
      },
      {
        label: "تنبيه صاحب التذكرة",
        value: "ping_owner",
        description: "إرسال تنبيه لصاحب التذكرة بالرد",
        emoji: "🔔",
      },
      {
        label: "فك الاستلام (إتاحة لغيرك)",
        value: "unclaim_ticket",
        description: "إلغاء استلام التذكرة ليتمكن مشرف آخر من استلامها",
        emoji: "🔄",
      },
    ]);

  return [buttonsRow, new ActionRowBuilder().addComponents(optionsMenu)];
}

function buildTicketEmbed(user, reasonText, ticketState) {
  const statusText = ticketState?.locked
    ? "مقفلة 🔒"
    : ticketState?.claimedBy
      ? `مستلمة بواسطة <@${ticketState.claimedBy}> ✅`
      : "بانتظار الاستلام ⏳";

  return new EmbedBuilder()
    .setColor(ticketState?.locked ? "#EF4444" : ticketState?.claimedBy ? "#3B82F6" : "#22C55E")
    .setTitle("🎫 تذكرة دعم — سنيفر")
    .setDescription(
      `أهلاً ${user}، تم فتح التذكرة بنجاح.\nاكتب تفاصيل طلبك أو مشكلتك هنا وسيتم خدمتك.\n\n**الحالة:** ${statusText}\n**السبب / الكلمة:** ${reasonText}`
    )
    .setTimestamp();
}

async function openTicketChannelForUser(guild, user, reasonText = "فتح تذكرة جديدة") {
  const config = getTicketConfig(guild.id);
  const cleanUsername =
    user.username
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "user";

  const suffix =
    user.discriminator && user.discriminator !== "0"
      ? user.discriminator
      : user.id.slice(-4);

  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name.startsWith(`تذكرة-${cleanUsername}`)
  );

  if (existing) {
    return { channel: existing, created: false };
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (config.supportRoleId && guild.roles.cache.has(config.supportRoleId)) {
    overwrites.push({
      id: config.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: `تذكرة-${cleanUsername}-${suffix}`,
    type: ChannelType.GuildText,
    parent: config.categoryId || undefined,
    permissionOverwrites: overwrites,
    reason: reasonText,
  });

  const state = {
    ownerId: user.id,
    reason: reasonText,
    claimedBy: null,
    locked: false,
  };
  activeTickets.set(channel.id, state);

  await channel.send({
    content: `${user}${config.supportRoleId ? ` <@&${config.supportRoleId}>` : ""}`,
    embeds: [buildTicketEmbed(user, reasonText, state)],
    components: buildTicketControlComponents(state),
  });

  return { channel, created: true };
}

export async function handleAutoTicketMessage(message) {
  if (!message?.guild || message.author?.bot) return false;

  const config = getTicketConfig(message.guild.id);
  if (!config.autoTicketEnabled || !config.autoTicketWords?.length) return false;

  const normalizedContent = normalizeForMatch(message.content || "");
  if (!normalizedContent) return false;

  const matchedWord = config.autoTicketWords.find((word) => {
    const cleanWord = normalizeForMatch(word);
    return cleanWord && normalizedContent.includes(cleanWord);
  });

  if (!matchedWord) return false;

  const { channel } = await openTicketChannelForUser(
    message.guild,
    message.author,
    `تذكرة تلقائية بسبب الكلمة: (${matchedWord})`
  );

  await message
    .reply({
      content: `🎫 تم فتح تذكرة تلقائية لك: ${channel}`,
      allowedMentions: { repliedUser: true },
    })
    .catch(() => {});

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName("create_ticket")
    .setDescription("لوحة التحكم الكاملة بالتذاكر والتذكرة التلقائية"),
  name: "create_ticket",
  aliases: ["انشاء_تذكره", "انشاء_تذكرة", "تذكره", "تذكرة", "تذاكر", "لوحة_التذاكر"],
  description: "لوحة التحكم الكاملة بالتذاكر والتذكرة التلقائية",
  async execute(messageOrInteraction, args = [], client) {
    const guild = messageOrInteraction.guild;
    if (!guild) return;

    const existingTicketCmd =
      client?.commands?.get("ticket") || client?.commands?.get("tickets");
    if (existingTicketCmd && typeof existingTicketCmd.execute === "function") {
      return existingTicketCmd.execute(messageOrInteraction, args, client);
    }

    return messageOrInteraction.reply(buildTicketControlPanel(guild));
  },
};

export async function handleSnaiferTicketButton(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;

  const config = getTicketConfig(guild.id);
  const channel = interaction.channel;
  const ticketState = channel ? activeTickets.get(channel.id) : null;

  try {
    if (interaction.isButton()) {
      if (interaction.customId === "snaifer_open_ticket") {
        await interaction.deferReply({ ephemeral: true });
        const { channel: ticketCh, created } = await openTicketChannelForUser(
          guild,
          interaction.user,
          "فتح تذكرة عبر الزر"
        );
        await interaction.editReply({
          content: created
            ? `✅ تم إنشاء تذكرتك: ${ticketCh}`
            : `⚠️ عندك تذكرة مفتوحة بالفعل: ${ticketCh}`,
        });
        return true;
      }

      if (interaction.customId === "ticket_dash_open_now") {
        await interaction.deferReply({ ephemeral: true });
        const { channel: ticketCh, created } = await openTicketChannelForUser(
          guild,
          interaction.user,
          "فتح تذكرة من لوحة التحكم"
        );
        await interaction.editReply({
          content: created
            ? `✅ تم إنشاء تذكرتك: ${ticketCh}`
            : `⚠️ عندك تذكرة مفتوحة بالفعل: ${ticketCh}`,
        });
        return true;
      }

      if (interaction.customId === "ticket_dash_send_panel") {
        await channel?.send(buildPublicTicketPanel(config)).catch(() => {});
        await interaction.reply({
          content: "✅ تم إرسال لوحة فتح التذاكر في هذا الروم.",
          ephemeral: true,
        });
        return true;
      }

      if (interaction.customId === "ticket_dash_edit_panel") {
        const modal = new ModalBuilder()
          .setCustomId("ticket_modal_edit_panel")
          .setTitle("تعديل لوحة التذاكر العامة");

        const titleInput = new TextInputBuilder()
          .setCustomId("ticket_panel_title_input")
          .setLabel("عنوان اللوحة")
          .setValue(config.panelTitle)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100);

        const colorInput = new TextInputBuilder()
          .setCustomId("ticket_panel_color_input")
          .setLabel("لون الإيمبد (مثال: #2B2D31 أو #22C55E)")
          .setValue(config.panelColor)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20);

        const descInput = new TextInputBuilder()
          .setCustomId("ticket_panel_desc_input")
          .setLabel("وصف اللوحة")
          .setValue(config.panelDescription)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500);

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(colorInput),
          new ActionRowBuilder().addComponents(descInput)
        );
        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === "ticket_dash_reset") {
        Object.assign(config, {
          ...DEFAULT_TICKET_CONFIG,
          autoTicketWords: [],
        });
        await interaction.update(buildTicketControlPanel(guild));
        return true;
      }

      if (interaction.customId === "ticket_add_auto_word") {
        const modal = new ModalBuilder()
          .setCustomId("ticket_modal_add_auto_word")
          .setTitle("إضافة كلمة تذكرة تلقائي");

        const input = new TextInputBuilder()
          .setCustomId("ticket_auto_word_input")
          .setLabel("اكتب الكلمة أو العبارة")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === "ticket_toggle_auto_word") {
        config.autoTicketEnabled = !config.autoTicketEnabled;
        await interaction.update(buildTicketControlPanel(guild));
        return true;
      }

      if (interaction.customId === "ticket_clear_auto_words") {
        config.autoTicketWords = [];
        await interaction.update(buildTicketControlPanel(guild));
        return true;
      }

      if (interaction.customId === "snaifer_claim_ticket") {
        if (!isStaffMember(interaction.member)) {
          await interaction.reply({
            content: "❌ استلام التذكرة مخصص للإدارة والمشرفين فقط.",
            ephemeral: true,
          });
          return true;
        }

        const state = ticketState || {
          ownerId: null,
          reason: "تذكرة",
          claimedBy: null,
          locked: false,
        };
        state.claimedBy = interaction.user.id;
        if (channel) activeTickets.set(channel.id, state);

        await channel?.permissionOverwrites
          .edit(interaction.user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          })
          .catch(() => {});

        const ownerUser = state.ownerId
          ? await guild.client.users.fetch(state.ownerId).catch(() => interaction.user)
          : interaction.user;

        await interaction.update({
          embeds: [buildTicketEmbed(ownerUser, state.reason, state)],
          components: buildTicketControlComponents(state),
        });

        await channel
          ?.send({
            content: `✅ تم استلام التذكرة بواسطة ${interaction.user}.`,
          })
          .catch(() => {});
        return true;
      }

      if (interaction.customId === "snaifer_lock_ticket") {
        if (!isStaffMember(interaction.member)) {
          await interaction.reply({
            content: "❌ إقفال وفتح التذكرة مخصص للإدارة والمشرفين فقط.",
            ephemeral: true,
          });
          return true;
        }

        const state = ticketState || {
          ownerId: null,
          reason: "تذكرة",
          claimedBy: null,
          locked: false,
        };
        state.locked = !state.locked;
        if (channel) activeTickets.set(channel.id, state);

        if (state.ownerId && channel) {
          await channel.permissionOverwrites
            .edit(state.ownerId, {
              ViewChannel: true,
              SendMessages: !state.locked,
              ReadMessageHistory: true,
            })
            .catch(() => {});
        }

        const ownerUser = state.ownerId
          ? await guild.client.users.fetch(state.ownerId).catch(() => interaction.user)
          : interaction.user;

        await interaction.update({
          embeds: [buildTicketEmbed(ownerUser, state.reason, state)],
          components: buildTicketControlComponents(state),
        });

        await channel
          ?.send({
            content: state.locked
              ? `🔒 تم إقفال التذكرة بواسطة ${interaction.user}.`
              : `🔓 تم إعادة فتح التذكرة بواسطة ${interaction.user}.`,
          })
          .catch(() => {});
        return true;
      }

      if (interaction.customId === "snaifer_delete_ticket" || interaction.customId === "snaifer_close_ticket") {
        const isOwner =
          (ticketState?.ownerId && ticketState.ownerId === interaction.user.id) ||
          interaction.channel?.name?.includes(interaction.user.id.slice(-4));
        const isStaff = isStaffMember(interaction.member);

        if (!isOwner && !isStaff) {
          await interaction.reply({
            content: "❌ ما عندك صلاحية حذف هذه التذكرة.",
            ephemeral: true,
          });
          return true;
        }

        await interaction.reply({ content: "🗑️ سيتم حذف التذكرة خلال 3 ثوانٍ..." });
        if (channel) activeTickets.delete(channel.id);
        setTimeout(() => {
          interaction.channel?.delete("حذف التذكرة").catch(() => {});
        }, 3000);
        return true;
      }
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "ticket_dash_select_category") {
      config.categoryId = interaction.values[0] || null;
      await interaction.update(buildTicketControlPanel(guild));
      return true;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === "ticket_dash_select_support_role") {
      config.supportRoleId = interaction.values[0] || null;
      await interaction.update(buildTicketControlPanel(guild));
      return true;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "snaifer_ticket_options_menu") {
      if (!isStaffMember(interaction.member)) {
        await interaction.reply({
          content: "❌ خيارات التذكرة مخصصة للإدارة والمشرفين فقط.",
          ephemeral: true,
        });
        return true;
      }

      const choice = interaction.values[0];

      if (choice === "add_member" || choice === "remove_member") {
        const isAdd = choice === "add_member";
        const modal = new ModalBuilder()
          .setCustomId(isAdd ? "ticket_modal_add_member" : "ticket_modal_remove_member")
          .setTitle(isAdd ? "إضافة عضو للتذكرة" : "إزالة عضو من التذكرة");

        const input = new TextInputBuilder()
          .setCustomId("ticket_target_member_input")
          .setLabel("اكتب آيدي العضو أو منشنه")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return true;
      }

      if (choice === "ping_owner") {
        const ownerMention = ticketState?.ownerId ? `<@${ticketState.ownerId}>` : "";
        await interaction.reply({
          content: `🔔 تنبيه ${ownerMention || "لصاحب التذكرة"} من ${interaction.user} بخصوص التذكرة.`,
        });
        return true;
      }

      if (choice === "unclaim_ticket") {
        const state = ticketState || {
          ownerId: null,
          reason: "تذكرة",
          claimedBy: null,
          locked: false,
        };
        state.claimedBy = null;
        if (channel) activeTickets.set(channel.id, state);

        const ownerUser = state.ownerId
          ? await guild.client.users.fetch(state.ownerId).catch(() => interaction.user)
          : interaction.user;

        await interaction.update({
          embeds: [buildTicketEmbed(ownerUser, state.reason, state)],
          components: buildTicketControlComponents(state),
        });

        await channel
          ?.send({
            content: `🔄 تم إلغاء استلام التذكرة بواسطة ${interaction.user}.`,
          })
          .catch(() => {});
        return true;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "ticket_modal_edit_panel") {
        const title = interaction.fields.getTextInputValue("ticket_panel_title_input").trim();
        const rawColor = interaction.fields.getTextInputValue("ticket_panel_color_input").trim();
        const desc = interaction.fields.getTextInputValue("ticket_panel_desc_input").trim();

        if (title) config.panelTitle = title;
        if (/^#[0-9A-Fa-f]{6}$/.test(rawColor)) {
          config.panelColor = rawColor;
        }
        if (desc) config.panelDescription = desc;

        await interaction.update(buildTicketControlPanel(guild));
        return true;
      }

      if (interaction.customId === "ticket_modal_add_auto_word") {
        const word = interaction.fields.getTextInputValue("ticket_auto_word_input").trim();
        if (word && !config.autoTicketWords.includes(word)) {
          config.autoTicketWords.push(word);
        }
        await interaction.update(buildTicketControlPanel(guild));
        return true;
      }

      if (
        interaction.customId === "ticket_modal_add_member" ||
        interaction.customId === "ticket_modal_remove_member"
      ) {
        const rawInput = interaction.fields.getTextInputValue("ticket_target_member_input").trim();
        const userId = rawInput.replace(/[<@!>]/g, "").trim();
        const targetMember = await guild.members.fetch(userId).catch(() => null);

        if (!targetMember) {
          await interaction.reply({
            content: "❌ لم يتم العثور على هذا العضو في السيرفر، تأكد من الآيدي أو المنشن.",
            ephemeral: true,
          });
          return true;
        }

        const isAdd = interaction.customId === "ticket_modal_add_member";
        if (isAdd) {
          await channel?.permissionOverwrites
            .edit(targetMember.id, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              AttachFiles: true,
            })
            .catch(() => {});
          await interaction.reply({
            content: `➕ تم إضافة ${targetMember} إلى التذكرة بواسطة ${interaction.user}.`,
          });
        } else {
          await channel?.permissionOverwrites.delete(targetMember.id).catch(() => {});
          await interaction.reply({
            content: `➖ تم إزالة ${targetMember} من التذكرة بواسطة ${interaction.user}.`,
          });
        }
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
