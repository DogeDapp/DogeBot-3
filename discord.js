const log = require('npmlog');
const CronJob = require('cron').CronJob;
const Discord = require('discord.js');
const database = require('./database.js');
const lists = require('./lists.js');
const functions = require('./functions.js');

const discordClient = new Discord.Client();
async function start() {
	await connect();
	monitorDiscordChat();
	const scheduledJob = new CronJob({
		cronTime: '0 59 23 * * *',
		onTick: () => {
			sendDailyReport();
		},
		start: true,
		timeZone: 'US/Eastern'
	});
	scheduledJob.start();
	log.info('Setup scheduled task to send daily reports');
}

async function connect() {
	const dbConstants = await database.constants();
	discordClient.login(dbConstants.discordAPIKey);
	discordClient.on('ready', () => {
		log.info('Now monitoring Discord chat');
	});
}

function monitorDiscordChat() {
	discordClient.on('message', message => {
		handleChatMessage(message);
	});
	discordClient.on('error', error => {
		console.log('An error occurred with the discord API:' + error);
	});
}

async function sendDailyReport() {
	// Select channel data
	const propsForChannelSelect = {
		table: 'channels'
	};
	const listOfChannels = await database.select(propsForChannelSelect);
	const numberOfChannelsThatHaveLoggedIn = listOfChannels.length;
	let numberOfJoinedChannels = 0;
	if (listOfChannels) {
		for (let channelLoop = listOfChannels.length - 1; channelLoop >= 0; channelLoop--) {
			if (listOfChannels[channelLoop].inChannel) {
				numberOfJoinedChannels++;
			}
		}
	}
	const propsForUserCounting = {
		table: 'chatusers'
	};
	const numberOfUsersInAllChats = await database.count(propsForUserCounting);

	// Select seen message data
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	const propsForChatlog = {
		table: 'chatlog',
		query: {
			timestamp: {$gte: start.getTime()},
			'userstate.display-name': {$ne: 'DogeBot'}
		}
	};
	const numberOfMessagesSeenToday = await database.count(propsForChatlog);

	// Select sent message data
	const propsForSentMessages = {
		table: 'chatlog',
		query: {
			timestamp: {$gte: start.getTime()},
			'userstate.display-name': 'DogeBot'
		}
	};
	const numberOfMessagesSentToday = await database.count(propsForSentMessages);

	// Select song data
	const propsForSongCacheCounting = {
		table: 'songcache'
	};
	const numberOfAllCachedSongs = await database.count(propsForSongCacheCounting);

	// Build the report
	const report = new Discord.RichEmbed()
	.setColor('#428bca')
	.setTitle('DogeBot Daily Report')
	.setURL('https://thedogebot.com/')
	.setDescription('Daily bot stats report')
	.setThumbnail('https://thedogebot.com/img/logo.png')
	.addField('Logged in Channels', numberOfChannelsThatHaveLoggedIn, true)
	.addField('Joined Channels', numberOfJoinedChannels, true)
	.addField('\u200B', '\u200B', true)
	.addField('Total Chatters Seen', numberOfUsersInAllChats, true)
	.addField('Total Cached Songs', numberOfAllCachedSongs, true)
	.addField('\u200B', '\u200B', true)
	.addField('Messages Seen Today', numberOfMessagesSeenToday, true)
	.addField('Messages Sent Today', numberOfMessagesSentToday, true)
	.addField('\u200B', '\u200B', true)
	.setTimestamp()
	.setFooter('DogeBot Stats', 'https://thedogebot.com/img/logo.png');

	// Send report to me in a DM
	discordClient.fetchUser('153273593738952704').then(user => {
		user.send(report);
	});
}

async function handleChatMessage(message) {
	const messageChannel = message.channel;
	const messageContent = message.content;
	if (message.author.username !== 'DogeBot' && messageContent.startsWith('!')) {
		const messageSplit = messageContent.split(' ');
		const sentCommand = messageSplit[0];
		if (sentCommand === '!setstatus' && message.author.username === 'Skedog') {
			const statusToSet = messageSplit.slice(1, messageSplit.length).join(' ').replace('\'', '&apos;');
			discordClient.users.find('username', 'DogeBot').setGame(statusToSet, null);
			message.delete().then(msg => console.log(`Deleted message from ${msg.author}`)).catch(console.error);
		} else {
			const props = {
				message,
				messageChannel,
				messageSplit,
				sentCommand
			};
			handleDiscordCommand(props);
		}
	}
}

async function handleDiscordCommand(props) {
	const arrayOfCommands = ['!ayylmao', '!dansgame', '!derpdoge', '!doge', '!letoucan', '!patrick', '!skedoge', '!skegasm', '!skeleton', '!dansgame', '!shrug'];
	if (!arrayOfCommands.includes(props.sentCommand)) {
		if (props.sentCommand === '!about') {
			props.message.reply('Really? Come on, learn to Google you lazy fuck. Here: http://lmgtfy.com/?q=DogeBot');
		} else if (props.sentCommand === '!commands') {
			props.message.reply('Ugh, really? Fine, I can insult you using !insult, !about or you can look at the damn commands page: http://thedogebot.com/commands/ygtskedog');
		} else {
			callCommandFromDiscord(props);
		}
	}
}

async function callCommandFromDiscord(props) {
	const propsForSelect = {
		table: 'commands',
		query: {channel: '#ygtskedog', trigger: props.sentCommand}
	};
	const results = await database.select(propsForSelect);
	if (results) {
		props.results = results;
		if (results[0].permissionsLevel === 0) {
			if (results[0].chatmessage.includes('$(list)')) {
				handleListCommand(props);
			} else {
				let messageToSend = results[0].chatmessage;
				messageToSend = props.messageSplit[1] ?
					messageToSend.replace('$(touser)', props.messageSplit[1]).replace('$(user)', props.messageSplit[1]) :
					messageToSend.replace('$(touser)', props.message.author).replace('$(user)', props.message.author).replace('&apos;', '\'');
				props.messageChannel.send(messageToSend);
			}
		}
	}
}

async function handleListCommand(props) {
	const testUserstate = [];
	testUserstate['display-name'] = props.message.author;
	const propsForListCommands = {
		channel: '#ygtskedog',
		messageParams: [props.sentCommand, props.messageSplit[1]],
		results: props.results,
		userstate: testUserstate
	};
	try {
		const returnedMessage = await lists.getListCommandItem(propsForListCommands);
		if (props.messageSplit[1] !== undefined && !functions.isNumber(props.messageSplit[1])) {
			const finalMessage = returnedMessage.split(' -> #');
			props.messageChannel.send(props.messageSplit[1] + ' -> #' + finalMessage[1]);
		} else {
			const finalMessage = returnedMessage.split(' -> #');
			props.messageChannel.send(props.message.author + ' -> #' + finalMessage[1]);
		}
	} catch (err) {
		console.log(err);
	}
}

module.exports = {
	start
};
