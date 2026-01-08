require('dotenv').config();
const fs = require('fs');
const express = require('express'); // Pour Render
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= CONFIG =================
const OWNER_ID = '843136143491203072';
const GUILD_ID = '1458505788816494713'; // Serveur pour test commandes

const ADMIN_ROLE = '🛡️ Admin';
const WHITELIST_ROLE = '🏁 Street Racer';
const TICKET_CATEGORY = '🎟️ Tickets';

const LEADERBOARD_CHANNEL = '👑-leaderboard';
const FEED_CHANNEL = '📸-street-feed';

const LEADERBOARD_FILE = './leaderboard.json';
const LEADERBOARD_HISTORY_FILE = './leaderboard_history.json';
const LIKES_FILE = './likes.json';

const POINTS_TABLE = [10, 8, 6, 4, 2];
const MAX_LEADERBOARD = 10;

// ================= UTILS =================
function ensureFile(path) { if(!fs.existsSync(path)) fs.writeFileSync(path,'{}'); }
function getJSON(path){ ensureFile(path); return JSON.parse(fs.readFileSync(path)); }
function saveJSON(path,data){ fs.writeFileSync(path,JSON.stringify(data,null,2)); }

// ================= READY =================
client.once('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);

  const guild = client.guilds.cache.get(GUILD_ID);
  if(!guild) return console.log('❌ Serveur introuvable');

  await guild.commands.set([
    {
      name: 'race',
      description: 'Gestion des courses Street Racer',
      options: [
        {
          name: 'result',
          description: 'Entrer le résultat d’une course',
          type: 1, // Subcommand
          options: [
            { name:'participants', description:'Mentionne les joueurs dans l’ordre', type:3, required:true }
          ]
        }
      ]
    },
    {
      name: 'post',
      description: 'Poster sur le feed RP',
      options: [
        { name:'contenu', description:'Texte du post', type:3, required:true },
        { name:'media', description:'URLs des images/vidéos séparées par des virgules (optionnel)', type:3, required:false }
      ]
    }
  ]);

  console.log('✅ Commandes slash mises à jour sur le serveur');
});

// ================= INTERACTIONS =================
client.on('interactionCreate', async interaction => {

  // ===== WHITELIST =====
  if (interaction.isButton() && interaction.customId === 'open_whitelist') {
    const modal = new ModalBuilder().setCustomId('whitelist_modal').setTitle('📝 Candidature NoxVelocity');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('irl_name').setLabel('Prénom / Nom').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('pseudo').setLabel('Pseudo RP').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('age').setLabel('Âge RP').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('background').setLabel('Background du personnage').setStyle(TextInputStyle.Paragraph).setRequired(true)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'whitelist_modal') {
    const guild = interaction.guild;
    const adminRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE);
    const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY);

    if(!adminRole || !category) return interaction.reply({ content:'❌ Config ticket manquante', ephemeral:true });

    const ticket = await guild.channels.create({
      name:`ticket-${interaction.user.username}`,
      type:ChannelType.GuildText,
      parent:category.id,
      permissionOverwrites:[
        {id:guild.roles.everyone, deny:[PermissionsBitField.Flags.ViewChannel]},
        {id:interaction.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]},
        {id:adminRole.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]}
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle('📝 Nouvelle candidature')
      .setColor(0xff6a00)
      .addFields(
        { name:'👤 Joueur', value:interaction.user.tag },
        { name:'📛 Nom', value:interaction.fields.getTextInputValue('irl_name') },
        { name:'🎮 Pseudo', value:interaction.fields.getTextInputValue('pseudo') },
        { name:'🎂 Âge', value:interaction.fields.getTextInputValue('age') },
        { name:'📖 Background', value:interaction.fields.getTextInputValue('background') }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${interaction.user.id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuse_${interaction.user.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
    );

    await ticket.send({ embeds:[embed], components:[row] });
    return interaction.reply({ content:'✅ Ticket créé', ephemeral:true });
  }

  if(interaction.isButton() && (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('refuse_'))){
    if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content:'❌ Réservé aux admins', ephemeral:true });

    const channel = interaction.channel;
    const userId = interaction.customId.split('_')[1];
    const member = await interaction.guild.members.fetch(userId).catch(()=>null);

    if(interaction.customId.startsWith('accept_')){
      const role = interaction.guild.roles.cache.find(r=>r.name===WHITELIST_ROLE);
      if(member && role){ await member.roles.add(role); await member.send('🎉 Ta whitelist a été acceptée !').catch(()=>{});}
      await interaction.reply('✅ Accepté. Fermeture du ticket...');
    } else {
      if(member){ await member.send('❌ Ta candidature a été refusée.').catch(()=>{});}
      await interaction.reply('❌ Refusé. Fermeture du ticket...');
    }

    setTimeout(()=>channel.delete().catch(()=>{}),3000);
  }

  // ===== LEADERBOARD =====
  if(interaction.isChatInputCommand() && interaction.commandName==='race'){
    if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content:'❌ Réservé aux admins', ephemeral:true });

    const mentions = interaction.options.getString('participants').match(/<@!?(\d+)>/g);
    if(!mentions) return interaction.reply({ content:'❌ Participants invalides', ephemeral:true });

    const leaderboard = getJSON(LEADERBOARD_FILE);
    const history = getJSON(LEADERBOARD_HISTORY_FILE);

    const lastRace = mentions.map((m,i)=>{ const id=m.replace(/\D/g,''); leaderboard[id]=(leaderboard[id]||0)+(POINTS_TABLE[i]??1); return {id, points:POINTS_TABLE[i]??1}; });

    history[Date.now()] = lastRace;
    saveJSON(LEADERBOARD_FILE, leaderboard);
    saveJSON(LEADERBOARD_HISTORY_FILE, history);

    const channel = interaction.guild.channels.cache.find(c=>c.name===LEADERBOARD_CHANNEL);

    const sorted = Object.entries(leaderboard).sort((a,b)=>b[1]-a[1]).slice(0,MAX_LEADERBOARD);
    const top3Ids = lastRace.slice(0,3).map(p=>p.id);

    const embed = new EmbedBuilder()
      .setTitle('👑 Classement Street Racer')
      .setColor(0xff6a00)
      .setDescription(sorted.map(([id,pts],i)=>{
        const medal = top3Ids.includes(id) ? (i===0?'🥇':i===1?'🥈':'🥉') : '';
        return `${medal} **${i+1}. <@${id}> — ${pts} pts**`;
      }).join('\n'))
      .setFooter({ text:`Dernière course top3: ${lastRace.slice(0,3).map(p=>'🏎️ <@'+p.id+'>').join(' ')}` });

    await channel.bulkDelete(10).catch(()=>{});
    await channel.send({ embeds:[embed] });
    return interaction.reply({ content:'✅ Leaderboard mis à jour', ephemeral:true });
  }

  // ===== SOCIAL FEED =====
  if(interaction.isChatInputCommand() && interaction.commandName==='post'){
    if(interaction.user.id !== OWNER_ID) return interaction.reply({ content:'❌ Tu ne peux pas poster.', ephemeral:true });

    const content = interaction.options.getString('contenu');
    const mediaInput = interaction.options.getString('media');
    const mediaUrls = mediaInput ? mediaInput.split(',').map(m=>m.trim()).slice(0,4) : [];
    const channel = interaction.guild.channels.cache.find(c=>c.name===FEED_CHANNEL);
    if(!channel) return interaction.reply({ content:'❌ Salon feed introuvable.', ephemeral:true });

    const postId = Date.now().toString();
    const likes = getJSON(LIKES_FILE);

    const embeds = mediaUrls.length ? mediaUrls.map((url,i)=>{
      const embed = new EmbedBuilder()
        .setAuthor({ name:interaction.user.username, iconURL:interaction.user.displayAvatarURL() })
        .setColor(0xff6a00)
        .setFooter({ text:`❤️ 0 likes` })
        .setTimestamp();
      if(i===0) embed.setDescription(content);
      if(url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.webm')){
        embed.setDescription(`${i===0 ? content+'\n':''}🎬 [Vidéo](${url})`);
      } else {
        embed.setImage(url);
      }
      return embed;
    }) : [new EmbedBuilder()
      .setAuthor({ name:interaction.user.username, iconURL:interaction.user.displayAvatarURL() })
      .setDescription(content)
      .setColor(0xff6a00)
      .setFooter({ text:'❤️ 0 likes' })
      .setTimestamp()
    ];

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`like_${postId}`).setLabel('❤️ Like').setStyle(ButtonStyle.Danger)
    );

    const msg = await channel.send({ embeds:embeds, components:[row] });
    likes[postId] = { messageId:msg.id, users:[] };
    saveJSON(LIKES_FILE, likes);

    return interaction.reply({ content:'✅ Post publié', ephemeral:true });
  }

  // ===== LIKE =====
  if(interaction.isButton() && interaction.customId.startsWith('like_')){
    const postId = interaction.customId.split('_')[1];
    const likes = getJSON(LIKES_FILE);

    if(!likes[postId] || likes[postId].users.includes(interaction.user.id)) return interaction.reply({ content:'❌ Action impossible', ephemeral:true });

    likes[postId].users.push(interaction.user.id);
    saveJSON(LIKES_FILE, likes);

    const message = await interaction.channel.messages.fetch(likes[postId].messageId);
    const embed = EmbedBuilder.from(message.embeds[0]).setFooter({ text:`❤️ ${likes[postId].users.length} likes` });
    await message.edit({ embeds:[embed] });

    return interaction.reply({ content:'❤️ Like ajouté', ephemeral:true });
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);

// ================= PORT RENDER =================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot en ligne ✅'));

app.listen(port, () => {
  console.log(`🌐 Serveur web démarré sur le port ${port}`);
});
