const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TIMER_FILE = path.join(DATA_DIR, 'timers.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(TIMER_FILE)) fs.writeFileSync(TIMER_FILE, '{}');

let activeTimers = {};
try {
    activeTimers = JSON.parse(fs.readFileSync(TIMER_FILE));
} catch {}

function saveTimers() {
    fs.writeFileSync(TIMER_FILE, JSON.stringify(activeTimers, null, 2));
}

const timers = {};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('focus-timer')
        .setDescription('Manage your recurring focus ping every 15 minutes.')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Start, stop, or check status of your focus timer')
                .setRequired(true)
                .addChoices(
                    { name: 'start', value: 'start' },
                    { name: 'stop', value: 'stop' },
                    { name: 'status', value: 'status' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const action = interaction.options.getString('action');
        const interval = 15 * 60 * 1000;

        if (action === 'stop') {
            if (activeTimers[userId]) {
                clearTimeout(timers[userId]);
                delete activeTimers[userId];
                delete timers[userId];
                saveTimers();
                await interaction.reply(`Your focus timer has been stopped, <@${userId}>.`);
            } else {
                await interaction.reply(`You don't have an active focus timer, <@${userId}>.`);
            }
            return;
        }

        if (action === 'status') {
            if (!activeTimers[userId]) {
                return interaction.reply(`You don't have an active focus timer, <@${userId}>.`);
            }
            const elapsed = Date.now() - activeTimers[userId].startTime;
            const remaining = interval - (elapsed % interval);
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            await interaction.reply(`Next focus ping in ${minutes}m ${seconds}s, <@${userId}>.`);
            return;
        }

        if (activeTimers[userId]) {
            return interaction.reply(`You already have an active focus timer, <@${userId}>.`);
        }

        await interaction.reply(`Focus timer started! You will receive a reminder every 15 minutes, <@${userId}>.`);

        activeTimers[userId] = { startTime: Date.now() };
        saveTimers();

        const sendPing = async () => {
            try {
                const user = await interaction.client.users.fetch(userId);
                if (user) user.send(`Stay focused! 🧘‍♂️`);
            } catch {}
            timers[userId] = setTimeout(sendPing, interval);
        };

        timers[userId] = setTimeout(sendPing, interval);
    },

    restoreTimers: async (client) => {
        const interval = 15 * 60 * 1000;
        for (const [userId, state] of Object.entries(activeTimers)) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) continue;

            const elapsed = Date.now() - state.startTime;
            const remaining = interval - (elapsed % interval);

            const sendPing = async () => {
                try { if (user) user.send(`Stay focused! 🧘‍♂️`); } catch {}
                timers[userId] = setTimeout(sendPing, interval);
            };

            timers[userId] = setTimeout(sendPing, remaining);
        }
    }
};
