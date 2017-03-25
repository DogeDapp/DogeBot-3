var runSQL = require('./runSQL.js');
var permissions = require('./permissions.js');
var functions = require('./general-functions.js');

var add = function(db,twitchClient,channel,userstate,messageParams) {
	return new Promise((resolve, reject) => {
		runSQL('select','commands',{channel:channel,trigger:messageParams[2]},'',db).then(results => {
			if (!results) {
				var triggerToAdd = messageParams[2].toLowerCase();
				var tempLength = messageParams.length;
				var messageToAdd = messageParams.slice(3,tempLength).join(' ').replace("'","&apos;");
				if (messageToAdd !== '' && triggerToAdd.charAt(0) == '!') {
					var dataToUse = {};
					dataToUse["trigger"] = triggerToAdd;
					dataToUse["chatmessage"] = messageToAdd;
					dataToUse["commandcounter"] = 0;
					dataToUse["channel"] = channel;
					dataToUse["permissionsLevel"] = 0;
					dataToUse["isAlias"] = false;
					dataToUse["aliasFor"] = '';
					runSQL('add','commands',{},dataToUse,db).then(res => {
						var msgToSend = userstate['display-name'] + ' -> The command ' + messageParams[2] + ' has been added!';
						twitchClient.say(channel, msgToSend);
						resolve(msgToSend);
					}).catch(err => {
						reject(err);
					});
				} else {
					reject('Adding command failed');
				}
			} else {
				var msgToSend = userstate['display-name'] + ' -> The command ' + messageParams[2] + ' already exists!';
				twitchClient.say(channel, msgToSend);
				reject(msgToSend);
			}
		}).catch(err => {
			reject(err);
		});
	});
}

var edit = function(db,twitchClient,channel,userstate,messageParams) {
	return new Promise((resolve, reject) => {
		runSQL('select','commands',{channel:channel,trigger:messageParams[2]},'',db).then(results => {
			if (results !== undefined) {
				var triggerToAdd = messageParams[2];
				var tempLength = messageParams.length;
				var messageToAdd = messageParams.slice(3,tempLength).join(' ').replace("'","&apos;");
				var dataToUse = {};
				dataToUse["chatmessage"] = messageToAdd;
				runSQL('update','commands',{channel:channel,trigger:messageParams[2]},dataToUse,db).then(res => {
					var msgToSend = userstate['display-name'] + ' -> The command ' + messageParams[2] + ' has been updated!';
					twitchClient.say(channel, msgToSend);
					resolve(msgToSend);
				}).catch(err => {
					reject(err);
				});
			} else {
				var msgToSend = userstate['display-name'] + ' -> The command ' + messageParams[2] + ' doesn\'t exist!';
				twitchClient.say(channel, msgToSend);
				reject(msgToSend);
			}
		}).catch(err => {
			reject(err);
		});
	});
}

var remove = function(db,twitchClient,channel,userstate,messageParams) {
	return new Promise((resolve, reject) => {
		runSQL('select','commands',{channel:channel,trigger:messageParams[2]},'',db).then(results => {
			if (results) {
				runSQL('delete','commands',{channel:channel,trigger:messageParams[2]},'',db).then(res => {
					var msgToSend = userstate['display-name'] + ' -> The command ' + messageParams[2] + ' has been deleted!';
					twitchClient.say(channel, msgToSend);
					resolve(msgToSend)
				}).catch(err => {
					reject(err);
				});
			} else {
				var msgToSend = userstate['display-name'] + ' -> The command ' + messageParams[2] + ' doesn\'t exist!';
				twitchClient.say(channel, msgToSend);
				reject(msgToSend);
			}
		}).catch(err => {
			reject(err);
		});
	});
}

var setPermissions = function(db,twitchClient,channel,userstate,messageParams) {
	return new Promise((resolve, reject) => {
		runSQL('select','commands',{channel:channel,trigger:messageParams[2]},'',db).then(results => {
			if (results) {
				var commandToEdit = messageParams[2];
				var permissionLevelToSet = messageParams[3];
				var commandPermissionlevelNeeded = results[0].permissionsLevel;
				permissions.getUserPermissionLevel(db,channel,userstate).then(userPermissionLevel => {
					if (permissionLevelToSet <= userPermissionLevel && userPermissionLevel >= commandPermissionlevelNeeded) {
						var query = {channel:channel,trigger:messageParams[2]};
						if (functions.isNumber(permissionLevelToSet)) {
							var dataToUse = {};
							dataToUse["permissionsLevel"] = permissionLevelToSet;
							runSQL('update','commands',query,dataToUse,db).then(results => {
								var msgToSend = userstate['display-name'] + ' -> The command ' + messageParams[2] + ' permissions have been updated!';
								twitchClient.say(channel, msgToSend);
								resolve(msgToSend);
							}).catch(err => {
								reject(err);
							});
						}
					}
				}).catch(err => {
					reject(err);
				});
			} else {
				var msgToSend = userstate['display-name'] + ' -> The command ' + messageParams[2] + ' doesn\'t exist!';
				twitchClient.say(channel, msgToSend);
				reject('Updating permissions failed');
			}
		});
	});
}

module.exports = {
	add: add,
	edit: edit,
	remove: remove,
	setPermissions: setPermissions
};