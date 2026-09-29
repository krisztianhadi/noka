import type { CardLanguage } from './languages';

/**
 * One message catalogue for the responder pages, the PIN and error pages and
 * the printed instructions (D20). A language is added in one place; a missing
 * key is a TypeScript error and a failing test, never a silent English string.
 *
 * Nothing here is the owner's own wording: names, notes and anything else the
 * owner typed stay exactly as typed (D19).
 *
 * The dashboard and the landing are English-only (§13), so their form labels
 * and messages live in the pages, not here.
 */
const en = {
  'pin.title': 'Emergency contacts',
  'pin.prompt': 'Enter the 6-digit PIN printed on the card',
  'pin.label': 'PIN',
  'pin.submit': 'Open',
  'pin.error': 'That PIN is not correct.',
  'pin.language': 'Language',

  'view.heading': 'Emergency contacts',
  'view.call': 'Call',
  'view.whatsapp': 'WhatsApp',
  'view.speaks': 'Speaks',
  'view.notes': 'Notes',
  'view.hide': 'Hide now',
  'view.on': 'Available on',
  'view.text_only': 'Text message only — cannot speak or hear',
  'lang.change': 'change',

  'channel.call': 'Call',
  'channel.sms': 'Text message',
  'channel.whatsapp': 'WhatsApp',
  'channel.signal': 'Signal',
  'channel.telegram': 'Telegram',
  'channel.viber': 'Viber',

  'error.rateLimited': 'Too many attempts. Try again later.',
  'error.notFound': 'This card is not available.',

  'relation.spouse': 'Spouse',
  'relation.partner': 'Partner',
  'relation.parent': 'Parent',
  'relation.sibling': 'Sibling',
  'relation.child': 'Child',
  'relation.friend': 'Friend',
  'relation.other': 'Other',

  'spoken.en': 'English',
  'spoken.hu': 'Hungarian',
  'spoken.th': 'Thai',
  'spoken.zh': 'Chinese',
  'spoken.ru': 'Russian',
  'spoken.es': 'Spanish',
  'spoken.fr': 'French',
  'spoken.de': 'German',
  'spoken.it': 'Italian',
  'spoken.pt': 'Portuguese',
  'spoken.ar': 'Arabic',
  'spoken.ja': 'Japanese',
  'spoken.other': 'Other',
} as const;

export type MessageKey = keyof typeof en;

const es: Record<MessageKey, string> = {
  'pin.title': 'Contactos de emergencia',
  'pin.prompt': 'Introduce el PIN de 6 dígitos impreso en la tarjeta',
  'pin.label': 'PIN',
  'pin.submit': 'Abrir',
  'pin.error': 'Ese PIN no es correcto.',
  'pin.language': 'Idioma',

  'view.heading': 'Contactos de emergencia',
  'view.call': 'Llamar',
  'view.whatsapp': 'WhatsApp',
  'view.speaks': 'Habla',
  'view.notes': 'Notas',
  'view.hide': 'Ocultar ahora',
  'view.on': 'Disponible en',
  'view.text_only': 'Solo mensajes de texto — no puede hablar ni oír',
  'lang.change': 'cambiar',

  'channel.call': 'Llamar',
  'channel.sms': 'Mensaje de texto',
  'channel.whatsapp': 'WhatsApp',
  'channel.signal': 'Signal',
  'channel.telegram': 'Telegram',
  'channel.viber': 'Viber',

  'error.rateLimited': 'Demasiados intentos. Inténtalo más tarde.',
  'error.notFound': 'Esta tarjeta no está disponible.',

  'relation.spouse': 'Cónyuge',
  'relation.partner': 'Pareja',
  'relation.parent': 'Madre o padre',
  'relation.sibling': 'Hermano o hermana',
  'relation.child': 'Hijo o hija',
  'relation.friend': 'Amigo o amiga',
  'relation.other': 'Otro',

  'spoken.en': 'inglés',
  'spoken.hu': 'húngaro',
  'spoken.th': 'tailandés',
  'spoken.zh': 'chino',
  'spoken.ru': 'ruso',
  'spoken.es': 'español',
  'spoken.fr': 'francés',
  'spoken.de': 'alemán',
  'spoken.it': 'italiano',
  'spoken.pt': 'portugués',
  'spoken.ar': 'árabe',
  'spoken.ja': 'japonés',
  'spoken.other': 'otro',
};

const fr: Record<MessageKey, string> = {
  'pin.title': "Contacts d'urgence",
  'pin.prompt': 'Saisissez le code PIN à 6 chiffres imprimé sur la carte',
  'pin.label': 'Code PIN',
  'pin.submit': 'Ouvrir',
  'pin.error': "Ce code PIN n'est pas correct.",
  'pin.language': 'Langue',

  'view.heading': "Contacts d'urgence",
  'view.call': 'Appeler',
  'view.whatsapp': 'WhatsApp',
  'view.speaks': 'Parle',
  'view.notes': 'Notes',
  'view.hide': 'Masquer maintenant',
  'view.on': 'Disponible sur',
  'view.text_only': 'SMS uniquement — ne peut ni parler ni entendre',
  'lang.change': 'changer',

  'channel.call': 'Appeler',
  'channel.sms': 'SMS',
  'channel.whatsapp': 'WhatsApp',
  'channel.signal': 'Signal',
  'channel.telegram': 'Telegram',
  'channel.viber': 'Viber',

  'error.rateLimited': 'Trop de tentatives. Réessayez plus tard.',
  'error.notFound': "Cette carte n'est pas disponible.",

  'relation.spouse': 'Conjoint(e)',
  'relation.partner': 'Partenaire',
  'relation.parent': 'Parent',
  'relation.sibling': 'Fratrie',
  'relation.child': 'Enfant',
  'relation.friend': 'Ami(e)',
  'relation.other': 'Autre',

  'spoken.en': 'anglais',
  'spoken.hu': 'hongrois',
  'spoken.th': 'thaï',
  'spoken.zh': 'chinois',
  'spoken.ru': 'russe',
  'spoken.es': 'espagnol',
  'spoken.fr': 'français',
  'spoken.de': 'allemand',
  'spoken.it': 'italien',
  'spoken.pt': 'portugais',
  'spoken.ar': 'arabe',
  'spoken.ja': 'japonais',
  'spoken.other': 'autre',
};

const zh: Record<MessageKey, string> = {
  'pin.title': '紧急联系人',
  'pin.prompt': '请输入卡片上印的 6 位 PIN 码',
  'pin.label': 'PIN 码',
  'pin.submit': '打开',
  'pin.error': 'PIN 码不正确。',
  'pin.language': '语言',

  'view.heading': '紧急联系人',
  'view.call': '拨打电话',
  'view.whatsapp': 'WhatsApp',
  'view.speaks': '会说的语言',
  'view.notes': '备注',
  'view.hide': '立即隐藏',
  'view.on': '可通过',
  'view.text_only': '仅限短信 — 无法说话或听见',
  'lang.change': '更改',

  'channel.call': '拨打电话',
  'channel.sms': '短信',
  'channel.whatsapp': 'WhatsApp',
  'channel.signal': 'Signal',
  'channel.telegram': 'Telegram',
  'channel.viber': 'Viber',

  'error.rateLimited': '尝试次数过多，请稍后再试。',
  'error.notFound': '此卡片不可用。',

  'relation.spouse': '配偶',
  'relation.partner': '伴侣',
  'relation.parent': '父母',
  'relation.sibling': '兄弟姐妹',
  'relation.child': '子女',
  'relation.friend': '朋友',
  'relation.other': '其他',

  'spoken.en': '英语',
  'spoken.hu': '匈牙利语',
  'spoken.th': '泰语',
  'spoken.zh': '中文',
  'spoken.ru': '俄语',
  'spoken.es': '西班牙语',
  'spoken.fr': '法语',
  'spoken.de': '德语',
  'spoken.it': '意大利语',
  'spoken.pt': '葡萄牙语',
  'spoken.ar': '阿拉伯语',
  'spoken.ja': '日语',
  'spoken.other': '其他',
};

const ru: Record<MessageKey, string> = {
  'pin.title': 'Экстренные контакты',
  'pin.prompt': 'Введите 6-значный PIN-код, напечатанный на карте',
  'pin.label': 'PIN-код',
  'pin.submit': 'Открыть',
  'pin.error': 'Неверный PIN-код.',
  'pin.language': 'Язык',

  'view.heading': 'Экстренные контакты',
  'view.call': 'Позвонить',
  'view.whatsapp': 'WhatsApp',
  'view.speaks': 'Говорит на',
  'view.notes': 'Заметки',
  'view.hide': 'Скрыть сейчас',
  'view.on': 'Доступно в',
  'view.text_only': 'Только СМС — не может говорить или слышать',
  'lang.change': 'изменить',

  'channel.call': 'Позвонить',
  'channel.sms': 'СМС',
  'channel.whatsapp': 'WhatsApp',
  'channel.signal': 'Signal',
  'channel.telegram': 'Telegram',
  'channel.viber': 'Viber',

  'error.rateLimited': 'Слишком много попыток. Попробуйте позже.',
  'error.notFound': 'Эта карта недоступна.',

  'relation.spouse': 'Супруг(а)',
  'relation.partner': 'Партнёр',
  'relation.parent': 'Родитель',
  'relation.sibling': 'Брат или сестра',
  'relation.child': 'Ребёнок',
  'relation.friend': 'Друг',
  'relation.other': 'Другое',

  'spoken.en': 'английский',
  'spoken.hu': 'венгерский',
  'spoken.th': 'тайский',
  'spoken.zh': 'китайский',
  'spoken.ru': 'русский',
  'spoken.es': 'испанский',
  'spoken.fr': 'французский',
  'spoken.de': 'немецкий',
  'spoken.it': 'итальянский',
  'spoken.pt': 'португальский',
  'spoken.ar': 'арабский',
  'spoken.ja': 'японский',
  'spoken.other': 'другое',
};

export const MESSAGES: Record<CardLanguage, Record<MessageKey, string>> = { en, es, fr, zh, ru };

export function t(language: CardLanguage, key: MessageKey): string {
  return MESSAGES[language][key];
}

