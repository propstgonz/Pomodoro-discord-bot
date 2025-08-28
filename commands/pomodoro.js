const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const POMODORO_FILE = path.join(DATA_DIR, 'pomodoros.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(POMODORO_FILE)) fs.writeFileSync(POMODORO_FILE, '{}');

let activePomodoros = {};
try {
    activePomodoros = JSON.parse(fs.readFileSync(POMODORO_FILE));
} catch {}

function savePomodoros() {
    fs.writeFileSync(POMODORO_FILE, JSON.stringify(activePomodoros, null, 2));
}

const timers = {};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pomodoro')
        .setDescription('Start or stop your personal Pomodoro timer.')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Start or stop your Pomodoro')
                .setRequired(true)
                .addChoices(
                    { name: 'start', value: 'start' },
                    { name: 'stop', value: 'stop' }
                )
        )
        .addIntegerOption(option =>
            option.setName('cycles')
                .setDescription('Number of Pomodoro cycles you want to complete')
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const action = interaction.options.getString('action');

        if (action === 'stop') {
            if (activePomodoros[userId]) {
                clearTimeout(timers[userId]?.workTimer);
                clearTimeout(timers[userId]?.breakTimer);
                delete activePomodoros[userId];
                delete timers[userId];
                savePomodoros();
                await interaction.reply(`Your Pomodoro timer has been stopped, <@${userId}>.`);
            } else {
                await interaction.reply(`You don't have an active Pomodoro, <@${userId}>.`);
            }
            return;
        }

        const totalCycles = interaction.options.getInteger('cycles') || 1;

        if (activePomodoros[userId]) {
            return interaction.reply(`You already have an active Pomodoro, <@${userId}>.`);
        }

        await interaction.reply(`Pomodoro started! I will notify you every 50 minutes of work with 10 minutes of break. Total cycles: ${totalCycles}.`);

        activePomodoros[userId] = {
            totalCycles,
            currentCycle: 0,
            phase: 'work',
            startTime: Date.now()
        };
        savePomodoros();

        const startCycle = () => {
            const state = activePomodoros[userId];
            if (!state) return;

            if (state.currentCycle >= state.totalCycles) {
                interaction.followUp(`All Pomodoro cycles completed, <@${userId}>!`);
                delete activePomodoros[userId];
                clearTimeout(timers[userId]?.workTimer);
                clearTimeout(timers[userId]?.breakTimer);
                delete timers[userId];
                savePomodoros();
                return;
            }

            if (state.phase === 'work') {
                state.currentCycle++;
                state.phase = 'break';
                state.startTime = Date.now();
                savePomodoros();

                interaction.followUp(`Cycle ${state.currentCycle}/${state.totalCycles}: 50 minutes of focus, <@${userId}>!`);

                const workTimer = setTimeout(() => startCycle(), 50 * 60 * 1000);
                timers[userId] = { workTimer, breakTimer: null };

            } else if (state.phase === 'break') {
                state.phase = 'work';
                state.startTime = Date.now();
                savePomodoros();

                interaction.followUp(`🎉 Break time! 10 minutes to relax, <@${userId}>.`);

                const breakTimer = setTimeout(() => startCycle(), 10 * 60 * 1000);
                timers[userId] = { workTimer: null, breakTimer };
            }
        };

        startCycle();
    },

    restoreTimers: async (client) => {
        for (const [userId, state] of Object.entries(activePomodoros)) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) continue;

            const elapsed = Date.now() - state.startTime;
            let remaining;

            if (state.phase === 'work') {
                remaining = 50 * 60 * 1000 - elapsed;
                if (remaining < 0) remaining = 0;
            } else {
                remaining = 10 * 60 * 1000 - elapsed;
                if (remaining < 0) remaining = 0;
            }

            timers[userId] = setTimeout(function cycle() {
                if (!activePomodoros[userId]) return;

                const s = activePomodoros[userId];
                if (s.phase === 'work') {
                    s.phase = 'break';
                    s.startTime = Date.now();
                    savePomodoros();
                    user.send(`Cycle ${s.currentCycle}/${s.totalCycles}: Break time! 🎉`);
                    timers[userId] = setTimeout(cycle, 10 * 60 * 1000);
                } else {
                    s.currentCycle++;
                    if (s.currentCycle > s.totalCycles) {
                        user.send(`All Pomodoro cycles completed!`);
                        delete activePomodoros[userId];
                        delete timers[userId];
                        savePomodoros();
                        return;
                    }
                    s.phase = 'work';
                    s.startTime = Date.now();
                    savePomodoros();
                    user.send(`Cycle ${s.currentCycle}/${s.totalCycles}: 50 minutes of focus!`);
                    timers[userId] = setTimeout(cycle, 50 * 60 * 1000);
                }
            }, remaining);
        }
    }
};
