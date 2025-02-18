const dataManager = require("./dataManager");
const { translate } = require("@vitalets/google-translate-api");

class LanguageManager {
    constructor() {
        this.preferences =
            dataManager.loadData("language_preferences.json") || {};
    }

    setUserPreference(userId, language) {
        this.preferences[userId] = language;
        dataManager.saveData("language_preferences.json", this.preferences);
    }

    getUserPreference(userId) {
        return this.preferences[userId] || "en";
    }

    async translateMessage(text, targetLang) {
        try {
            const result = await translate(text, { to: targetLang });
            return result.text;
        } catch (error) {
            console.error("Translation error:", error);
            return text;
        }
    }
}

module.exports = new LanguageManager();
