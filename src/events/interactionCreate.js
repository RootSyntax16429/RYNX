import { Events } from "discord.js";
import { handleSnaiferModInteraction } from "../commands/Moderation/modPanel.js";

export default {
  name: Events.InteractionCreate,
  async execute(interaction, clientArg = null) {
    try {
      if (!interaction) return;

      const client = clientArg || interaction.client;

      // 1. أزرار ومودالات لوحة الإشراف والسجن
      if (interaction.isButton?.() || interaction.isModalSubmit?.()) {
        const handledMod = await handleSnaiferModInteraction(interaction);
        if (handledMod) return;
      }

      // 2. أوامر السلاش (Slash Commands)
      if (interaction.isChatInputCommand?.()) {
        const command = client?.commands?.get(interaction.commandName);
        if (!command || typeof command.execute !== "function") return;

        await command.execute(interaction, [], client);
      }
    } catch (error) {
      console.error("[interactionCreate] Error handling interaction:", error);

      if (interaction && !interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content: "❌ صار خطأ أثناء تنفيذ التفاعل.",
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  },
};
