export const commandAliases = {
  // لوحة سنيفر
  "اوامر_سنيفر": "show",
  "اوامر سنيفر": "show",
  "اظهار": "show",
  "إظهار": "show",
  "اوامر": "show",
  "الاوامر": "show",

  // الإشراف ونظام السجن
  "اشراف": "modpanel",
  "الاشراف": "modpanel",
  "مسح": "modpanel",
  "كتم": "modpanel",
  "اسكت": "modpanel",
  "تكلم": "modpanel",
  "انبح": "modpanel",
  "باند": "modpanel",
  "تف": "modpanel",
  "لاباند": "modpanel",
  "طرد": "modpanel",
  "بنعالي": "modpanel",
  "تايم": "modpanel",
  "لاتايم": "modpanel",
  "تحذير": "modpanel",
  "تحذيرات": "modpanel",
  "قفل": "modpanel",
  "فتح": "modpanel",
  "سجن": "modpanel",
  "السجن": "modpanel",
  "اوامر_سجن": "modpanel",
  "سجن_اعداد": "modpanel",
  "إعداد_السجن": "modpanel",
  "اعداد_السجن": "modpanel",
  "فك_سجن": "modpanel",
  "افراج": "modpanel",

  // التذاكر
  "انشاء_تذكره": "create_ticket",
  "انشاء_تذكرة": "create_ticket",
  "تذكره": "create_ticket",
  "تذكرة": "create_ticket",
  "تذاكر": "create_ticket",
  "لوحة_التذاكر": "create_ticket",
  "لوحه_التذاكر": "create_ticket",
  "اغلاق": "close",

  // الترحيب والرولات
  "ترحيب": "welcome",
  "وداع": "goodbye",
  "تلقائي": "autorole",
};

export function resolveCommandAlias(name = "") {
  const raw = String(name).trim();
  const lower = raw.toLowerCase();
  return commandAliases[raw] || commandAliases[lower] || lower;
}

export function resolveSubcommandAlias(subcommand = "") {
  const raw = String(subcommand).trim();
  const lower = raw.toLowerCase();
  return commandAliases[raw] || commandAliases[lower] || lower;
}
