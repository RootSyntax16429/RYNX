import { EmbedBuilder } from "discord.js";
import { getCommandPrefix } from "../../config/bot.js";

const ARABIC_COMMAND_EXAMPLES = [
  "تذاكر <ايدي_الروم>",
  "مساعدة",
  "حالة_البوت",
  "إحصائيات_السيرفر",
];

export default {
  name: "show",
  aliases: ["اظهار", "إظهار", "الاوامر", "الأوامر"],
  description: "يعرض قائمة بأوامر البوت وأمثلة استخدامها",
  async execute(message, args, client) {
    const prefix = getCommandPrefix(message.guild?.id) || "!";
    const commandsCollection = client.commands || new Map();

    // تجميع أسماء الأوامر المحمّلة بدون تكرار
    const uniqueNames = new Set();
    for (const [key, cmd] of commandsCollection.entries()) {
      const realName = cmd?.name || key;
      if (realName) uniqueNames.add(realName);
    }

    const loadedCommandsList = Array.from(uniqueNames).sort((a, b) =>
      String(a).localeCompare(String(b))
    );

    const arabicExamplesFormatted = ARABIC_COMMAND_EXAMPLES.map(
      (ex) => `\`${prefix}${ex}\``
    ).join("\n");

    const loadedPreview =
      loadedCommandsList.length > 0
        ? loadedCommandsList.map((name) => `\`${prefix}${name}\``).join(", ")
        : "لا توجد أوامر محمّلة حالياً";

    // تقسيم القائمة إذا كانت طويلة حتى لا تتجاوز حد Discord Embed (4096 حرف)
    const maxFieldLength = 950;
    const chunks = [];
    let currentChunk = "";

    for (const item of loadedPreview.split(", ")) {
      const addition = currentChunk ? `, ${item}` : item;
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
      .setTitle(`📋 قائمة أوامر البوت (${loadedCommandsList.length} أمر)`)
      .setDescription("أمثلة على صيغة الأوامر وأسماء الأوامر المتوفرة في البوت:")
      .addFields({
        name: "💡 أمثلة الاستخدام",
        value: arabicExamplesFormatted,
        inline: false,
      });

    chunks.slice(0, 3).forEach((chunk, index) => {
      embed.addFields({
        name: index === 0 ? "⚙️ الأوامر المحمّلة" : `⚙️ تكملة الأوامر (${index + 1})`,
        value: chunk,
        inline: false,
      });
    });

    return message.reply({ embeds: [embed] });
  },
};
