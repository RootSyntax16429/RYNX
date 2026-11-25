export const commandAliases = {
  // لوحة أوامر سنيفر
  "اوامر_سنيفر": "show",
  "اظهار": "show",
  "إظهار": "show",
  "اوامر": "show",
  "الاوامر": "show",

  // أوامر الإشراف ونظام السجن
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

  // التذاكر والترحيب
  "تذاكر": "ticket",
  "اغلاق": "close",
  "ترحيب": "welcome",
  "وداع": "goodbye",
  "تلقائي": "autorole",
};

export function resolveCommandAlias(name = "") {
  const clean = String(name).trim().toLowerCase();
  const rawClean = String(name).trim();
  return commandAliases[rawClean] || commandAliases[clean] || clean;
}

export function resolveSubcommandAlias(subcommand = "") {
  const clean = String(subcommand).trim().toLowerCase();
  const rawClean = String(subcommand).trim();
  return commandAliases[rawClean] || commandAliases[clean] || clean;
}
