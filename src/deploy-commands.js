require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Créer automatiquement le serveur RP')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Déploiement de la commande /setup...');
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log('Commande /setup installée avec succès');
  } catch (error) {
    console.error('Erreur pendant le déploiement :', error);
  }
})();
