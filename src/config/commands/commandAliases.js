/**
 * Command Aliases Configuration
 * Maps shortened command names to their full command names
 */

export const commandAliases = {
    'bal': 'balance',
    'money': 'balance',
    'cash': 'balance',

    'اظهار': 'show',
    'إظهار': 'show',
    'الاوامر': 'show',
    'الأوامر': 'show',
    'show': 'show',

    // اختصارات عربية من كلمة واحدة
    'اظهار': 'show',
    'إظهار': 'show',
    'الاوامر': 'show',
    'الأوامر': 'show',
    'اوامر': 'show',
    'تذاكر': 'ticket',
    'تايم': 'timeout',
    'لاتايم': 'untimeout',
    'باند': 'ban',
    'لاباند': 'unban',
    'طرد': 'kick',
    'قفل': 'lock',
    'لاقفل': 'unlock',
    'مسح': 'purge',
    'تحذير': 'warn',
    'تحذيرات': 'warnings',
    'رتب': 'reactroles',
    'ترحيب': 'welcome',
    'وداع': 'goodbye',
    'تحقق': 'verify',
    'تقديم': 'apply',
    'سيرفر': 'serverinfo',
    'احصائيات': 'serverstats',
    'معلومات': 'userinfo',
    'افتار': 'avatar',
    'مساعدة': 'help',
    'بنق': 'ping',
    'تصويت': 'poll',
    'قول': 'say',
    'خاص': 'dm',
    'ايمبد': 'embedbuilder',
    'رصيد': 'balance',
    'يومية': 'daily',
    'وظيفة': 'work',
    'تحويل': 'pay',
    'توب': 'leaderboard',
    'لفل': 'level',
    'زود': 'leveladd',
    'نقص': 'levelremove',
    'ضبط': 'levelset',
    'رتبة': 'rank',
    'متجر': 'shop',
    'شراء': 'buy',
    'حقيبة': 'inventory',
    'شغل': 'play',
    'موسيقى': 'music',
    'ادخل': 'join',
    'قائمة': 'queue',
    'يشتغل': 'nowplaying',
    'قيفاواي': 'gcreate',
    'سحب': 'greroll',
    'انهاء': 'gend',
    'حذف': 'gdelete',

    'dep': 'deposit',
    'with': 'withdraw',
    'work': 'work',
    'daily': 'daily',
    'gamble': 'gamble',
    'bet': 'gamble',
    'rob': 'rob',
    'crime': 'crime',
    'pay': 'pay',
    'give': 'pay',
    'send': 'pay',

    'ping': 'ping',
    'help': 'help',
    'h': 'help',
    'info': 'help',

    'ban': 'ban',
    'kick': 'kick',
    'mute': 'timeout',
    'warn': 'warn',
    'clear': 'purge',
    'purge': 'purge',
    'untimeout': 'untimeout',
    'unmute': 'untimeout',

    'rank': 'rank',
    'lvl': 'rank',
    'xp': 'rank',
    'leaderboard': 'leaderboard',
    'lb': 'leaderboard',
    'top': 'leaderboard',

    'shop': 'shop',
    'buy': 'buy',
    'inventory': 'inventory',
    'inv': 'inventory',
    'items': 'inventory',

    'user': 'userinfo',
    'avatar': 'avatar',
    'pfp': 'avatar',
    'icon': 'avatar',

    'bd': 'birthday',
    'bday': 'birthday',
    'b': 'birthday',

    'flip': 'flip',
    'coin': 'flip',
    'roll': 'roll',
    'dice': 'roll',
    'fight': 'fight',

    'gcreate': 'gcreate',
    'gstart': 'gcreate',
    'gend': 'gend',
    'gstop': 'gend',
    'gdelete': 'gdelete',
    'greroll': 'greroll',
    'groll': 'greroll',

    'ticket': 'ticket',
    't': 'ticket',
    'new': 'ticket',

    'ver': 'verify',
    'vadmin': 'verification',
    'av': 'autoverify',

    'welcome': 'welcome',
    'greet': 'greet',
    'goodbye': 'goodbye',
    'autorole': 'autorole',

    'calc': 'calculate',
    'math': 'calculate',
    'weather': 'weather',
    'todo': 'todo',
    'report': 'report',
    'userinfo': 'userinfo',
    'whois': 'userinfo',
    'ui': 'userinfo',

    'serverstats': 'serverstats',
    'ss': 'serverstats',
    'sstats': 'serverstats',

    'rr': 'reactroles',
    'reactionroles': 'reactroles',

    'jtc': 'jointocreate',
    'jointocreate': 'jointocreate',

    'np': 'nowplaying',
    'now': 'nowplaying',
};

export const subcommandAliases = {
    'l': 'list',
    'ls': 'list',
    's': 'set',
    'i': 'info',
    'r': 'remove',
    'rm': 'remove',
    'del': 'remove',
    'n': 'next',
    'sc': 'setchannel',

    'a': 'add',
    'c': 'complete',
    'done': 'complete',
    'd': 'complete',

    'start': 'create',
    'stop': 'end',
    'roll': 'reroll',

    'add': 'add',
    'remove': 'remove',
    'list': 'list',
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
