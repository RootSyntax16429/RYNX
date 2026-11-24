export const botConfig = {
  commands: { prefix: "!" },
  presence: {
    status: "online",
    activities: [{ name: "Titan Bot", type: 0 }],
  },
  economy: {
    currency: "🪙",
    currencyName: "Coins",
    startingBalance: 0,
  },
  welcome: { defaultWelcomeChannel: null },
  tickets: { logChannel: null, defaultCategory: null },
  features: {
    welcome: true,
    tickets: true,
    moderation: true,
  },
  embeds: {
    colors: { primary: "#336699" },
    footer: { text: "Titan Bot" },
  },
};

export const BotConfig = botConfig;

export function isBotOwner(userId) {
  const owners = process.env.BOT_OWNERS
    ? process.env.BOT_OWNERS.split(",").map((id) => id.trim())
    : [];
  return owners.includes(String(userId));
}

export function getBotMessage(key, fallback = "") {
  return fallback || key || "";
}

export function getCommandPrefix(guildId = null) {
  return botConfig.commands?.prefix || "!";
}

export function getDefaultApplicationQuestions() {
  return [];
}

export function getColor(color) {
  return color || "#336699";
}

export function isFeatureEnabled(featureName) {
  return Boolean(botConfig.features?.[featureName]);
}

export function validateConfig() {
  return true;
}

export default botConfig;
