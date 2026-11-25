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
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const ticketConfigs = new Map();

const DEFAULT_TICKET_CONFIG = {
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

async function openTicketChannelForUser(guild, user, reasonText = "فتح تذكرة جديدة") {
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

  const channel = await guild.channels.create({
    name: `تذكرة-${cleanUsername}-${suffix}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
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
    ],
    reason: reasonText,
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_close_ticket")
      .setLabel("إغلاق التذكرة")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  const ticketEmbed = new EmbedBuilder()
    .setColor("#22C55E")
    .setTitle("🎫 تم فتح التذكرة")
    .setDescription(
      `أهلاً ${user}، تم فتح التذكرة بنجاح.\n**السبب / الكلمة:** ${reasonText}\nلإغلاق التذكرة اضغط على الزر بالأسفل.`
    )
    .setTimestamp();

  await channel.send({
    content: `${user}`,
    embeds: [ticketEmbed],
    components: [closeRow],
  });

  return { channel, created: true };
}

export function buildTicketSetupPanel(guildId) {
  const config = getTicketConfig(guildId);
  const wordsText =
    config.autoTicketWords.length > 0
      ? config.autoTicketWords.map((w, i) => `${i + 1}. \`${w}\``).join(" ، ")
      : "لا توجد كلمات تذكرة تلقائي مضافة — اضغط (إضافة كلمة تذكرة تلقائي)";

  const embed = new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle("🎫 نظام التذاكر والتذكرة التلقائية — سنيفر")
    .setDescription(
      `اضغط على **فتح تذكرة** لفتح تذكرة مباشرة، أو أضف كلمات إذا كتبها العضو يفتح له البوت تذكرة تلقائياً.\nحالة التذكرة التلقائية: **${
        config.autoTicketEnabled ? "مفعّلة ✅" : "معطّلة ⛔"
      }**`
    )
    .addFields({
      name: "🚨 كلمات التذكرة التلقائي",
      value: wordsText,
      inline: false,
    })
    .setFooter({ text: "سنيفر سيستم • التذاكر" });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_open_ticket")
      .setLabel("فتح تذكرة")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_add_auto_word")
      .setLabel("إضافة كلمة تذكرة تلقائي")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket_toggle_auto_word")
      .setLabel(config.autoTicketEnabled ? "إيقاف التلقائي" : "تفعيل التلقائي")
      .setStyle(config.autoTicketEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket_clear_auto_words")
      .setLabel("مسح الكلمات")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1] };
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
    .setDescription("إنشاء تذكرة جديدة أو إعداد التذكرة التلقائية"),
  name: "create_ticket",
  aliases: ["انشاء_تذكره", "انشاء_تذكرة", "تذكره", "تذكرة", "تذاكر"],
  description: "إنشاء تذكرة جديدة أو إعداد التذكرة التلقائية",
  async execute(messageOrInteraction, args = [], client) {
    const guild = messageOrInteraction.guild;
    if (!guild) return;

    const existingTicketCmd =
      client?.commands?.get("ticket") || client?.commands?.get("tickets");
    if (existingTicketCmd && typeof existingTicketCmd.execute === "function") {
      return existingTicketCmd.execute(messageOrInteraction, args, client);
    }

    return messageOrInteraction.reply(buildTicketSetupPanel(guild.id));
  },
};

export async function handleSnaiferTicketButton(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;

  const config = getTicketConfig(guild.id);

  try {
    if (interaction.isButton()) {
      if (interaction.customId === "snaifer_open_ticket") {
        await interaction.deferReply({ ephemeral: true });
        const { channel, created } = await openTicketChannelForUser(
          guild,
          interaction.user,
          "فتح تذكرة عبر الزر"
        );
        await interaction.editReply({
          content: created
            ? `✅ تم إنشاء تذكرتك: ${channel}`
            : `⚠️ عندك تذكرة مفتوحة بالفعل: ${channel}`,
        });
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
        await interaction.update(buildTicketSetupPanel(guild.id));
        return true;
      }

      if (interaction.customId === "ticket_clear_auto_words") {
        config.autoTicketWords = [];
        await interaction.update(buildTicketSetupPanel(guild.id));
        return true;
      }

      if (interaction.customId === "snaifer_close_ticket") {
        const member = interaction.member;
        const isOwner = interaction.channel?.name?.includes(interaction.user.id.slice(-4));
        const isStaff =
          member?.permissions?.has(PermissionsBitField.Flags.ManageChannels) ||
          member?.permissions?.has(PermissionsBitField.Flags.Administrator);

        if (!isOwner && !isStaff) {
          await interaction.reply({
            content: "❌ ما عندك صلاحية إغلاق هذه التذكرة.",
            ephemeral: true,
          });
          return true;
        }

        await interaction.reply({ content: "🔒 سيتم إغلاق وحذف التذكرة خلال 3 ثوانٍ..." });
        setTimeout(() => {
          interaction.channel?.delete("إغلاق التذكرة").catch(() => {});
        }, 3000);
        return true;
      }
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId === "ticket_modal_add_auto_word"
    ) {
      const word = interaction.fields.getTextInputValue("ticket_auto_word_input").trim();
      if (word && !config.autoTicketWords.includes(word)) {
        config.autoTicketWords.push(word);
      }
      await interaction.update(buildTicketSetupPanel(guild.id));
      return true;
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
