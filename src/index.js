// ================= BASE =================
require('dotenv').config();
const fs = require('fs');
const express = require('express');

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
const GUILD_ID = '1458505788816494713';

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
  if (!guild) return console.log('❌ Serveur introuvable');

  await guild.commands.set([
    {
      name: 'race',
      description: 'Gestion des courses NoxVelocity',
      options: [
        {
          name: 'result',
          description: 'Entrer le résultat d’une course',
          type: 1,
          options: [
            {
              name: 'participants',
              description: 'Mentionne les joueurs dans l’ordre',
              type: 3,
              required: true
            }
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
    },
    {
      name: 'embed',
      description: 'Publier un embed personnalisé via modal'
    },
    {
      name: 'resetleaderboard',
      description: 'Réinitialiser le classement (owner uniquement)'
    },
    {
      name: 'setupwhitelist',
      description: 'Envoyer le message avec bouton whitelist'
    }
  ]);

  console.log('✅ Commandes slash enregistrées');
});

// ================= INTERACTIONS =================

client.on('interactionCreate', async interaction => {

  // ---------- BOUTON OUVERTURE MODAL WHITELIST ----------
  if (interaction.isButton() && interaction.customId === 'open_whitelist') {

    const modal = new ModalBuilder()
      .setCustomId('whitelist_modal')
      .setTitle('📝 Candidature NoxVelocity');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('irl_name')
          .setLabel('Prénom Nom')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('pseudo')
          .setLabel('Pseudo')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('age')
          .setLabel('Âge')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('background')
          .setLabel('Background du personnage')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );

    return interaction.showModal(modal);
  }

  // ---------- TRAITEMENT MODAL WHITELIST ----------
  if (interaction.isModalSubmit() && interaction.customId === 'whitelist_modal') {

    const guild = interaction.guild;
    const adminRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE);
    const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY);

    if(!adminRole || !category)
      return interaction.reply({ content:'❌ Config tickets manquante', ephemeral:true });

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

  // ---------- ACCEPT / REFUSE ----------
  if(interaction.isButton() && (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('refuse_'))){

    if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content:'❌ Réservé aux admins', ephemeral:true });

    const userId = interaction.customId.split('_')[1];
    const member = await interaction.guild.members.fetch(userId).catch(()=>null);

    if(interaction.customId.startsWith('accept_')){
      const role = interaction.guild.roles.cache.find(r=>r.name===WHITELIST_ROLE);
      if(member && role){
        await member.roles.add(role);
        await member.send('🎉 Ta whitelist a été acceptée !').catch(()=>{});
      }
      await interaction.reply('✅ Accepté — fermeture du ticket…');
    } else {
      if(member){
        await member.send('❌ Ta candidature a été refusée.').catch(()=>{});
      }
      await interaction.reply('❌ Refusé — fermeture du ticket…');
    }

    setTimeout(()=>interaction.channel.delete().catch(()=>{}),3000);
  }

  // ---------- EMBED VIA MODAL ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'embed') {

    const adminRole = interaction.guild.roles.cache.find(r => r.name === ADMIN_ROLE);
    if (!adminRole || !interaction.member.roles.cache.has(adminRole.id))
      return interaction.reply({ content: '❌ Réservé aux admins', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId('embed_modal')
      .setTitle('Créer un Embed');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('embed_title').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('embed_description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('embed_color').setLabel('Couleur HEX (#FF6A00 par défaut)').setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('embed_footer').setLabel('Footer (optionnel)').setStyle(TextInputStyle.Short)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'embed_modal') {

    const title = interaction.fields.getTextInputValue('embed_title');
    const description = interaction.fields.getTextInputValue('embed_description');
    let color = interaction.fields.getTextInputValue('embed_color') || '#FF6A00';
    const footer = interaction.fields.getTextInputValue('embed_footer');

    color = color.replace('#','');
    if (!/^[0-9A-Fa-f]{6}$/.test(color)) color = 'FF6A00';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(parseInt(color,16))
      .setTimestamp();

    if (footer) embed.setFooter({ text: footer });

    await interaction.channel.send({ embeds:[embed] });
    return interaction.reply({ content:'✅ Embed publié', ephemeral:true });
  }

  // ---------- SETUP WHITELIST ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'setupwhitelist') {

    const adminRole = interaction.guild.roles.cache.find(r => r.name === ADMIN_ROLE);
    if (!adminRole || !interaction.member.roles.cache.has(adminRole.id))
      return interaction.reply({ content: '❌ Réservé aux admins', ephemeral: true });

    const channel = interaction.guild.channels.cache.find(c=>c.name === '📝-approchants');
    if(!channel) return interaction.reply({ content:'❌ Salon introuvable', ephemeral:true });

    const embed = new EmbedBuilder()
      .setTitle('📥 Rejoindre la NoxVelocity')
      .setDescription(
        'Bienvenue sur **NoxVelocity** 🏎️\n\n' +
        'Clique sur le bouton ci-dessous pour faire ta demande.\n' +
        'Notre équipe te répondra rapidement.'
      )
      .setColor(0xff6a00);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_whitelist').setLabel('Faire une demande').setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds:[embed], components:[row] });
    return interaction.reply({ content:'✅ Message envoyé', ephemeral:true });
  }

  // ---------- RESET LEADERBOARD ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'resetleaderboard') {

    if(interaction.user.id !== OWNER_ID)
      return interaction.reply({ content:'❌ Non autorisé', ephemeral:true });

    saveJSON(LEADERBOARD_FILE, {});
    saveJSON(LEADERBOARD_HISTORY_FILE, {});
    return interaction.reply({ content:'✅ Classement réinitialisé', ephemeral:true });
  }

  // ---------- COURSES ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'race') {

    if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content:'❌ Réservé aux admins', ephemeral:true });

    const mentions = interaction.options.getString('participants').match(/<@!?(\d+)>/g);
    if(!mentions) return interaction.reply({ content:'❌ Participants invalides', ephemeral:true });

    const leaderboard = getJSON(LEADERBOARD_FILE);
    const history = getJSON(LEADERBOARD_HISTORY_FILE);

    const lastRace = mentions.map((m,i)=>{
      const id=m.replace(/\D/g,'');
      leaderboard[id]=(leaderboard[id]||0)+(POINTS_TABLE[i]??1);
      return {id, points:POINTS_TABLE[i]??1};
    });

    history[Date.now()] = lastRace;
    saveJSON(LEADERBOARD_FILE, leaderboard);
    saveJSON(LEADERBOARD_HISTORY_FILE, history);

    const channel = interaction.guild.channels.cache.find(c=>c.name===LEADERBOARD_CHANNEL);

    const sorted = Object.entries(leaderboard).sort((a,b)=>b[1]-a[1]).slice(0,MAX_LEADERBOARD);
    const top3Ids = lastRace.slice(0,3).map(p=>p.id);

    const embed = new EmbedBuilder()
      .setTitle('👑 Classement courses')
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

  // ---------- FEED RP ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'post') {

    if(interaction.user.id !== OWNER_ID)
      return interaction.reply({ content:'❌ Non autorisé', ephemeral:true });

    const content = interaction.options.getString('contenu');
    const mediaInput = interaction.options.getString('media');
    const mediaUrls = mediaInput ? mediaInput.split(',').map(m=>m.trim()).slice(0,4) : [];

    const channel = interaction.guild.channels.cache.find(c=>c.name===FEED_CHANNEL);
    if(!channel) return interaction.reply({ content:'❌ Salon introuvable.', ephemeral:true });

    const postId = Date.now().toString();
    const likes = getJSON(LIKES_FILE);

    const embeds = mediaUrls.length ? mediaUrls.map((url,i)=>{
      const embed = new EmbedBuilder()
        .setAuthor({ name:interaction.user.username, iconURL:interaction.user.displayAvatarURL() })
        .setColor(0xff6a00)
        .setFooter({ text:`❤️ 0 likes` })
        .setTimestamp();
      if(i===0) embed.setDescription(content);
      embed.setImage(url);
      return embed;
    }) : [
      new EmbedBuilder()
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

  // ---------- LIKE ----------
  if(interaction.isButton() && interaction.customId.startsWith('like_')){

    const postId = interaction.customId.split('_')[1];
    const likes = getJSON(LIKES_FILE);

    if(!likes[postId] || likes[postId].users.includes(interaction.user.id))
      return interaction.reply({ content:'❌ Impossible', ephemeral:true });

    likes[postId].users.push(interaction.user.id);
    saveJSON(LIKES_FILE, likes);

    const message = await interaction.channel.messages.fetch(likes[postId].messageId);
    const embed = EmbedBuilder.from(message.embeds[0]).setFooter({ text:`❤️ ${likes[postId].users.length} likes` });

    await message.edit({ embeds:[embed] });
    return interaction.reply({ content:'❤️ Like ajouté', ephemeral:true });
  }
});

// ================= SERVEUR WEB (Render) =================

const app = express();
app.get('/', (req,res)=>res.send('Bot Discord actif !'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`🌐 Serveur web sur port ${PORT}`));

// ================= LOGIN =================
client.login(process.env.TOKEN);
