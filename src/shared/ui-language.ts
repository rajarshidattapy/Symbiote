/**
 * Legacy values stay accepted when reading an existing settings file, then the renderer rewrites
 * the preference to English. Only English is shipped or selectable.
 */
export const UI_LANGUAGES = ['en', 'de', 'es', 'fr', 'pt-BR', 'pt-PT', 'ru', 'tr', 'vi', 'ja', 'ko', 'zh-CN', 'zh-TW'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
