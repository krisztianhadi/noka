import type { CardLanguage } from './languages';

/**
 * One message catalogue for the responder pages, the PIN and error pages and
 * the printed instructions (D20). A language is added in one place; a missing
 * key is a TypeScript error and a failing test, never a silent English string.
 *
 * Nothing here is the owner's own wording: names, notes and anything else the
 * owner typed stay exactly as typed (D19).
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
  'view.notes': 'Notes',
  'view.hide': 'Hide now',

  'error.rateLimited': 'Too many attempts. Try again later.',
  'error.notFound': 'This card is not available.',

  'relation.spouse': 'Spouse',
  'relation.partner': 'Partner',
  'relation.parent': 'Parent',
  'relation.sibling': 'Sibling',
  'relation.child': 'Child',
  'relation.friend': 'Friend',
  'relation.other': 'Other',
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
  'view.notes': 'Notas',
  'view.hide': 'Ocultar ahora',

  'error.rateLimited': 'Demasiados intentos. Inténtalo más tarde.',
  'error.notFound': 'Esta tarjeta no está disponible.',

  'relation.spouse': 'Cónyuge',
  'relation.partner': 'Pareja',
  'relation.parent': 'Madre o padre',
  'relation.sibling': 'Hermano o hermana',
  'relation.child': 'Hijo o hija',
  'relation.friend': 'Amigo o amiga',
  'relation.other': 'Otro',
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
  'view.notes': 'Notes',
  'view.hide': 'Masquer maintenant',

  'error.rateLimited': 'Trop de tentatives. Réessayez plus tard.',
  'error.notFound': "Cette carte n'est pas disponible.",

  'relation.spouse': 'Conjoint(e)',
  'relation.partner': 'Partenaire',
  'relation.parent': 'Parent',
  'relation.sibling': 'Fratrie',
  'relation.child': 'Enfant',
  'relation.friend': 'Ami(e)',
  'relation.other': 'Autre',
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
  'view.notes': '备注',
  'view.hide': '立即隐藏',

  'error.rateLimited': '尝试次数过多，请稍后再试。',
  'error.notFound': '此卡片不可用。',

  'relation.spouse': '配偶',
  'relation.partner': '伴侣',
  'relation.parent': '父母',
  'relation.sibling': '兄弟姐妹',
  'relation.child': '子女',
  'relation.friend': '朋友',
  'relation.other': '其他',
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
  'view.notes': 'Заметки',
  'view.hide': 'Скрыть сейчас',

  'error.rateLimited': 'Слишком много попыток. Попробуйте позже.',
  'error.notFound': 'Эта карта недоступна.',

  'relation.spouse': 'Супруг(а)',
  'relation.partner': 'Партнёр',
  'relation.parent': 'Родитель',
  'relation.sibling': 'Брат или сестра',
  'relation.child': 'Ребёнок',
  'relation.friend': 'Друг',
  'relation.other': 'Другое',
};

export const MESSAGES: Record<CardLanguage, Record<MessageKey, string>> = { en, es, fr, zh, ru };

export function t(language: CardLanguage, key: MessageKey): string {
  return MESSAGES[language][key];
}

export function messageKeys(): MessageKey[] {
  return Object.keys(en) as MessageKey[];
}
