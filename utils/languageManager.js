
const dataManager = require("./dataManager");
const { translate } = require("@vitalets/google-translate-api");

class LanguageManager {
    constructor() {
        this.preferences = dataManager.loadData("language_preferences.json") || {};
        this.translationCache = new Map();
        this.supportedLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'];
    }

    setUserPreference(userId, language) {
        this.preferences[userId] = language;
        dataManager.saveData("language_preferences.json", this.preferences);
    }

    getUserPreference(userId) {
        return this.preferences[userId] || "en";
    }

    isValidLanguage(lang) {
        return this.supportedLanguages.includes(lang.toLowerCase());
    }

    getCacheKey(text, targetLang) {
        return `${text}:${targetLang}`;
    }

    async translateMessage(text, targetLang) {
        try {
            // Check if language is supported
            if (!this.isValidLanguage(targetLang)) {
                console.warn(`Unsupported language: ${targetLang}`);
                return text;
            }

            // Check cache first
            const cacheKey = this.getCacheKey(text, targetLang);
            if (this.translationCache.has(cacheKey)) {
                return this.translationCache.get(cacheKey);
            }

            const result = await translate(text, { to: targetLang });
            
            // Cache the result
            this.translationCache.set(cacheKey, result.text);
            
            // Clear old cache entries if cache gets too large
            if (this.translationCache.size > 1000) {
                const oldestKey = this.translationCache.keys().next().value;
                this.translationCache.delete(oldestKey);
            }

            return result.text;
        } catch (error) {
            console.error("Translation error:", error);
            return text;
        }
    }
}

module.exports = new LanguageManager();
