import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getCommandPrefix } from "../../config/bot.js";
import { commandAliases } from "../../config/commands/commandAliases.js";

// اختصارات عربية خفيفة من كلمة واحدة + عكس الأمر يبدأ بـ (لا)
export const ARABIC_SYSTEM_COMMANDS = {
  // الإدارة والسيستم
  "app-admin": "تقديمات",
  apply: "تقديم",
  autorole: "تلقائي",
  autoverify: "تلقائي",
  ban: "باند",
  unban: "لاباند",
  cases: "قضايا",
  close: "اغلاق",
  commands: "اوامر",
  configwizard: "اعداد",
  count: "عداد",
  countdown: "مؤقت",
  dm: "خاص",
  economy: "اقتصاد",
  eleaderboard: "اغنياء",
  embedbuilder: "ايمبد",
  firstmsg: "اول",
  goodbye: "وداع",
  greet: "استقبال",
  jointocreate: "رومات",
  kick: "طرد",
  leaderboard: "توب",
  level: "لفل",
  leveladd: "زود",
  levelremove: "نقص",
  levelset: "ضبط",
  lock: "قفل",
  unlock: "لاقفل",
  logging: "سجلات",
  massban: "باندات",
  masskick: "طردات",
  ping: "بنق",
  poll: "تصويت",
  priority: "اولوية",
  purge: "مسح",
  reactroles: "رتب",
  report: "بلاغ",
  say: "قول",
  serverinfo: "سيرفر",
  serverstats: "احصائيات",
  support: "دعم",
  ticket: "تذاكر",
  timeout: "تايم",
  untimeout: "لاتايم",
  uptime: "مدة",
  userinfo: "معلومات",
  usernotes: "ملاحظات",
  verification: "تحققات",
  verify: "تحقق",
  warn: "تحذير",
  warnings: "تحذيرات",
  welcome: "ترحيب",
  wipedata: "تصفير",

  // العامة والألعاب والاقتصاد والصوت
  avatar: "افتار",
  balance: "رصيد",
  baseconvert: "تحويل",
  beg: "تسول",
  birthday: "ميلاد",
  buy: "شراء",
  calculate: "احسب",
  claim: "استلام",
  crime: "جريمة",
  daily: "يومية",
  deposit: "ايداع",
  fight: "قتال",
  fish: "صيد",
  flip: "عملة",
  gamble: "رهان",
  gcreate: "قيفاواي",
  gdelete: "حذف",
  gend: "انهاء",
  generatepassword: "باسورد",
  greroll: "سحب",
  help: "مساعدة",
  hexcolor: "لون",
  inventory: "حقيبة",
  join: "ادخل",
  mine: "تعدين",
  music: "موسيقى",
  nowplaying: "يشتغل",
  pay: "تحويل",
  play: "شغل",
  queue: "قائمة",
  randomuser: "عشوائي",
  rank: "رتبة",
  rob: "سرقة",
  roll: "نرد",
  search: "بحث",
  shop: "متجر",
  "shop-config": "متاجر",
  shorten: "اختصار",
  show: "اظهار",
  stats: "حالة",
  time: "وقت",
  todo: "مهام",
  unixtime: "يونكس",
  weather: "طقس",
  withdraw: "سحب",
  work: "وظيفة",
};

const ARABIC_REGEX = /[\u0600-\u06FF]/;

export default {
  data: new SlashCommandBuilder()
    .setName("show")
    .setDescription("يعرض جميع أوامر البوت العربية المختصرة"),
  name: "show",
  aliases: ["اظهار", "إظهار", "الاوامر", "الأوامر"],
  description: "يعرض جميع أوامر البوت العربية المختصرة",
  async execute(messageOrInteraction, args, client) {
    const guildId = messageOrInteraction.guild?.id;
    const prefix = getCommandPrefix(guildId) || "!";
    const commandsCollection =
      client?.commands || messageOrInteraction.client?.commands || new Map();

    const arabicCommandsSet = new Set();

    // 1. الأسماء العربية المربوطة في commandAliases
    for (const [alias, targetCmd] of Object.entries(commandAliases || {})) {
      if (ARABIC_REGEX.test(alias) && targetCmd) {
        arabicCommandsSet.add(alias.trim());
      }
    }

    // 2. الأسماء العربية المختصرة للأوامر المحمّلة
    for (const [key, cmd] of commandsCollection.entries()) {
      const baseName = String(cmd?.name || cmd?.data?.name || key).toLowerCase();

      if (ARABIC_REGEX.test(baseName)) {
        arabicCommandsSet.add(baseName);
      }

      if (ARABIC_SYSTEM_COMMANDS[baseName]) {
        arabicCommandsSet.add(ARABIC_SYSTEM_COMMANDS[baseName]);
      }
    }

    const sortedArabicCommands = Array.from(arabicCommandsSet).sort((a, b) =>
      a.localeCompare(b, "ar")
    );

    const formattedList = sortedArabicCommands.map((cmdName) => `\`${prefix}${cmdName}\``);

    const maxFieldLength = 950;
    const chunks = [];
    let currentChunk = "";

    for (const item of formattedList) {
      const addition = currentChunk ? `، ${item}` : item;
      if ((currentChunk + addition).length > maxFieldLength) {
        chunks.push(currentChunk);
        currentChunk = item;
      } else {
        currentChunk += addition;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    const embed = new EmbedBuilder()
      .setColor("#336699")
      .setTitle(`📋 أوامر البوت (${sortedArabicCommands.length} أمر)`);

    if (chunks.length === 0) {
      embed.setDescription("لا توجد أوامر متوفرة حالياً.");
    } else {
      chunks.forEach((chunk, index) => {
        embed.addFields({
          name: index === 0 ? "الأوامر" : `تكملة الأوامر (${index + 1})`,
          value: chunk,
          inline: false,
        });
      });
    }

    return messageOrInteraction.reply({ embeds: [embed] });
  },
};
