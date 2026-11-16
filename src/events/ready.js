const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('Vanilla Works PR', { type: ActivityType.Watching });

    // Poll expiration checker (every minute)
    setInterval(async () => {
      try {
        const { db } = require('../database');
        const now = new Date().toISOString();
        const expired = db.prepare(`
          SELECT * FROM polls WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= ?
        `).all(now);

        for (const poll of expired) {
          db.prepare(`UPDATE polls SET status = 'closed' WHERE id = ?`).run(poll.id);
          // Optionally update the message with final results
          try {
            const channel = await client.channels.fetch(poll.channel_id).catch(() => null);
            if (channel && poll.message_id) {
              const msg = await channel.messages.fetch(poll.message_id).catch(() => null);
              if (msg) {
                // Rebuild embed with closed status - simplified
                const embed = msg.embeds[0];
                if (embed) {
                  const newEmbed = EmbedBuilder.from(embed)
                    .setColor(0x95A5A6)
                    .setFooter({ text: 'Poll closed • Vanilla Works | Public Relations' });
                  await msg.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (err) {
        console.error('Poll checker error:', err);
      }
    }, 60 * 1000);
  }
};

const { EmbedBuilder } = require('discord.js');
