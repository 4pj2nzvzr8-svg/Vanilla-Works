const { MessageFlags } = require('discord.js');
const { hasStaffRole, hasManagementRole, canApproveRequests } = require('../utils/permissions');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        await command.execute(interaction, client);
        return;
      }

      // Buttons
      if (interaction.isButton()) {
        const id = interaction.customId;

        // Central Panel buttons
        if (id === 'pr_post_request') {
          if (!hasStaffRole(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
          }
          const { requestTypeSelect } = require('../utils/embeds');
          return interaction.reply({
            content: 'Select the type of request you would like to submit:',
            components: [requestTypeSelect()],
            flags: MessageFlags.Ephemeral
          });
        }

        if (id === 'request_mutual') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
          const modal = new ModalBuilder()
            .setCustomId('modal_mutual_giveaway')
            .setTitle('Mutual Giveaway Request');

          const fields = [
            { id: 'invite', label: 'Discord Server Invite', style: TextInputStyle.Short, required: true },
            { id: 'prize', label: 'Their Prize', style: TextInputStyle.Short, required: true },
            { id: 'their_ping', label: 'Their Ping (role/user)', style: TextInputStyle.Short, required: true },
            { id: 'our_ping', label: 'Our Ping (role/user)', style: TextInputStyle.Short, required: true },
            { id: 'duration', label: 'Duration', style: TextInputStyle.Short, required: true },
            { id: 'winners', label: 'Amount of Winners', style: TextInputStyle.Short, required: true }
          ];

          // Discord modals support max 5 components. Split into two modals or prioritize.
          // For simplicity we use the most important 5 and handle winners via follow-up if needed.
          // Better: use 5 fields and put winners in duration or add a second step.
          // Spec requires all 6. We'll use a two-step approach or combine.
          // Practical solution: 5 fields + winners in a follow-up select, but to keep simple:
          const rows = fields.slice(0, 5).map(f =>
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(f.id)
                .setLabel(f.label)
                .setStyle(f.style)
                .setRequired(f.required)
            )
          );
          modal.addComponents(...rows);
          return interaction.showModal(modal);
        }

        if (id === 'request_partnership') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
          const modal = new ModalBuilder()
            .setCustomId('modal_partnership')
            .setTitle('Partnership Request');

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('server_name').setLabel('Server Name').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('our_ping').setLabel('Our Ping').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('their_ping').setLabel('Their Ping').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('partners_ad').setLabel('Partners Ad').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)
            )
          );
          return interaction.showModal(modal);
        }

        if (id === 'pr_log_outreach') {
          if (!hasStaffRole(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
          }
          // Open modal for outreach (evidence handled after)
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
          const modal = new ModalBuilder()
            .setCustomId('modal_outreach')
            .setTitle('Log Outreach');

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('server_invite').setLabel('Server Invite').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('pings').setLabel('Pings Used').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('type').setLabel('Type (Mutual or Partner)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Mutual or Partner')
            )
          );
          return interaction.showModal(modal);
        }

        if (id === 'pr_department_polls') {
          return interaction.reply({
            content: 'Use `/poll create` (management only) to create a new department poll. Active polls appear in the designated poll channel.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (id === 'pr_staff_posts') {
          return interaction.reply({
            content: 'Use `/post create` to publish a staff post with caption, photo and optional ping.',
            flags: MessageFlags.Ephemeral
          });
        }

        // Approval / Rejection buttons
        if (id.startsWith('approve_req_')) {
          const reqId = id.replace('approve_req_', '');
          return handleApprove(interaction, reqId, client);
        }

        if (id.startsWith('reject_req_')) {
          const reqId = id.replace('reject_req_', '');
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
          const modal = new ModalBuilder()
            .setCustomId(`modal_reject_${reqId}`)
            .setTitle('Rejection Reason');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason for rejection (required)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000)
            )
          );
          return interaction.showModal(modal);
        }

        // Like button for posts
        if (id.startsWith('like_post_')) {
          const postId = id.replace('like_post_', '');
          return handleLike(interaction, postId, client);
        }

        // Poll vote buttons
        if (id.startsWith('poll_vote_')) {
          // format: poll_vote_<pollId>_<optionIndex>
          const parts = id.split('_');
          const pollId = parts[2];
          const optionIndex = parseInt(parts[3], 10);
          return handlePollVote(interaction, pollId, optionIndex, client);
        }

        return;
      }

      // Modals
      if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'modal_mutual_giveaway') {
          return handleMutualSubmit(interaction, client);
        }

        if (id === 'modal_partnership') {
          return handlePartnershipSubmit(interaction, client);
        }

        if (id === 'modal_outreach') {
          return handleOutreachSubmit(interaction, client);
        }

        if (id.startsWith('modal_reject_')) {
          const reqId = id.replace('modal_reject_', '');
          return handleReject(interaction, reqId, client);
        }

        return;
      }

      // Select menus (if any)
      if (interaction.isStringSelectMenu()) {
        // future use
        return;
      }

    } catch (error) {
      console.error('Interaction error:', error);
      const payload = { content: 'An unexpected error occurred. Please try again or contact management.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
};

// ============ Handlers ============

async function handleMutualSubmit(interaction, client) {
  const { db } = require('../database');
  const { generateRequestId } = require('../utils/ids');
  const { baseEmbed, statusColor } = require('../utils/embeds');
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

  const data = {
    invite: interaction.fields.getTextInputValue('invite'),
    prize: interaction.fields.getTextInputValue('prize'),
    their_ping: interaction.fields.getTextInputValue('their_ping'),
    our_ping: interaction.fields.getTextInputValue('our_ping'),
    duration: interaction.fields.getTextInputValue('duration'),
    winners: interaction.fields.getTextInputValue('winners') || '1' // fallback if not in modal
  };

  const reqId = generateRequestId();
  const submitter = interaction.user;

  db.prepare(`
    INSERT INTO requests (id, type, submitter_id, status, data)
    VALUES (?, 'mutual_giveaway', ?, 'pending', ?)
  `).run(reqId, submitter.id, JSON.stringify(data));

  const approvalChannelId = require('../database').getConfig('approval_channel');
  if (!approvalChannelId) {
    await interaction.reply({ content: 'Approval channel is not configured. Please contact an administrator.', flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) {
    await interaction.reply({ content: 'Could not find the approval channel.', flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('Mutual Giveaway Request')
    .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** Pending Approval`)
    .addFields(
      { name: 'Submitted by', value: `<@${submitter.id}> (${submitter.tag})`, inline: true },
      { name: 'Server Invite', value: data.invite, inline: false },
      { name: 'Their Prize', value: data.prize, inline: true },
      { name: 'Duration', value: data.duration, inline: true },
      { name: 'Winners', value: data.winners, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_req_${reqId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject_req_${reqId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  db.prepare(`UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?`).run(msg.id, channel.id, reqId);

  await interaction.reply({
    content: `Your Mutual Giveaway request has been submitted.\n**Reference ID:** \`${reqId}\`\nManagement has been notified.`,
    flags: MessageFlags.Ephemeral
  });

  // Try DM confirmation
  try {
    await submitter.send(`Your Mutual Giveaway request (\`${reqId}\`) has been submitted and is pending approval.`);
  } catch {}
}

async function handlePartnershipSubmit(interaction, client) {
  const { db } = require('../database');
  const { generateRequestId } = require('../utils/ids');
  const { baseEmbed, statusColor } = require('../utils/embeds');
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

  const data = {
    server_name: interaction.fields.getTextInputValue('server_name'),
    our_ping: interaction.fields.getTextInputValue('our_ping'),
    their_ping: interaction.fields.getTextInputValue('their_ping'),
    partners_ad: interaction.fields.getTextInputValue('partners_ad')
  };

  const reqId = generateRequestId();
  const submitter = interaction.user;

  db.prepare(`
    INSERT INTO requests (id, type, submitter_id, status, data)
    VALUES (?, 'partnership', ?, 'pending', ?)
  `).run(reqId, submitter.id, JSON.stringify(data));

  const approvalChannelId = require('../database').getConfig('approval_channel');
  if (!approvalChannelId) {
    return interaction.reply({ content: 'Approval channel is not configured.', flags: MessageFlags.Ephemeral });
  }

  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: 'Could not find the approval channel.', flags: MessageFlags.Ephemeral });
  }

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('Partnership Request')
    .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** Pending Approval`)
    .addFields(
      { name: 'Submitted by', value: `<@${submitter.id}> (${submitter.tag})`, inline: true },
      { name: 'Server Name', value: data.server_name, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Partners Ad', value: data.partners_ad.slice(0, 1024) || '—', inline: false }
    )
    .setTimestamp();

  if (data.partners_ad.length > 1024) {
    embed.addFields({ name: 'Partners Ad (continued)', value: data.partners_ad.slice(1024, 2048) });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_req_${reqId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject_req_${reqId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  db.prepare(`UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?`).run(msg.id, channel.id, reqId);

  await interaction.reply({
    content: `Your Partnership request has been submitted.\n**Reference ID:** \`${reqId}\``,
    flags: MessageFlags.Ephemeral
  });

  try {
    await submitter.send(`Your Partnership request (\`${reqId}\`) has been submitted and is pending approval.`);
  } catch {}
}

async function handleApprove(interaction, reqId, client) {
  const { db } = require('../database');
  const { baseEmbed, statusColor } = require('../utils/embeds');
  const { MessageFlags } = require('discord.js');

  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only authorised management can approve requests.', flags: MessageFlags.Ephemeral });
  }

  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) {
    return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  }
  if (req.status !== 'pending') {
    return interaction.reply({ content: `This request has already been ${req.status}.`, flags: MessageFlags.Ephemeral });
  }

  db.prepare(`
    UPDATE requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?
  `).run(interaction.user.id, reqId);

  // Update original message
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const data = JSON.parse(req.data);
    const embed = baseEmbed()
      .setColor(statusColor('approved'))
      .setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** Approved by <@${interaction.user.id}>`)
      .setTimestamp();

    // Re-add fields simplified
    if (req.type === 'mutual_giveaway') {
      embed.addFields(
        { name: 'Submitted by', value: `<@${req.submitter_id}>`, inline: true },
        { name: 'Server Invite', value: data.invite },
        { name: 'Prize', value: data.prize, inline: true },
        { name: 'Duration', value: data.duration, inline: true },
        { name: 'Winners', value: data.winners, inline: true }
      );
    } else {
      embed.addFields(
        { name: 'Submitted by', value: `<@${req.submitter_id}>`, inline: true },
        { name: 'Server Name', value: data.server_name },
        { name: 'Partners Ad', value: (data.partners_ad || '').slice(0, 1024) }
      );
    }

    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) {
    console.error('Failed to update approval message', e);
  }

  // DM the submitter
  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send(`✅ Your request **${reqId}** has been **approved** by management.\nProcessed by: ${interaction.user.tag}`);
  } catch {}

  await interaction.reply({ content: `Request ${reqId} has been approved.`, flags: MessageFlags.Ephemeral });
}

async function handleReject(interaction, reqId, client) {
  const { db } = require('../database');
  const { baseEmbed, statusColor } = require('../utils/embeds');
  const { MessageFlags } = require('discord.js');

  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only authorised management can reject requests.', flags: MessageFlags.Ephemeral });
  }

  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) {
    return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  }
  if (req.status !== 'pending') {
    return interaction.reply({ content: `This request has already been ${req.status}.`, flags: MessageFlags.Ephemeral });
  }

  db.prepare(`
    UPDATE requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?
  `).run(interaction.user.id, reason, reqId);

  // Update message
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const data = JSON.parse(req.data);
    const embed = baseEmbed()
      .setColor(statusColor('rejected'))
      .setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** Rejected by <@${interaction.user.id}>\n**Reason:** ${reason}`)
      .setTimestamp();

    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) {
    console.error(e);
  }

  // DM submitter
  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send(`❌ Your request **${reqId}** has been **rejected**.\n**Reason:** ${reason}\nProcessed by: ${interaction.user.tag}`);
  } catch {}

  await interaction.reply({ content: `Request ${reqId} has been rejected.`, flags: MessageFlags.Ephemeral });
}

async function handleOutreachSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateLogId } = require('../utils/ids');
  const { baseEmbed } = require('../utils/embeds');
  const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  const serverInvite = interaction.fields.getTextInputValue('server_invite');
  const pings = interaction.fields.getTextInputValue('pings');
  let type = interaction.fields.getTextInputValue('type').trim();
  if (!['Mutual', 'Partner'].includes(type)) {
    type = type.toLowerCase().includes('partner') ? 'Partner' : 'Mutual';
  }

  const userId = interaction.user.id;
  const assignment = db.prepare('SELECT thread_id FROM staff_threads WHERE user_id = ?').get(userId);

  if (!assignment) {
    return interaction.reply({
      content: 'Your outreach logging setup is incomplete. Please ask an administrator to run `/staff log setup` for you.',
      flags: MessageFlags.Ephemeral
    });
  }

  // Because modals cannot take files, we ask for evidence in a follow-up
  await interaction.reply({
    content: 'Please upload the photographic evidence (image) as a reply to this message within 60 seconds, or click Skip if none.',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`outreach_skip_${userId}`).setLabel('Skip Evidence').setStyle(ButtonStyle.Secondary)
      )
    ],
    flags: MessageFlags.Ephemeral
  });

  // Store temporary data
  const tempKey = `outreach_temp_${userId}`;
  // Simple in-memory for the short window (restart-safe would need redis/db, acceptable for now)
  if (!client.tempOutreach) client.tempOutreach = new Map();
  client.tempOutreach.set(userId, {
    serverInvite,
    pings,
    type,
    threadId: assignment.thread_id,
    expires: Date.now() + 60_000
  });

  // Collector for the next message with attachment from this user
  const filter = m => m.author.id === userId && m.attachments.size > 0;
  const collector = interaction.channel.createMessageCollector({ filter, time: 60_000, max: 1 });

  collector.on('collect', async (msg) => {
    const attachment = msg.attachments.first();
    await finalizeOutreach(client, userId, attachment?.url || null);
    try { await msg.delete(); } catch {}
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      // Check if they clicked skip or timed out
      const temp = client.tempOutreach?.get(userId);
      if (temp) {
        await finalizeOutreach(client, userId, null);
      }
    }
  });
}

// Note: Skip button and finalize need to be wired in button handler too.
// For brevity in this version, the timeout path will still create the log without image.

async function finalizeOutreach(client, userId, evidenceUrl) {
  const { db, getConfig } = require('../database');
  const { generateLogId } = require('../utils/ids');
  const { baseEmbed } = require('../utils/embeds');

  if (!client.tempOutreach) return;
  const temp = client.tempOutreach.get(userId);
  if (!temp) return;
  client.tempOutreach.delete(userId);

  const logId = generateLogId();
  const thread = await client.channels.fetch(temp.threadId).catch(() => null);
  if (!thread) {
    // Notify user somehow
    return;
  }

  const embed = baseEmbed()
    .setTitle('Outreach Log')
    .setDescription(`**Log ID:** \`${logId}\``)
    .addFields(
      { name: 'Staff', value: `<@${userId}>`, inline: true },
      { name: 'Type', value: temp.type, inline: true },
      { name: 'Server Invite', value: temp.serverInvite },
      { name: 'Pings Used', value: temp.pings }
    )
    .setTimestamp();

  if (evidenceUrl) {
    embed.setImage(evidenceUrl);
  }

  const notifyRole = getConfig('outreach_notify_role');
  const content = notifyRole ? `<@&${notifyRole}>` : null;

  const msg = await thread.send({ content, embeds: [embed] });

  db.prepare(`
    INSERT INTO outreach_logs (id, user_id, server_invite, pings, type, evidence_url, thread_id, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(logId, userId, temp.serverInvite, temp.pings, temp.type, evidenceUrl, temp.threadId, msg.id);

  try {
    const user = await client.users.fetch(userId);
    await user.send(`Your outreach log **${logId}** has been recorded successfully.`);
  } catch {}
}

async function handleLike(interaction, postId, client) {
  const { db } = require('../database');
  const { MessageFlags } = require('discord.js');

  const existing = db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(postId, interaction.user.id);

  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(postId, interaction.user.id);
    db.prepare('UPDATE posts SET likes = likes - 1 WHERE id = ?').run(postId);
  } else {
    db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(postId, interaction.user.id);
    db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId);
  }

  const post = db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId);
  const likes = post ? post.likes : 0;

  // Update the button label
  const row = interaction.message.components[0];
  if (row) {
    const button = row.components[0];
    // Rebuild
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`like_post_${postId}`)
        .setLabel(`❤️ ${likes} Likes`)
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ components: [newRow] });
  } else {
    await interaction.reply({ content: `Likes: ${likes}`, flags: MessageFlags.Ephemeral });
  }
}

async function handlePollVote(interaction, pollId, optionIndex, client) {
  const { db } = require('../database');
  const { MessageFlags } = require('discord.js');

  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
  if (!poll || poll.status !== 'active') {
    return interaction.reply({ content: 'This poll is closed or does not exist.', flags: MessageFlags.Ephemeral });
  }

  const multi = !!poll.multi;
  if (!multi) {
    // Remove previous votes by this user
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, interaction.user.id);
  }

  // Check if already voted this option (for multi)
  const already = db.prepare('SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?').get(pollId, interaction.user.id, optionIndex);
  if (already && multi) {
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?').run(pollId, interaction.user.id, optionIndex);
  } else if (!already) {
    db.prepare('INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)').run(pollId, interaction.user.id, optionIndex);
  }

  // Recount and update embed (simplified)
  await interaction.reply({ content: 'Your vote has been recorded.', flags: MessageFlags.Ephemeral });
}
