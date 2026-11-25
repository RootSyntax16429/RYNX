function normalizeAlias(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0640]/g, "")
    .replace(/\s+/g, " ")
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
    "انشاء_السجن",
    "إنشاء_السجن",
    "صيدنايا",
    "اسباب_السجن",
    "أسباب_السجن",
    "اضف_سبب",
    "إضافة_سبب",
    "حذف_سبب",
    "تصفير_الاسباب",
    "تصفير_الأسباب",
    "اعفاء",
    "إعفاء",
    "طلب_اعفاء",
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
const ALIAS_TO_CANONICAL_ALIAS = new Map();

for (const [canonicalName, aliases] of Object.entries(COMMAND_ALIASES)) {
  const normCanonical = normalizeAlias(canonicalName);
  ALIAS_TO_COMMAND.set(normCanonical, canonicalName);
  ALIAS_TO_CANONICAL_ALIAS.set(normCanonical, canonicalName);

  for (const alias of aliases) {
    const normAlias = normalizeAlias(alias);
    ALIAS_TO_COMMAND.set(normAlias, canonicalName);
    ALIAS_TO_CANONICAL_ALIAS.set(normAlias, alias);
  }
}

export function resolveCommandName(input) {
  if (!input) return null;
  const cleaned = String(input).replace(/^[!$]+/, "").trim();
  if (!cleaned) return null;

  const normalized = normalizeAlias(cleaned);
  if (ALIAS_TO_COMMAND.has(normalized)) {
    return ALIAS_TO_COMMAND.get(normalized);
  }

  const firstToken = normalized.split(" ")[0];
  return ALIAS_TO_COMMAND.get(firstToken) || null;
}

export function resolveMatchedAlias(input) {
  if (!input) return null;
  const cleaned = String(input).replace(/^[!$]+/, "").trim();
  if (!cleaned) return null;

  const normalized = normalizeAlias(cleaned);
  if (ALIAS_TO_CANONICAL_ALIAS.has(normalized)) {
    return ALIAS_TO_CANONICAL_ALIAS.get(normalized);
  }

  const firstToken = normalized.split(" ")[0];
  return ALIAS_TO_CANONICAL_ALIAS.get(firstToken) || null;
}

export function getCommandAliases(commandName) {
  const key = normalizeAlias(commandName);
  const canonical = ALIAS_TO_COMMAND.get(key) || key;
  return COMMAND_ALIASES[canonical] || [];
}

export function isKnownAlias(input) {
  return Boolean(resolveCommandName(input));
}

export default {
  COMMAND_ALIASES,
  resolveCommandName,
  resolveMatchedAlias,
  getCommandAliases,
  isKnownAlias,
};
