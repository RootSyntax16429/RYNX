/**
 * Command Aliases Configuration
 * Maps shortened command names to their full command names
 */

export const commandAliases = {
// لوحة أوامر سنيفر
    'اوامر_سنيفر': 'show',
    'اظهار': 'show',
    'إظهار': 'show',
    'اوامر': 'show',
    'الاوامر': 'show',

    // أوامر الإشراف ونظام السجن
    'اشراف': 'modpanel',
    'الاشراف': 'modpanel',
    'مسح': 'modpanel',
    'كتم': 'modpanel',
    'اسكت': 'modpanel',
    'تكلم': 'modpanel',
    'انبح': 'modpanel',
    'باند': 'modpanel',
    'تف': 'modpanel',
    'لاباند': 'modpanel',
    'طرد': 'modpanel',
    'بنعالي': 'modpanel',
    'تايم': 'modpanel',
    'لاتايم': 'modpanel',
    'تحذير': 'modpanel',
    'تحذيرات': 'modpanel',
    'قفل': 'modpanel',
    'فتح': 'modpanel',
    'سجن': 'modpanel',
    'السجن': 'modpanel',
    'اوامر_سجن': 'modpanel',
    'سجن_اعداد': 'modpanel',
    'إعداد_السجن': 'modpanel',
    'اعداد_السجن': 'modpanel',
    'فك_سجن': 'modpanel',
    'افراج': 'modpanel',    

};

/**
 * Resolve a command alias to its full command name
 * @param {string} commandName - The command name (could be an alias)
 * @returns {string} - The full command name, or the original if not an alias
 */
export function resolveCommandAlias(commandName) {
    const normalized = commandName.toLowerCase();
    return commandAliases[normalized] || commandName;
}

/**
 * Resolve a subcommand alias to its full subcommand name
 * @param {string} subcommandName - The subcommand name (could be an alias)
 * @returns {string} - The full subcommand name, or the original if not an alias
 */
export function resolveSubcommandAlias(subcommandName) {
    const normalized = subcommandName.toLowerCase();
    return subcommandAliases[normalized] || subcommandName;
}
