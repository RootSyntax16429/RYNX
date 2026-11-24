export const botConfig = {
  commands: { prefix: "!" },
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
