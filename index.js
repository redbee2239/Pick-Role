const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const http = require('http');
const https = require('https');
const config = require('./config.json');

const TOKEN = process.env.TOKEN || config.token;
const PING_URL = process.env.PING_URL;
const allowedRoles = process.env.ALLOWED_ROLES
  ? process.env.ALLOWED_ROLES.split(',').map(s => s.trim())
  : config.allowedRoles || [];
const allowedChannels = process.env.ALLOWED_CHANNELS
  ? process.env.ALLOWED_CHANNELS.split(',').map(s => s.trim())
  : config.allowedChannels || [];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function getEmoji(guild, key) {
  if (/[\u{1F000}-\u{1FFFF}]/u.test(key)) return key;
  return guild.emojis.cache.find(e => e.name === key) || null;
}

function getEmojiDisplay(guild, key) {
  if (/[\u{1F000}-\u{1FFFF}]/u.test(key)) return key;
  const emoji = guild.emojis.cache.find(e => e.name === key);
  return emoji ? emoji.toString() : `:${key}:`;
}

client.once('ready', async () => {
  console.log(`✅ Bot đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('role')
      .setDescription('Chọn role bằng button'),
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash command /role đã được đăng ký.');
  } catch (err) {
    console.error('❌ Lỗi đăng ký slash command:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'role') {
      if (allowedChannels.length) {
        const isAllowed = allowedChannels.some(
          id => id === interaction.channel.id || id === interaction.channel.name
        );
        if (!isAllowed) {
          return interaction.reply({ content: '❌ Bạn không thể dùng lệnh này ở đây.', flags: 64 });
        }
      }

      if (allowedRoles.length) {
        const hasRole = interaction.member.roles.cache.some(r =>
          allowedRoles.includes(r.name) || allowedRoles.includes(r.id)
        );
        if (!hasRole) {
          return interaction.reply({ content: '❌ Bạn không có quyền sử dụng lệnh này.', flags: 64 });
        }
      }

      const entries = Object.entries(config.roles);
      if (!entries.length) {
        return interaction.reply({ content: '❌ Không có role nào được cấu hình.', flags: 64 });
      }

      const lines = [];
      for (let i = 0; i < entries.length; i += 2) {
        const [key1, name1] = entries[i];
        const emoji1 = getEmojiDisplay(interaction.guild, key1);

        if (entries[i + 1]) {
          const [key2, name2] = entries[i + 1];
          const emoji2 = getEmojiDisplay(interaction.guild, key2);
          lines.push(`${emoji1} **${name1}**\u2003\u2003\u2003${emoji2} **${name2}**`);
        } else {
          lines.push(`${emoji1} **${name1}**`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🎯 Chọn Role Của Bạn')
        .setDescription('Bấm nút bên dưới để nhận/gỡ role.\n\n' + lines.join('\n\n'))
        .setColor(0x5865F2)
        .setFooter({ text: 'PickRole Bot' })
        .setTimestamp();

      const row = new ActionRowBuilder();
      for (const [key, roleName] of entries) {
        const emoji = getEmoji(interaction.guild, key);
        const button = new ButtonBuilder()
          .setCustomId(`role_${key}`)
          .setLabel(roleName)
          .setStyle(ButtonStyle.Secondary);
        if (emoji) button.setEmoji(emoji.id || emoji);
        row.addComponents(button);
      }

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (interaction.isButton() && interaction.customId.startsWith('role_')) {
      const key = interaction.customId.replace('role_', '');
      const roleName = config.roles[key];
      if (!roleName) return;

      const member = interaction.member;
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      if (!role) {
        return interaction.reply({ content: `❌ Role **${roleName}** không tồn tại trên server.`, flags: 64 });
      }

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        const msg = await interaction.reply({ content: `🗑️ Đã gỡ role **${roleName}**.`, flags: 64 });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
      } else {
        await member.roles.add(role);
        const msg = await interaction.reply({ content: `✅ Đã thêm role **${roleName}**.`, flags: 64 });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      interaction.followUp({ content: `❌ Lỗi: ${err.message}`, flags: 64 }).catch(() => {});
    } else {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, flags: 64 }).catch(() => {});
    }
  }
});

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
}).listen(PORT, () => {
  console.log(`🌐 HTTP server đang chạy trên port ${PORT}`);
});

if (PING_URL) {
  const pingModule = PING_URL.startsWith('https') ? https : http;
  setInterval(() => {
    pingModule.get(PING_URL, (res) => {
      console.log(`📡 Ping: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error('❌ Ping error:', err.message);
    });
  }, 5 * 60 * 1000);
  console.log(`🔗 Self-ping mỗi 5 phút: ${PING_URL}`);
}

client.on('guildMemberAdd', async (member) => {
  try {
    const channelName = allowedChannels[0] || 'role-selection';
    await member.send(
      `👋 Chào mừng **${member.user.username}** đến với **${member.guild.name}**!\n\n` +
      `Vào kênh <#${member.guild.channels.cache.find(c => c.name === channelName || c.id === channelName)?.id || channelName}> để chọn role nhé!`
    );
  } catch (err) {
    console.error('❌ Không thể gửi DM cho:', member.user.tag, err.message);
  }
});

client.login(TOKEN);
