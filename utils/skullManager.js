
const { Collection } = require('discord.js');
const dataManager = require('./dataManager');

class SkullManager {
    constructor() {
        this.userBalances = new Collection();
        this.loadData();
        
        // Save data every 2 minutes
        setInterval(() => this.saveData(), 2 * 60 * 1000);
        
        // Restore data on startup
        this.restoreData();
    }

    loadData() {
        try {
            const data = dataManager.loadData('skulls.json');
            if (data) {
                Object.entries(data).forEach(([userId, balance]) => {
                    this.userBalances.set(userId, balance);
                });
            }
        } catch (error) {
            console.error('Error loading skull data:', error);
        }
    }

    saveData() {
        try {
            const data = Object.fromEntries(this.userBalances);
            dataManager.saveData('skulls.json', data);
        } catch (error) {
            console.error('Error saving skull data:', error);
        }
    }

    async restoreData() {
        try {
            await dataManager.pullFromGitHub();
            this.loadData();
            console.log('✅ Skull data restored from GitHub');
        } catch (error) {
            console.error('❌ Failed to restore skull data:', error);
        }
    }

    getBalance(userId) {
        return this.userBalances.get(userId) || 0;
    }

    addSkulls(userId, amount) {
        const currentBalance = this.getBalance(userId);
        this.userBalances.set(userId, currentBalance + amount);
        this.saveData();
        return this.getBalance(userId);
    }

    removeSkulls(userId, amount) {
        const currentBalance = this.getBalance(userId);
        if (currentBalance < amount) {
            return false;
        }
        this.userBalances.set(userId, currentBalance - amount);
        this.saveData();
        return true;
    }

    hasEnoughSkulls(userId, amount) {
        return this.getBalance(userId) >= amount;
    }

    transferSkulls(fromUserId, toUserId, amount) {
        if (!this.hasEnoughSkulls(fromUserId, amount)) {
            return false;
        }

        const success = this.removeSkulls(fromUserId, amount);
        if (success) {
            this.addSkulls(toUserId, amount);
            return true;
        }
        return false;
    }
}

module.exports = new SkullManager();
