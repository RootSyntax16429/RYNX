import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getCommandPrefix } from "../../config/bot.js";
import { commandAliases } from "../../config/commands/commandAliases.js";

// أوامر السيستم والتذاكر والإشراف والترحيب فقط (كلمة واحدة + عكسها بـ "لا")
export const CORE_SYSTEM_COMMANDS = {
  // الإشراف والمودريشن
  ban: "باند",
  unban: "لاباند",
  kick: "طرد",
  massban: "باندات",
  masskick: "طردات",
  timeout: "تايم",
  untimeout: "لاتايم",
  lock: "قفل",
  unlock: "لاقفل",
  purge: "مسح",
  warn: "تحذير",
  warnings: "تحذيرات",
  cases: "قضايا",
  usernotes: "ملاحظات",

  // التذاكر والدعم والتقديم
  ticket: "تذاكر",
  close: "اغلاق",
  support: "دعم",
  apply: "تقديم",
  "app-admin": "تقديمات",

  // الترحيب والوداع والتحقق والرتب
  welcome: "ترحيب",
  goodbye: "وداع",
  greet: "استقبال",
  autorole: "تلقائي",
  verify: "تحقق",
  autoverify: "تحققات",
  verification: "إدارة_التحقق",
  reactroles: "رتب",
  jointocreate: "رومات",

  // السيستم والإعدادات والمعلومات
  show: "اظهار",
  commands: "اوامر",
  help: "مساعدة",
  ping: "بنق",
  configwizard: "اعداد",
  logging: "سجلات",
  serverinfo: "سيرفر",
  serverstats: "احصائيات",
  userinfo: "معلومات",
  avatar: "افتار",
  say: "قول",
  dm: "خاص",
  embedbuilder: "ايمبد",
  poll: "تصويت",
  report: "بلاغ",
  priority: "اولوية",
  count: "عداد",
  countdown: "مؤقت",
  firstmsg: "اول",
  stats: "حالة",
  uptime: "مدة",
  wipedata: "تصفير",
  level: "لفل",
  leveladd: "زود",
  levelremove: "نقص",
  levelset: "ضبط",
  rank: "رتبة",
  leaderboard: "توب",
};

// قائمة الأوامر المسموح ظهورها (السيستم + التذاكر + الإشراف + الترحيب) واستبعاد الباقي
const ALLOWED_ARABIC_SET = new Set([
  ...Object.values(CORE_SYSTEM_COMMANDS),
  "اظهار",
  "إظهار",
  "اوامر",
  "الاوامر",
  "الأوامر",
]);

const ARABIC_REGEX = /[\u0600-\u06FF]/;

export default {
  data: new SlashCommandBuilder()
    .setName("show")
    .setDescription("يعرض أوامر السيستم والتذاكر والإشراف والترحيب كاملة"),
  name: "show",
  aliases: ["اظهار", "إظهار", "الاوامر", "الأوامر", "اوامر"],
  description: "يعرض أوامر السيستم والتذاكر والإشراف والترحيب كاملة",
  async execute(messageOrInteraction, args, client) {
    const guildId = messageOrInteraction.guild?.id;
    const prefix = getCommandPrefix(guildId) || "!";
    const commandsCollection =
      client?.commands || messageOrInteraction.client?.commands || new Map();

    const finalCommandsSet = new Set();

    // 1. إضافة أوامر السيستم والتذاكر والإشراف والترحيب الأساسية
    for (const arabicName of Object.values(CORE_SYSTEM_COMMANDS)) {
      finalCommandsSet.add(arabicName);
    }

    // 2. إضافة أي اختصارات عربية موجودة في commandAliases إذا كانت ضمن المسموح
    for (const [alias, targetCmd] of Object.entries(commandAliases || {})) {
      const cleanAlias = String(alias).trim();
      if (ARABIC_REGEX.test(cleanAlias) && ALLOWED_ARABIC_SET.has(cleanAlias) && targetCmd) {
        finalCommandsSet.add(cleanAlias);
      }
    }

    // 3. إضافة أي أمر عربي محمّل ضمن المسموح
    for (const [key, cmd] of commandsCollection.entries()) {
      const baseName = String(cmd?.name || cmd?.data?.name || key).toLowerCase();
      const mapped = CORE_SYSTEM_COMMANDS[baseName];
      if (mapped) {
        finalCommandsSet.add(mapped);
      }
    }

    const sortedCommands = Array.from(finalCommandsSet).sort((a, b) =>
      a.localeCompare(b, "ar")
    );

    // صياغة كل أمر بدون مسافات داخلية لتجنب انقسامه في السطر
    const formattedItems = sortedCommands.map((cmdName) => `\`${prefix}${cmdName}\``);

    // تقسيم الحقول بحيث لا يقطع أي عنصر وبحد أقصى 1000 حرف لكل حقل
    const maxFieldLength = 1000;
    const chunks = [];
    let currentChunk = "";

    for (const item of formattedItems) {
      const separator = currentChunk ? " ، " : "";
      if ((currentChunk + separator + item).length > maxFieldLength) {
        chunks.push(currentChunk);
        currentChunk = item;
      } else {
        currentChunk += separator + item;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    const embed = new EmbedBuilder()
      .setColor("#336699")
      .setTitle(`📋 أوامر البوت — سيستم، تذاكر، إشراف، ترحيب (${sortedCommands.length} أمر)`);

    chunks.forEach((chunk, index) => {
      embed.addFields({
        name: index === 0 ? "الأوامر الكاملة" : `تكملة الأوامر (${index + 1})`,
        value: chunk,
        inline: false,
      });
    });

    return messageOrInteraction.reply({ embeds: [embed] });
  },
};
