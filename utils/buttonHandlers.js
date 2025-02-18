const { ButtonInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const lotteryManager = require('./lotteryManager');
const messageTemplates = require('./messageTemplates');
const notificationManager = require('./notificationManager');
const skullManager = require('./skullManager');

async function handleButton(interaction) {
    const [action, lotteryId, quantity] = interaction.customId.split('_');

    try {
        switch (action) {
            case 'ticket':
                await handleTicketSelection(interaction, lotteryId, parseInt(quantity));
                break;
            case 'confirm':
                await handleConfirmLottery(interaction, lotteryId);
                break;
            case 'cancel':
                await handleCancelLottery(interaction, lotteryId);
                break;
            case 'join':
                await handleJoinLottery(interaction, lotteryId);
                break;
            case 'view':
                await handleViewParticipants(interaction, lotteryId);
                break;
            case 'auto':
                await handleAutoDrawSetting(interaction, lotteryId);
                break;
            case 'manual':
                await handleManualDrawSetting(interaction, lotteryId);
                break;
        }
    } catch (error) {
        console.error('Button interaction error:', error);
        await interaction.reply({ 
            content: 'There was an error processing your request. Please try again.',
            ephemeral: true 
        }).catch(console.error);
    }
}

async function updateLotteryMessage(channel, messageId, lottery, includeButtons = true) {
    try {
        const message = await channel.messages.fetch(messageId);
        const updatedEmbed = messageTemplates.createLotteryEmbed(lottery);

        const components = [];
        if (includeButtons && lottery.status === 'active') {
            const joinButton = new ButtonBuilder()
                .setCustomId(`join_${lottery.id}`)
                .setLabel('🎟️ Join Lottery')
                .setStyle(ButtonStyle.Primary);

            const viewButton = new ButtonBuilder()
                .setCustomId(`view_${lottery.id}`)
                .setLabel('👥 View Participants')
                .setStyle(ButtonStyle.Secondary);

            components.push(new ActionRowBuilder().addComponents(joinButton, viewButton));
        }

        await message.edit({
            embeds: [updatedEmbed],
            components: components
        });
        return true;
    } catch (error) {
        console.error('Failed to update lottery message:', error);
        return false;
    }
}

async function handleConfirmLottery(interaction, lotteryId) {
    const lottery = lotteryManager.getLottery(lotteryId);
    if (!lottery) {
        await interaction.reply({ content: 'Lottery not found!', ephemeral: true });
        return;
    }

    if (lottery.isManualDraw === undefined) {
        await interaction.reply({ 
            content: 'Please select a draw method (Auto or Manual) before confirming.',
            ephemeral: true 
        });
        return;
    }

    lottery.status = 'active';
    const embed = messageTemplates.createLotteryEmbed(lottery);

    const joinButton = new ButtonBuilder()
        .setCustomId(`join_${lottery.id}`)
        .setLabel('🎟️ Join Lottery')
        .setStyle(ButtonStyle.Primary);

    const viewButton = new ButtonBuilder()
        .setCustomId(`view_${lottery.id}`)
        .setLabel('👥 View Participants')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(joinButton, viewButton);

    const message = await interaction.channel.send({
        embeds: [embed],
        components: [row]
    });

    lottery.messageId = message.id;
    lottery.channelId = interaction.channelId;

    // Schedule ending soon notification
    await notificationManager.scheduleEndingSoonNotification(lottery, interaction.client);

    await interaction.update({
        content: 'Lottery started successfully!',
        embeds: [],
        components: []
    });

    let updateInterval;
    const startUpdateTimer = () => {
        const timeRemaining = lottery.endTime - Date.now();
        let refreshRate = 30000; // Default 30 seconds

        // Dynamic refresh rates based on remaining time
        if (timeRemaining <= 60 * 60 * 1000) refreshRate = 15000; // Last hour: 15s
        if (timeRemaining <= 5 * 60 * 1000) refreshRate = 5000;   // Last 5 mins: 5s
        if (timeRemaining <= 60 * 1000) refreshRate = 1000;       // Last minute: 1s

        clearInterval(updateInterval);
        updateInterval = setInterval(async () => {
            if (lottery.status !== 'active') {
                clearInterval(updateInterval);
                return;
            }

            const success = await updateLotteryMessage(
                await interaction.client.channels.fetch(lottery.channelId),
                lottery.messageId,
                lottery
            );

            if (!success) {
                clearInterval(updateInterval);
            } else {
                startUpdateTimer(); // Recursively update with new refresh rate
            }
        }, refreshRate);
    };

    startUpdateTimer();

    if (!lottery.isManualDraw) {
        const endTime = lottery.endTime;
        const timeUntilEnd = endTime - Date.now();
        
        if (timeUntilEnd <= 0) {
            clearInterval(updateInterval);
            const channel = await interaction.client.channels.fetch(lottery.channelId);
            await handleAutoDrawEnd(channel, lottery, interaction.client);
        } else {
            setTimeout(async () => {
                clearInterval(updateInterval);
                if (lottery.status === 'active') {
                    const channel = await interaction.client.channels.fetch(lottery.channelId);
                    await handleAutoDrawEnd(channel, lottery, interaction.client);
                }
            }, timeUntilEnd);
        }tery.channelId);

                if (lottery.minParticipants && lottery.participants.size < lottery.minParticipants) {
                    if (channel) {
                        await updateLotteryMessage(channel, lottery.messageId, lottery, false);
                        await channel.send(`Lottery for ${lottery.prize} has ended with insufficient participants. Minimum required: ${lottery.minParticipants}`);
                        lotteryManager.cancelLottery(lotteryId);
                    }
                    return;
                }

                const winners = lotteryManager.drawWinners(lotteryId);
                if (channel && winners) {
                    const userMentions = new Map();
                    for (const winnerId of winners) {
                        try {
                            const user = await interaction.client.users.fetch(winnerId);
                            userMentions.set(winnerId, user.toString());
                            // Notify winner via DM
                            await notificationManager.notifyWinner(user, lottery, interaction.client);
                        } catch (error) {
                            console.error(`Failed to fetch user ${winnerId}:`, error);
                            userMentions.set(winnerId, 'Unknown User');
                        }
                    }

                    await updateLotteryMessage(channel, lottery.messageId, lottery, false);

                    await channel.send({
                        embeds: [
                            messageTemplates.createWinnerEmbed(lottery, winners, userMentions),
                            messageTemplates.createCongratulationsEmbed(lottery.prize, winners, userMentions)
                        ]
                    });
                }
            }
        }, lottery.endTime - Date.now());
    }
}

async function handleViewParticipants(interaction, lotteryId) {
    const lottery = lotteryManager.getLottery(lotteryId);
    if (!lottery || lottery.status !== 'active') {
        await interaction.reply({ content: 'This lottery is not active!', ephemeral: true });
        return;
    }

    const participantMentions = [];
    for (const [participantId] of lottery.participants) {
        try {
            const user = await interaction.client.users.fetch(participantId);
            participantMentions.push(user.toString());
        } catch (error) {
            console.error(`Failed to fetch user ${participantId}:`, error);
            participantMentions.push('Unknown User');
        }
    }

    const embed = messageTemplates.createParticipantsEmbed(lottery, participantMentions);
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAutoDrawSetting(interaction, lotteryId) {
    const lottery = lotteryManager.getLottery(lotteryId);
    if (!lottery) {
        await interaction.reply({ content: 'Lottery not found!', ephemeral: true });
        return;
    }

    lottery.isManualDraw = false;
    await interaction.reply({ 
        content: 'Auto draw enabled. Winners will be automatically selected when the timer ends.',
        ephemeral: true 
    });
}

async function handleManualDrawSetting(interaction, lotteryId) {
    const lottery = lotteryManager.getLottery(lotteryId);
    if (!lottery) {
        await interaction.reply({ content: 'Lottery not found!', ephemeral: true });
        return;
    }

    lottery.isManualDraw = true;
    await interaction.reply({ 
        content: 'Manual draw enabled. Use /draw command to select winners when ready.',
        ephemeral: true 
    });
}

async function handleCancelLottery(interaction, lotteryId) {
    const lottery = lotteryManager.getLottery(lotteryId);
    if (!lottery) {
        await interaction.reply({ content: 'Lottery not found!', ephemeral: true });
        return;
    }

    lotteryManager.cancelLottery(lotteryId);
    await interaction.update({
        content: 'Lottery cancelled.',
        embeds: [],
        components: []
    });
}

async function handleJoinLottery(interaction, lotteryId) {
    const lottery = lotteryManager.getLottery(lotteryId);
    if (!lottery || lottery.status !== 'active') {
        await interaction.reply({ content: 'This lottery is not active!', ephemeral: true });
        return;
    }

    // Skip skull check for /sd command lotteries (they're always free)
    if (lottery.ticketPrice > 0) {
        if (!skullManager.hasEnoughSkulls(interaction.user.id, lottery.ticketPrice)) {
            await interaction.reply({ 
                content: `You don't have enough skulls to join this lottery. Required: ${lottery.ticketPrice} skulls per ticket. Use /skulls balance to check your balance.`,
                ephemeral: true 
            });
            return;
        }
    }

    // If this is a raffle or ticket-based lottery, ask for ticket quantity
    if (lottery.ticketPrice > 0) {
        const maxAffordableTickets = Math.floor(skullManager.getBalance(interaction.user.id) / lottery.ticketPrice);
        const actualMaxTickets = Math.min(maxAffordableTickets, lottery.maxTicketsPerUser);

        // Create buttons for different ticket quantities
        const buttons = [];
        for (let i = 1; i <= Math.min(5, actualMaxTickets); i++) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`ticket_${lottery.id}_${i}`)
                    .setLabel(`${i} ticket${i > 1 ? 's' : ''} (${i * lottery.ticketPrice} skulls)`)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        if (actualMaxTickets > 5) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`ticket_${lottery.id}_${actualMaxTickets}`)
                    .setLabel(`${actualMaxTickets} tickets (${actualMaxTickets * lottery.ticketPrice} skulls)`)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        const row = new ActionRowBuilder().addComponents(buttons);

        await interaction.reply({
            content: `How many tickets would you like to purchase? (${lottery.ticketPrice} skulls per ticket)`,
            components: [row],
            ephemeral: true
        });
        return;
    }

    // For free entries (ticketPrice = 0)
    const success = lotteryManager.addParticipant(lotteryId, interaction.user.id);
    if (success) {
        await interaction.reply({ content: 'You have joined the lottery!', ephemeral: true });
        // Send DM confirmation
        await notificationManager.sendJoinConfirmation(interaction.user, lottery);
    } else {
        await interaction.reply({ content: 'You are already participating in this lottery!', ephemeral: true });
    }
}

async function handleTicketSelection(interaction, lotteryId, quantity) {
    const lottery = lotteryManager.getLottery(lotteryId);
    if (!lottery || lottery.status !== 'active') {
        await interaction.reply({ content: 'This lottery is not active!', ephemeral: true });
        return;
    }

    const totalCost = quantity * lottery.ticketPrice;
    if (!skullManager.hasEnoughSkulls(interaction.user.id, totalCost)) {
        await interaction.reply({ 
            content: `You don't have enough skulls to purchase ${quantity} tickets. Required: ${totalCost} skulls.`,
            ephemeral: true 
        });
        return;
    }

    // Remove skulls and add participant with tickets
    const success = skullManager.removeSkulls(interaction.user.id, totalCost);
    if (success) {
        const joined = lotteryManager.addParticipant(lotteryId, interaction.user.id, quantity);
        if (joined) {
            await interaction.reply({ 
                content: `Successfully purchased ${quantity} ticket${quantity > 1 ? 's' : ''} for ${totalCost} skulls!`,
                ephemeral: true 
            });
            // Send DM confirmation
            await notificationManager.sendJoinConfirmation(interaction.user, lottery);
        } else {
            // Refund skulls if joining fails
            skullManager.addSkulls(interaction.user.id, totalCost);
            await interaction.reply({ 
                content: 'You are already participating in this lottery!',
                ephemeral: true 
            });
        }
    } else {
        await interaction.reply({ 
            content: 'Failed to process ticket purchase. Please try again.',
            ephemeral: true 
        });
    }
}

module.exports = {
    handleButton
};
async function handleAutoDrawEnd(channel, lottery, client) {
    if (!channel || lottery.status !== 'active') return;

    if (lottery.minParticipants && lottery.participants.size < lottery.minParticipants) {
        await updateLotteryMessage(channel, lottery.messageId, lottery, false);
        await channel.send(`Lottery for ${lottery.prize} has ended with insufficient participants. Minimum required: ${lottery.minParticipants}`);
        lotteryManager.cancelLottery(lottery.id);
        return;
    }

    const winners = lotteryManager.drawWinners(lottery.id);
    if (winners) {
        const userMentions = new Map();
        for (const winnerId of winners) {
            try {
                const user = await client.users.fetch(winnerId);
                userMentions.set(winnerId, user.toString());
                await notificationManager.notifyWinner(user, lottery, client);
            } catch (error) {
                console.error(`Failed to fetch user ${winnerId}:`, error);
                userMentions.set(winnerId, 'Unknown User');
            }
        }

        await updateLotteryMessage(channel, lottery.messageId, lottery, false);
        await channel.send({
            embeds: [
                messageTemplates.createWinnerEmbed(lottery, winners, userMentions),
                messageTemplates.createCongratulationsEmbed(lottery.prize, winners, userMentions)
            ]
        });
    }
}
