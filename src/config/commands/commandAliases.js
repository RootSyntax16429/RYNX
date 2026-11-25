function normalizeAlias(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .trim();
}

export const COMMAND_ALIASES = {
  modpanel: [
    "modpanel",
    "اوامر_سجن",
    "اوامر سجن",
    "اشراف",
    "الاشراف",
    "الإشراف",
    "سجن_اعداد",
    "اعداد_السجن",
    "إعداد_السجن",
    "سجن",
    "السجن",
    "فك_سجن",
    "فك سجن",
    "افراج",
    "الإفراج",
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
  ],
  commands: [
    "commands",
    "help",
    "اوامر",
    "الاوامر",
    "الأوامر",
    "اوامر_سنيفر",
    "اوامر سنيفر",
  ],
};

const ALIAS_TO_COMMAND = new Map();

for (const [canonicalName, aliases] of Object.entries(COMMAND_ALIASES)) {
  ALIAS_TO_COMMAND.set(normalizeAlias(canonicalName), canonicalName);
  for (const alias of aliases) {
    ALIAS_TO_COMMAND.set(normalizeAlias(alias), canonicalName);
  }
}

export function resolveCommandName(input) {
  if (!input) return null;
  const cleaned = String(input).replace(/^[!$]+/, "").trim();
  if (!cleaned) return null;
  return ALIAS_TO_COMMAND.get(normalizeAlias(cleaned)) || null;
}

export function getCommandAliases(commandName) {
  const key = normalizeAlias(commandName);
  const canonical = ALIAS_TO_COMMAND.get(key) || key;
  return COMMAND_ALIASES[canonical] || [];
}

export default {
  COMMAND_ALIASES,
  resolveCommandName,
  getCommandAliases,
};
