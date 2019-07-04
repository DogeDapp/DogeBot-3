const http = require('http');
const path = require('path');
const objectId = require('mongodb').ObjectId;
const express = require('express');
const exphbs = require('express-handlebars');
const subdomain = require('express-subdomain');
const bodyParser = require('body-parser');
const rp = require('request-promise');
const log = require('npmlog');
const session = require('client-sessions');
const database = require('./database.js');
const constants = require('./constants.js');
const expressFunctions = require('./express-functions.js');
const songs = require('./songs.js');
const cache = require('./cache.js');
const twitch = require('./twitch.js');
const stats = require('./stats.js');

const app = express();
const router = new express.Router();
const statsPage = new express.Router();
const server = http.createServer(app);
const port = process.env.PORT ? process.env.PORT : 3000;
let dbConstants;

async function start() {
	dbConstants = await database.constants();
	setupApp();
	await setupRoutes();
	server.listen(port, () => {
		log.info('Web server running on port ' + port);
	});
}

function setupApp() {
	app.set('views', path.join(__dirname, '/views'));
	const hbs = exphbs.create({
		defaultLayout: 'main',
		partialsDir: [
			'views/partials/'
		]
	});
	app.engine('handlebars', hbs.engine);
	app.set('view engine', 'handlebars');
	app.use(subdomain('docs', router));
	app.use(subdomain('stats', statsPage));
	app.disable('x-powered-by');
	app.use('/css', express.static(path.join(__dirname, '/public/css')));
	app.use('/img', express.static(path.join(__dirname, '/public/img')));
	app.use('/js', express.static(path.join(__dirname, '/public/js')));
	app.use('/favicon.ico', express.static('public/img/favicon.ico'));
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({extended: true}));
	// Session is valid for 15 days, and will add 1 day to that length if expiresIn < 1 day
	app.use(session({
		cookieName: 'session',
		secret: dbConstants.sessionKey,
		duration: 15 * 24 * 60 * 60 * 1000,
		activeDuration: 1 * 24 * 60 * 60 * 1000
	}));

	if (!constants.testMode) {
		app.enable('trust proxy');
		app.use((req, res, next) => {
			if (req.headers.host === 'skedogbot.com') {
				res.redirect('https://thedogebot.com' + req.url);
				return;
			}
			if (req.secure) {
				// Request was via https, so do no special handling
				next();
			} else {
				// Request was via http, so redirect to https
				res.redirect('https://' + req.headers.host + req.url);
			}
		});

		router.use((req, res, next) => {
			if (req.headers.host === 'skedogbot.com') {
				res.redirect('https://thedogebot.com' + req.url);
				return;
			}
			if (req.secure) {
				// Request was via https, so do no special handling
				next();
			} else {
				// Request was via http, so redirect to https
				res.redirect('https://' + req.headers.host + req.url);
			}
		});

		statsPage.use((req, res, next) => {
			if (req.headers.host === 'skedogbot.com') {
				res.redirect('https://thedogebot.com' + req.url);
				return;
			}
			if (req.secure) {
				// Request was via https, so do no special handling
				next();
			} else {
				// Request was via http, so redirect to https
				res.redirect('https://' + req.headers.host + req.url);
			}
		});
	}
}

async function setupRoutes() {
	// GET routes
	app.get('/', async (req, res) => {
		res.render('home', {
			layout: 'home'
		});
	});

	app.get('/login', [expressFunctions.checkIfUserIsLoggedIn], async (req, res) => {
		let apiKey;
		let postURL;
		if (constants.testMode) {
			apiKey = dbConstants.twitchTestClientID;
			postURL = constants.testPostURL;
		} else {
			apiKey = dbConstants.twitchClientID;
			postURL = constants.postURL;
		}
		res.render('login', {
			layout: 'loginLogout',
			apiKey,
			postURL,
			redirectTo: req.session.redirectTo
		});
	});

	app.get('/logout', async (req, res) => {
		req.session.reset();
		res.render('logout', {
			layout: 'loginLogout'
		});
	});

	app.get('/dashboard', [expressFunctions.checkIfUserIsLoggedIn], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const topChatters = await expressFunctions.getTopChatters(userData.channel);
		const dashboardStats = await expressFunctions.getDashboardStats(userData.channel);
		res.render('dashboard', {userData, topChatters, dashboardStats});
	});

	app.get('/player', [expressFunctions.checkIfUserIsLoggedIn], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const formattedSonglist = await expressFunctions.getFormattedSonglist(userData.channel, 'player');
		const formattedFirstSongInSonglist = await expressFunctions.getFormattedFirstSongFromSonglist(userData.channel);
		const firstSongInSonglist = await expressFunctions.getFirstSongFromSonglist(userData.channel);
		const currentVolume = userData.channelInfo[0].volume;
		res.render('player', {userData, formattedSonglist, formattedFirstSongInSonglist, firstSongInSonglist, currentVolume});
	});

	app.get('/mobile', [expressFunctions.checkIfUserIsLoggedIn], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const formattedFirstSongInSonglist = await expressFunctions.getFormattedFirstSongFromSonglist(userData.channel);
		const currentVolume = userData.channelInfo[0].volume;
		const isMusicPlaying = await expressFunctions.getMusicStatus(userData);
		res.render('mobile', {userData, formattedFirstSongInSonglist, currentVolume, isMusicPlaying});
	});

	app.get('/song-settings', [expressFunctions.checkIfUserIsLoggedIn], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		res.render('song-settings', {userData});
	});

	app.get('/contact', async (req, res) => {
		res.render('contact', {
			layout: 'notLoggedIn'
		});
	});

	app.get('/moderation/:channel*?', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.checkPassedChannel, expressFunctions.checkModStatus], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const formattedSonglist = await expressFunctions.getFormattedSonglist(userData.channel, 'moderation');
		const currentVolume = userData.channelInfo[0].volume;
		const isMusicPlaying = await expressFunctions.getMusicStatus(userData);
		res.render('moderation', {userData, formattedSonglist, currentVolume, isMusicPlaying});
	});

	// These routes take a layout because they can be viewed regardless if they are logged in
	// This is set with the userData in express-functions

	app.get('/songs/:channel*?', [expressFunctions.checkPassedChannel], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const formattedSonglist = await expressFunctions.getFormattedSonglist(userData.channel, 'songs');
		res.render('songs', {userData, formattedSonglist, layout: userData.layout});
	});

	app.get('/blacklist/:channel*?', [expressFunctions.checkPassedChannel], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const formattedBlacklist = await expressFunctions.getFormattedBlacklist(userData.channel);
		res.render('blacklist', {userData, formattedBlacklist, layout: userData.layout});
	});

	app.get('/songcache/:channel*?', [expressFunctions.checkPassedChannel], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const formattedSongCache = await expressFunctions.getFormattedSongCache(userData.channel);
		res.render('songcache', {userData, formattedSongCache, layout: userData.layout});
	});

	app.get('/commands/:channel*?', [expressFunctions.checkPassedChannel], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const formattedCommands = await expressFunctions.getFormattedCommandlist(userData.channel);
		res.render('commands', {userData, formattedCommands, layout: userData.layout});
	});

	app.get('/chatlog/:channel*?', [expressFunctions.checkPassedChannel], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		res.render('chatlog', {userData, layout: userData.layout});
	});

	app.get('/currentsonginfo/:channel*?', [expressFunctions.checkPassedChannel], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		const firstSongInSonglist = await expressFunctions.getFirstSongFromSonglist(userData.channel);
		res.render('currentsonginfo', {userData, firstSongInSonglist, showText: req.query.showText, layout: 'no-style'});
	});

	app.get('/error', async (req, res) => {
		const err = new Error('Not Found');
		err.status = 401;
		res.status(err.status || 401);
		console.log('Error while trying to log someone in: ' + req.query.passedError + ': ' + req.query.errorDesc);
		res.render('error.handlebars', {
			message: req.query.errorDesc,
			status: err.status,
			error: {},
			layout: 'notLoggedIn'
		});
	});

	// POST routes

	app.post('/handlelogin', async (req, res) => {
		// This whole post request is for handling initial logins
		// Token comes from the Twitch API login request
		console.log('got to /handlelogin');
		const token = req.body.token;
		req.session.token = token;
		const options = {
			uri: 'https://api.twitch.tv/kraken/user/?oauth_token=' + token,
			json: true
		};
		return rp(options).then(async body => {
			const props = {
				userEmail: body.email,
				twitchUserID: body._id,
				userLogo: body.logo,
				ChannelName: body.name,
				token
			};
			const userDetails = props.userEmail + ',' + props.userLogo + ',#' + props.ChannelName + ',' + props.twitchUserID;
			console.log('channel logging in: ' + props.ChannelName);
			// Set the userDetails as a session
			req.session.userDetails = userDetails;
			const returnVal = await expressFunctions.handleLogin(props);
			const propsForUser = {
				channel: '#' + props.ChannelName,
				username: props.ChannelName
			};
			await stats.addTrackedUser(propsForUser);
			console.log('returnVal: ' + returnVal);
			res.send(returnVal);
		}).catch(err => {
			log.error('/handleLogin produced an error: ' + err);
			res.redirect('/');
		});
	});

	app.post('/removenotification', [expressFunctions.checkIfUserIsLoggedIn], async (req, res) => {
		const dataToUse = {};
		const propsForSelect = {
			table: 'notifications',
			query: {_id: objectId(req.body.id)}
		};
		const results = await database.select(propsForSelect);
		const channel = expressFunctions.addHashToChannel(req.body.channel);
		if (results) {
			// Add logged in channel to the notification exclusionList
			const originalExclusionList = results[0].exclusionList;
			originalExclusionList.push(channel);
			dataToUse.exclusionList = originalExclusionList;
			propsForSelect.dataToUse = dataToUse;
			// Update the notification
			await database.update(propsForSelect);
			// Delete the cache for notifications
			await cache.del(channel + 'notifications');
			// Send a response
			res.send('removed');
		}
	});

	app.post('/updatevolume', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.checkModStatus], async (req, res) => {
		const messageParams = ['', req.body.volume];
		const fakeUserstate = [];
		fakeUserstate['display-name'] = 'skippedfromweb';
		const propsForVolumeUpdate = {
			channel: req.body.channel,
			messageParams,
			userstate: fakeUserstate
		};
		await songs.updateVolume(propsForVolumeUpdate);
		res.send('');
	});

	app.post('/updatemusicstatus', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.checkModStatus], async (req, res) => {
		const fakeUserstate = [];
		fakeUserstate['display-name'] = 'skippedfromweb';
		if (req.body.musicStatus === 'play') {
			const propsForPlay = {
				channel: req.body.channel,
				userstate: fakeUserstate,
				messageParams: ['!play']
			};
			await songs.play(propsForPlay);
			res.send('');
		} else if (req.body.musicStatus === 'pause') {
			const propsForPause = {
				channel: req.body.channel,
				userstate: fakeUserstate,
				messageParams: ['!pause']
			};
			await songs.pause(propsForPause);
			res.send('');
		}
	});

	app.post('/updatesettings', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.checkModStatus], async (req, res) => {
		const dataToUse = {};
		dataToUse.duplicateSongDelay = parseInt(req.body.duplicateSongDelay, 10);
		dataToUse.songNumberLimit = parseInt(req.body.songNumberLimit, 10);
		dataToUse.maxSongLength = parseInt(req.body.maxSongLength, 10);
		dataToUse.ChannelCountry = req.body.channelCountry;
		const propsForUpdate = {
			table: 'channels',
			query: {ChannelName: req.body.channel},
			dataToUse
		};
		await database.update(propsForUpdate);
		res.send('updated');
	});

	app.post('/loadnextsong', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.checkModStatus], async (req, res) => {
		const fakeUserstate = [];
		fakeUserstate['display-name'] = 'skippedfromweb';
		const propsForSkip = {
			channel: req.body.channel,
			userstate: fakeUserstate,
			messageParams: ['!skipsong']
		};
		await songs.skip(propsForSkip);
		const propsForSelect = {
			table: 'songs',
			query: {channel: req.body.channel}
		};
		const songResults = await database.select(propsForSelect);
		if (songResults) {
			res.send(songResults[0].songID);
		}
	});

	app.post('/shufflesongs', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.checkModStatus], async (req, res) => {
		const fakeUserstate = [];
		fakeUserstate['display-name'] = 'skippedfromweb';
		const propsForShuffle = {
			channel: req.body.channel,
			userstate: fakeUserstate,
			messageParams: ['!shuffle']
		};
		await songs.shuffle(propsForShuffle);
		res.send('shuffled');
	});

	app.post('/getUserData', [expressFunctions.checkIfUserIsLoggedIn], async (req, res) => {
		const userData = await expressFunctions.getUserData(req);
		res.send(userData);
	});

	app.post('/getchatlogs', async (req, res) => {
		const channelToPass = req.body.channel;
		const startTime = parseFloat(req.body.start);
		const endTime = parseFloat(req.body.end);
		const offset = parseFloat(req.body.offset);
		const formattedChatlog = await expressFunctions.getFormattedChatlog(channelToPass, startTime, endTime, offset);
		res.send(formattedChatlog);
	});

	app.post('/getlistcommanditems', async (req, res) => {
		const listCommandItems = await expressFunctions.getListCommandItems(req.body.channel, req.body.command);
		res.send(listCommandItems);
	});

	app.post('/joinchannel', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.validatePassedUser], async (req, res) => {
		await twitch.joinSingleChannel(req.body.channel);
		res.send('joined');
	});

	app.post('/partchannel', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.validatePassedUser], async (req, res) => {
		await twitch.leaveSingleChannel(req.body.channel);
		res.send('parted');
	});

	app.post('/removesong', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.checkModStatus], async (req, res) => {
		const channel = expressFunctions.addHashToChannel(req.body.channel);
		const messageParams = ['', req.body.songToRemove];
		const fakeUserstate = [];
		fakeUserstate['display-name'] = 'skippedfromweb';
		const propsForRemove = {
			channel,
			messageParams,
			userstate: fakeUserstate
		};
		await songs.remove(propsForRemove);
		res.send('song removed');
	});

	app.post('/promotesong', [expressFunctions.checkIfUserIsLoggedIn, expressFunctions.checkModStatus], async (req, res) => {
		const channel = expressFunctions.addHashToChannel(req.body.channel);
		const messageParams = ['', req.body.songToPromote];
		const fakeUserstate = [];
		fakeUserstate['display-name'] = 'promotedfromweb';
		const propsForPromote = {
			channel,
			messageParams,
			userstate: fakeUserstate
		};
		await songs.promote(propsForPromote);
		res.send('song promoted');
	});

	app.post('/getsocketdata', async (req, res) => {
		const channel = expressFunctions.addHashToChannel(req.body.channel);
		const dataToGet = req.body.dataToGet;
		if (dataToGet === 'formattedsonglist') {
			const formattedSonglist = await expressFunctions.getFormattedSonglist(channel, req.body.page);
			res.send(formattedSonglist);
		} else if (dataToGet === 'firstsonginsonglist') {
			const firstSongInSonglist = await expressFunctions.getFirstSongFromSonglist(channel);
			res.send(firstSongInSonglist);
		} else if (dataToGet === 'commands') {
			const formattedCommands = await expressFunctions.getFormattedCommandlist(channel);
			res.send(formattedCommands);
		} else if (dataToGet === 'blacklist') {
			const formattedBlacklist = await expressFunctions.getFormattedBlacklist(channel);
			res.send(formattedBlacklist);
		} else if (dataToGet === 'formattedfirstsong') {
			const formattedFirstSongInSonglist = await expressFunctions.getFormattedFirstSongFromSonglist(channel);
			res.send(formattedFirstSongInSonglist);
		}
	});

	// Documentation routes
	router.get('/', async (req, res) => {
		res.render('getting-started.handlebars', {
			layout: 'documentation'
		});
	});

	router.get('/default-commands', async (req, res) => {
		res.render('default-commands.handlebars', {
			layout: 'documentation'
		});
	});

	router.get('/privacy-policy', async (req, res) => {
		res.render('privacy.handlebars', {
			layout: 'documentation'
		});
	});

	const defaultCommands = [
		'8ball',
		'bf4stats',
		'blacklist',
		'commands',
		'currentsong',
		'dj',
		'firstseen',
		'followage',
		'game',
		'gamble',
		'giveaway',
		'lastseen',
		'lastsong',
		'mute',
		'nocache',
		'pause',
		'play',
		'playlistrequest',
		'points',
		'promote',
		'regular',
		'removesongs',
		'shoutout',
		'shuffle',
		'skipsong',
		'songcache',
		'songlist',
		'songrequest',
		'srp',
		'supermod',
		'title',
		'unmute',
		'uptime',
		'viewers',
		'volume',
		'winner',
		'wrongsong'
	];
	defaultCommands.forEach(command => {
		router.get(`/default-commands/${command}`, (req, res) => {
			res.render(`default-commands/${command}.handlebars`, {
				layout: 'documentation'
			});
		});
	});

	router.get('/login', async (req, res) => {
		// This route handles trying to login from the documentation site
		if (constants.testMode) {
			res.redirect(constants.testPostURL + '/login');
		} else {
			res.redirect(constants.postURL + '/login');
		}
	});

	// Stats route
	statsPage.get('/', async (req, res) => {
		const stats = await expressFunctions.getStatsForStatsPage();
		res.render('stats.handlebars', {
			stats,
			layout: 'stats'
		});
	});

	statsPage.get('/channel/:channel*?', [expressFunctions.checkPassedChannel], async (req, res) => {
		const stats = await expressFunctions.getStatsForStatsPage(req.params.channel);
		res.render('stats.handlebars', {
			stats,
			layout: 'stats'
		});
	});

	statsPage.get('/top-chatters', async (req, res) => {
		const stats = await expressFunctions.getTopChattersForStatsPage();
		res.render('top-chatters.handlebars', {
			stats,
			layout: 'stats'
		});
	});

	statsPage.get('/top-chatters/:channel*?', [expressFunctions.checkPassedChannel], async (req, res) => {
		const stats = await expressFunctions.getTopChattersForStatsPage(req.params.channel);
		res.render('top-chatters.handlebars', {
			stats,
			layout: 'stats'
		});
	});

	statsPage.get('/login', async (req, res) => {
		// This route handles trying to login from the stats site
		if (constants.testMode) {
			res.redirect(constants.testPostURL + '/login');
		} else {
			res.redirect(constants.postURL + '/login');
		}
	});

	app.use(async (req, res) => {
		const err = new Error('Not Found');
		err.status = 404;
		res.status(err.status || 500);
		res.render('error.handlebars', {
			message: err.message,
			status: err.status,
			error: {},
			layout: 'notLoggedIn'
		});
	});
}

module.exports.server = server;
module.exports.start = start;
