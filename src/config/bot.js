import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
} from "discord.js";
import { botConfig, getColor, isFeatureEnabled } from "./config.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const prefix = botConfig.commands?.prefix || "!";

const slashCommands = [
  new SlashCommandBuilder()
    .setName("اظهار")
    .setDescription("عرض جميع أوامر البوت مقسمة حسب الأقسام"),

  new SlashCommandBuilder()
    .setName("سستم")
    .setDescription("عرض لوحة حالة ومعلومات السيرفر"),

  new SlashCommandBuilder()
    .setName("تكت")
    .setDescription("إرسال لوحة فتح التذاكر في الروم الحالي"),

  new SlashCommandBuilder()
    .setName("ترحيب")
    .setDescription("تعيين روم الترحيب أو إرسال رسالة ترحيب تجريبية")
    .addChannelOption((opt) =>
      opt
        .setName("الروم")
        .setDescription("اختر روم الترحيب")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("طرد")
    .setDescription("طرد عضو من السيرفر")
    .addUserOption((opt) =>
      opt.setName("العضو").setDescription("العضو المراد طرده").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("السبب").setDescription("سبب الطرد").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("باند")
    .setDescription("حظر عضو من السيرفر")
    .addUserOption((opt) =>
      opt.setName("العضو").setDescription("العضو المراد حظره").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("السبب").setDescription("سبب الحظر").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ميوت")
    .setDescription("إعطاء عضو ميوت مؤقت")
    .addUserOption((opt) =>
      opt.setName("العضو").setDescription("العضو").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("الدقائق")
        .setDescription("مدة الميوت بالدقائق")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("السبب").setDescription("سبب الميوت").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("مسح")
    .setDescription("مسح عدد من الرسائل من الروم الحالي")
    .addIntegerOption((opt) =>
      opt
        .setName("العدد")
        .setDescription("من 1 إلى 100 رسالة")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("سوالف")
    .setDescription("سؤال سوالف عشوائي لتنشيط الشات"),

  new SlashCommandBuilder()
    .setName("كت")
    .setDescription("فقرة كت تويت أو قرار سريع"),
].map((cmd) => cmd.toJSON());

const SAWALEF_QUESTIONS = [
  "لو تقدر ترجع بالزمن ليوم واحد في حياتك، وش تختار؟",
  "أكثر أكلة مستحيل تمل منها لو أكلتها كل أسبوع؟",
  "وش أكثر لعبة أو فيلم يشدك هالفترة؟",
  "لو معك ميزانية مفتوحة لمشروع أو فكرة، وش تسوي؟",
  "أفضل مكان تحب تقضي فيه وقتك: البيت، طلعة مع الشباب، ولا مكان هادي؟",
];

const KAT_PROMPTS = [
  "كت: تشتري راحة بالك ولا مبلغ كبير بشروط صعبة؟",
  "كت: تسافر لحالك ولا مع شلة تحبها؟",
  "كت: تشتغل في مشروع خاص ولا وظيفة ثابتة براتب ممتاز؟",
  "كت: تقضي يوم كامل بدون جوال ولا يوم كامل بدون نت؟",
];

function hasStaffPerm(member, configRoles = []) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return configRoles.some((roleId) => member.roles.cache.has(roleId));
}

async function sendLog(guild, title, description, colorHex = botConfig.embeds.colors.info) {
  if (!isFeatureEnabled("logging")) return;
  const logChannelId = botConfig.tickets?.logChannel || process.env.MOD_LOG_CHANNEL_ID;
  if (!logChannelId) return;
  const channel = guild.channels.cache.get(logChannelId);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(getColor(colorHex))
    .setFooter({ text: botConfig.embeds.footer?.text || "Server System" })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

function buildCommandsHelpEmbed(guildName) {
  const p = prefix;
  return new EmbedBuilder()
    .setTitle(`قائمة أوامر البوت • ${guildName}`)
    .setDescription(`تقدر تستخدم الأوامر بالبادئة \`${p}\` أو عبر أوامر السلاش \`/\``)
    .setColor(getColor(botConfig.embeds.colors.primary))
    .addFields(
      {
        name: "🎫 التذاكر (Tickets)",
        value: [
          `• \`${p}تكت\` أو \`/تكت\` — إرسال لوحة فتح التذاكر`,
          `• أزرار داخل التذكرة: **استلام التذكرة** / **إغلاق التذكرة**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "👋 الترحيب (Welcome)",
        value: [
          `• ترحيب تلقائي عند دخول الأعضاء في روم الترحيب المحدد`,
          `• \`${p}ترحيب [#روم]\` أو \`/ترحيب [الروم]\` — تعيين روم الترحيب أو إرسال ترحيب تجريبي`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🛡️ الإشراف (Moderation)",
        value: [
          `• \`${p}طرد @عضو [السبب]\` أو \`/طرد\``,
          `• \`${p}باند @عضو [السبب]\` أو \`/باند\``,
          `• \`${p}ميوت @عضو <دقائق> [السبب]\` أو \`/ميوت\``,
          `• \`${p}مسح <1-100>\` أو \`/مسح\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "⚙️ السستم والإدارة (System)",
        value: [
          `• \`${p}اظهار\` أو \`/اظهار\` — عرض جميع أوامر البوت`,
          `• \`${p}سستم\` أو \`/سستم\` — عرض حالة الأنظمة ومعلومات السيرفر`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "💬 سوالف وفعاليات (Fun & Sawalef)",
        value: [
          `• \`${p}سوالف\` أو \`/سوالف\` — سؤال نقاش وسوالف عشوائي`,
          `• \`${p}كت\` أو \`/كت\` — فقرة كت وتحدي خيارات`,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({ text: botConfig.embeds.footer?.text || "Server System" })
    .setTimestamp();
}

async function createTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("الدعم الفني والتذاكر")
    .setDescription("اضغط على الزر بالأسفل لفتح تذكرة جديدة والتواصل مع الإدارة.")
    .setColor(getColor(botConfig.embeds.colors.ticket?.open || "#57F287"))
    .setFooter({ text: botConfig.embeds.footer?.text || "Server System" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("فتح تذكرة")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

async function sendWelcomeMessage(guild, member, targetChannelId = null) {
  if (!isFeatureEnabled("welcome")) return false;
  const channelId = targetChannelId || botConfig.welcome?.defaultWelcomeChannel;
  if (!channelId) return false;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return false;

  const rawMsg =
    botConfig.welcome?.defaultWelcomeMessage ||
    "حياك الله {user} في {server}! صار عدد الأعضاء الآن {memberCount}.";

  const text = rawMsg
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{server\}/g, guild.name)
    .replace(/\{memberCount\}/g, String(guild.memberCount));

  const embed = new EmbedBuilder()
    .setTitle("عضو جديد انضم للسيرفر")
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL({ extension: "png" }))
    .setColor(getColor(botConfig.embeds.colors.success))
    .setFooter({ text: botConfig.embeds.footer?.text || "Server System" })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
  return true;
}

client.on("guildMemberAdd", async (member) => {
  await sendWelcomeMessage(member.guild, member);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();
  const member = message.member;

  if (cmd === "اظهار" || cmd === "اوامر" || cmd === "help") {
    return message.reply({ embeds: [buildCommandsHelpEmbed(message.guild.name)] });
  }

  if (cmd === "سستم" || cmd === "system") {
    const embed = new EmbedBuilder()
      .setTitle(`لوحة نظام السيرفر • ${message.guild.name}`)
      .setColor(getColor(botConfig.embeds.colors.primary))
      .addFields(
        { name: "الأعضاء", value: `${message.guild.memberCount}`, inline: true },
        { name: "الرومات", value: `${message.guild.channels.cache.size}`, inline: true },
        { name: "الرتب", value: `${message.guild.roles.cache.size}`, inline: true },
        {
          name: "حالة الأنظمة",
          value: [
            `الإشراف: ${isFeatureEnabled("moderation") ? "✅" : "❌"}`,
            `التذاكر: ${isFeatureEnabled("tickets") ? "✅" : "❌"}`,
            `الترحيب: ${isFeatureEnabled("welcome") ? "✅" : "❌"}`,
            `السجلات: ${isFeatureEnabled("logging") ? "✅" : "❌"}`,
            `السوالف: ${isFeatureEnabled("fun") ? "✅" : "❌"}`,
          ].join("\n"),
          inline: false,
        }
      )
      .setFooter({ text: botConfig.embeds.footer?.text || "Server System" })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  if (cmd === "ترحيب" || cmd === "welcome") {
    if (!hasStaffPerm(member)) {
      return message.reply(botConfig.messages?.noPermission || "ما عندك صلاحية.");
    }
    const mentionedChannel = message.mentions.channels.first();
    if (mentionedChannel) {
      botConfig.welcome.defaultWelcomeChannel = mentionedChannel.id;
      return message.reply(`تم تعيين روم الترحيب إلى <#${mentionedChannel.id}>.`);
    }
    const sent = await sendWelcomeMessage(message.guild, member);
    if (!sent) {
      return message.reply(`حدد روم الترحيب بالأمر: \`${prefix}ترحيب #الروم\``);
    }
    return message.reply("تم إرسال رسالة ترحيب تجريبية.");
  }

  if ((cmd === "تكت" || cmd === "ticket") && isFeatureEnabled("tickets")) {
    if (!hasStaffPerm(member, botConfig.tickets?.supportRoles)) {
      return message.reply(botConfig.messages?.noPermission || "ما عندك صلاحية.");
    }
    await createTicketPanel(message.channel);
    return message.delete().catch(() => {});
  }

  if (cmd === "سوالف" && isFeatureEnabled("fun")) {
    const q = SAWALEF_QUESTIONS[Math.floor(Math.random() * SAWALEF_QUESTIONS.length)];
    const embed = new EmbedBuilder()
      .setTitle("💬 سوالف")
      .setDescription(q)
      .setColor(getColor(botConfig.embeds.colors.economy || "#F1C40F"))
      .setFooter({ text: botConfig.embeds.footer?.text || "Server System" });
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "كت" && isFeatureEnabled("fun")) {
    const k = KAT_PROMPTS[Math.floor(Math.random() * KAT_PROMPTS.length)];
    const embed = new EmbedBuilder()
      .setTitle("🎲 فقرة كت")
      .setDescription(k)
      .setColor(getColor(botConfig.embeds.colors.info || "#3498DB"))
      .setFooter({ text: botConfig.embeds.footer?.text || "Server System" });
    return message.reply({ embeds: [embed] });
  }

  if (!isFeatureEnabled("moderation")) return;

  if (cmd === "طرد" || cmd === "kick") {
    if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply(botConfig.messages?.noPermission || "ما عندك صلاحية.");
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply(`اكتب الأمر كذا: \`${prefix}طرد @شخص [السبب]\``);
    if (!target.kickable) return message.reply("ما أقدر أطرد هذا العضو بسبب ترتيب الرتب أو الصلاحيات.");

    const reason = args.slice(1).join(" ") || "بدون سبب محدد";
    await target.kick(reason);
    await sendLog(
      message.guild,
      "إجراء إشرافي: طرد",
      `**العضو:** ${target.user.tag} (${target.id})\n**بواسطة:** ${message.author.tag}\n**السبب:** ${reason}`,
      botConfig.embeds.colors.moderation
    );
    return message.reply(`تم طرد **${target.user.tag}** — السبب: ${reason}`);
  }

  if (cmd === "باند" || cmd === "ban") {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply(botConfig.messages?.noPermission || "ما عندك صلاحية.");
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply(`اكتب الأمر كذا: \`${prefix}باند @شخص [السبب]\``);
    if (!target.bannable) return message.reply("ما أقدر أعطيه باند بسبب ترتيب الرتب أو الصلاحيات.");

    const reason = args.slice(1).join(" ") || "بدون سبب محدد";
    await target.ban({ reason });
    await sendLog(
      message.guild,
      "إجراء إشرافي: باند",
      `**العضو:** ${target.user.tag} (${target.id})\n**بواسطة:** ${message.author.tag}\n**السبب:** ${reason}`,
      botConfig.embeds.colors.error
    );
    return message.reply(`تم حظر **${target.user.tag}** — السبب: ${reason}`);
  }

  if (cmd === "ميوت" || cmd === "timeout") {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply(botConfig.messages?.noPermission || "ما عندك صلاحية.");
    }
    const target = message.mentions.members.first();
    const minutes = Number(args[1]);
    if (!target || !minutes || minutes <= 0) {
      return message.reply(`اكتب الأمر كذا: \`${prefix}ميوت @شخص 10 [السبب]\``);
    }
    if (!target.moderatable) return message.reply("ما أقدر أعطيه ميوت بسبب الصلاحيات.");

    const reason = args.slice(2).join(" ") || "بدون سبب محدد";
    await target.timeout(minutes * 60 * 1000, reason);
    await sendLog(
      message.guild,
      "إجراء إشرافي: ميوت مؤقت",
      `**العضو:** ${target.user.tag} (${target.id})\n**المدة:** ${minutes} دقيقة\n**بواسطة:** ${message.author.tag}\n**السبب:** ${reason}`,
      botConfig.embeds.colors.warning
    );
    return message.reply(`تم إعطاء **${target.user.tag}** ميوت لمدة **${minutes}** دقيقة.`);
  }

  if (cmd === "مسح" || cmd === "clear") {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply(botConfig.messages?.noPermission || "ما عندك صلاحية.");
    }
    const amount = Number(args[0]);
    if (!amount || amount < 1 || amount > 100) {
      return message.reply(`اكتب عدد الرسائل من 1 إلى 100: \`${prefix}مسح 20\``);
    }
    const deleted = await message.channel.bulkDelete(amount, true);
    return message.channel
      .send(`تم مسح **${deleted.size}** رسالة.`)
      .then((m) => setTimeout(() => m.delete().catch(() => {}), 4000));
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.guild) {
    const { commandName, member, options } = interaction;

    if (commandName === "اظهار") {
      return interaction.reply({ embeds: [buildCommandsHelpEmbed(interaction.guild.name)] });
    }

    if (commandName === "سستم") {
      const embed = new EmbedBuilder()
        .setTitle(`لوحة نظام السيرفر • ${interaction.guild.name}`)
        .setColor(getColor(botConfig.embeds.colors.primary))
        .addFields(
          { name: "الأعضاء", value: `${interaction.guild.memberCount}`, inline: true },
          { name: "الرومات", value: `${interaction.guild.channels.cache.size}`, inline: true },
          { name: "الرتب", value: `${interaction.guild.roles.cache.size}`, inline: true }
        )
        .setFooter({ text: botConfig.embeds.footer?.text || "Server System" })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === "تكت") {
      if (!isFeatureEnabled("tickets")) {
        return interaction.reply({ content: "نظام التذاكر معطّل.", ephemeral: true });
      }
      if (!hasStaffPerm(member, botConfig.tickets?.supportRoles)) {
        return interaction.reply({ content: botConfig.messages?.noPermission || "ما عندك صلاحية.", ephemeral: true });
      }
      await createTicketPanel(interaction.channel);
      return interaction.reply({ content: "تم إرسال لوحة التذاكر.", ephemeral: true });
    }

    if (commandName === "ترحيب") {
      if (!hasStaffPerm(member)) {
        return interaction.reply({ content: botConfig.messages?.noPermission || "ما عندك صلاحية.", ephemeral: true });
      }
      const selectedChannel = options.getChannel("الروم");
      if (selectedChannel) {
        botConfig.welcome.defaultWelcomeChannel = selectedChannel.id;
        return interaction.reply({ content: `تم تعيين روم الترحيب إلى <#${selectedChannel.id}>.` });
      }
      const sent = await sendWelcomeMessage(interaction.guild, member);
      if (!sent) {
        return interaction.reply({ content: "حدد روم الترحيب أولاً باستخدام خيار الروم.", ephemeral: true });
      }
      return interaction.reply({ content: "تم إرسال رسالة الترحيب.", ephemeral: true });
    }

    if (commandName === "سوالف") {
      const q = SAWALEF_QUESTIONS[Math.floor(Math.random() * SAWALEF_QUESTIONS.length)];
      const embed = new EmbedBuilder()
        .setTitle("💬 سوالف")
        .setDescription(q)
        .setColor(getColor(botConfig.embeds.colors.economy || "#F1C40F"));
      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === "كت") {
      const k = KAT_PROMPTS[Math.floor(Math.random() * KAT_PROMPTS.length)];
      const embed = new EmbedBuilder()
        .setTitle("🎲 فقرة كت")
        .setDescription(k)
        .setColor(getColor(botConfig.embeds.colors.info || "#3498DB"));
      return interaction.reply({ embeds: [embed] });
    }

    if (!isFeatureEnabled("moderation")) {
      return interaction.reply({ content: "نظام الإشراف معطّل.", ephemeral: true });
    }

    if (commandName === "طرد") {
      if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: botConfig.messages?.noPermission || "ما عندك صلاحية.", ephemeral: true });
      }
      const targetUser = options.getUser("العضو", true);
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember || !targetMember.kickable) {
        return interaction.reply({ content: "ما أقدر أطرد هذا العضو.", ephemeral: true });
      }
      const reason = options.getString("السبب") || "بدون سبب محدد";
      await targetMember.kick(reason);
      await sendLog(
        interaction.guild,
        "إجراء إشرافي: طرد",
        `**العضو:** ${targetUser.tag} (${targetUser.id})\n**بواسطة:** ${interaction.user.tag}\n**السبب:** ${reason}`,
        botConfig.embeds.colors.moderation
      );
      return interaction.reply({ content: `تم طرد **${targetUser.tag}** — السبب: ${reason}` });
    }

    if (commandName === "باند") {
      if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: botConfig.messages?.noPermission || "ما عندك صلاحية.", ephemeral: true });
      }
      const targetUser = options.getUser("العضو", true);
      const reason = options.getString("السبب") || "بدون سبب محدد";
      await interaction.guild.members.ban(targetUser.id, { reason }).catch(() => null);
      await sendLog(
        interaction.guild,
        "إجراء إشرافي: باند",
        `**العضو:** ${targetUser.tag} (${targetUser.id})\n**بواسطة:** ${interaction.user.tag}\n**السبب:** ${reason}`,
        botConfig.embeds.colors.error
      );
      return interaction.reply({ content: `تم حظر **${targetUser.tag}** — السبب: ${reason}` });
    }

    if (commandName === "ميوت") {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: botConfig.messages?.noPermission || "ما عندك صلاحية.", ephemeral: true });
      }
      const targetUser = options.getUser("العضو", true);
      const minutes = options.getInteger("الدقائق", true);
      const reason = options.getString("السبب") || "بدون سبب محدد";
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember || !targetMember.moderatable) {
        return interaction.reply({ content: "ما أقدر أعطيه ميوت.", ephemeral: true });
      }
      await targetMember.timeout(minutes * 60 * 1000, reason);
      await sendLog(
        interaction.guild,
        "إجراء إشرافي: ميوت مؤقت",
        `**العضو:** ${targetUser.tag} (${targetUser.id})\n**المدة:** ${minutes} دقيقة\n**بواسطة:** ${interaction.user.tag}\n**السبب:** ${reason}`,
        botConfig.embeds.colors.warning
      );
      return interaction.reply({ content: `تم إعطاء **${targetUser.tag}** ميوت لمدة **${minutes}** دقيقة.` });
    }

    if (commandName === "مسح") {
      if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: botConfig.messages?.noPermission || "ما عندك صلاحية.", ephemeral: true });
      }
      const count = options.getInteger("العدد", true);
      const deleted = await interaction.channel.bulkDelete(count, true);
      return interaction.reply({ content: `تم مسح **${deleted.size}** رسالة.`, ephemeral: true });
    }
  }

  if (!interaction.isButton() || !interaction.guild) return;

  if (interaction.customId === "open_ticket") {
    if (!isFeatureEnabled("tickets")) {
      return interaction.reply({ content: "نظام التذاكر معطّل حالياً.", ephemeral: true });
    }

    const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`.slice(0, 90);
    const existing = interaction.guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.topic === `ticket_owner:${interaction.user.id}`
    );
    if (existing) {
      return interaction.reply({ content: `عندك تذكرة مفتوحة بالفعل: <#${existing.id}>`, ephemeral: true });
    }

    const supportRoleIds = botConfig.tickets?.supportRoles || [];
    const permissionOverwrites = [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ];

    for (const roleId of supportRoleIds) {
      if (interaction.guild.roles.cache.has(roleId)) {
        permissionOverwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }
    }

    const ticketChannel = await interaction.guild.channels.create({
      name: channelName || `ticket-${interaction.user.id}`,
      type: ChannelType.GuildText,
      parent: botConfig.tickets?.defaultCategory || null,
      topic: `ticket_owner:${interaction.user.id}`,
      permissionOverwrites,
    });

    const embed = new EmbedBuilder()
      .setTitle("تذكرة جديدة")
      .setDescription(`حياك الله <@${interaction.user.id}>، اكتب مشكلتك أو استفسارك هنا وبيجيك الدعم الفني.`)
      .setColor(getColor(botConfig.embeds.colors.ticket?.open || "#57F287"))
      .setTimestamp();

    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("استلام التذكرة")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("إغلاق التذكرة")
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `<@${interaction.user.id}> ${supportRoleIds.map((id) => `<@&${id}>`).join(" ")}`.trim(),
      embeds: [embed],
      components: [controls],
    });

    await sendLog(
      interaction.guild,
      "فتح تذكرة",
      `تم فتح التذكرة <#${ticketChannel.id}> بواسطة <@${interaction.user.id}>`,
      botConfig.embeds.colors.ticket?.open || "#57F287"
    );

    return interaction.reply({ content: `تم إنشاء تذكرتك: <#${ticketChannel.id}>`, ephemeral: true });
  }

  if (interaction.customId === "claim_ticket") {
    if (!hasStaffPerm(interaction.member, botConfig.tickets?.supportRoles)) {
      return interaction.reply({ content: botConfig.messages?.noPermission || "ما عندك صلاحية.", ephemeral: true });
    }
    await interaction.reply({ content: `تم استلام التذكرة بواسطة <@${interaction.user.id}>.` });
  }

  if (interaction.customId === "close_ticket") {
    if (!hasStaffPerm(interaction.member, botConfig.tickets?.supportRoles)) {
      return interaction.reply({ content: botConfig.messages?.noPermission || "ما عندك صلاحية.", ephemeral: true });
    }
    await interaction.reply({ content: "سيتم إغلاق التذكرة خلال 3 ثوانٍ..." });
    await sendLog(
      interaction.guild,
      "إغلاق تذكرة",
      `تم إغلاق التذكرة **${interaction.channel.name}** بواسطة <@${interaction.user.id}>`,
      botConfig.embeds.colors.ticket?.closed || "#ED4245"
    );
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 3000);
  }
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
  const clientId = process.env.CLIENT_ID || client.user.id;
  if (!token || !clientId) return;

  try {
    const rest = new REST({ version: "10" }).setToken(token);
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, process.env.GUILD_ID),
        { body: slashCommands }
      );
      console.log("Registered guild slash commands.");
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: slashCommands });
      console.log("Registered global slash commands.");
    }
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
});

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
client.login(token);
