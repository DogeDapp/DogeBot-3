const mongo = require('mongodb').MongoClient;
const log = require('npmlog');

class Database {
	async connect() {
		const _this = this;
		const mongoConfig = JSON.parse(process.env.APP_CONFIG);
		const dbStr = 'mongodb://' + mongoConfig.mongo.user + ':' + process.env.MONGO_PASSWORD + '@' + mongoConfig.mongo.hostString;
		try {
			const conn = await mongo.connect(dbStr, {useUnifiedTopology: true});
			module.exports.db = conn.db(mongoConfig.db);
			log.info('Connected to database');
			return _this.constants();
		} catch (err) {
			throw new Error(err);
		}
	}

	async select(props) {
		try {
			if (props.sortBy === undefined) {
				props.sortBy = {sortOrder: 1, _id: 1};
			}
			if (props.limit === undefined) {
				props.limit = 0;
			}
			const result = await module.exports.db.collection(props.table).find(props.query).sort(props.sortBy).limit(props.limit).toArray();
			if (result.length > 0) {
				return result;
			}
			return;
		} catch (err) {
			throw new Error(err);
		}
	}

	async selectGroupBy(props) {
		try {
			if (props.sortBy === undefined) {
				props.sortBy = {sortOrder: 1, _id: 1};
			}
			if (props.groupby === undefined) {
				props.groupby = '';
			}
			const result = await module.exports.db.collection(props.table).aggregate([{$match: props.query}, {$group: props.groupby}]).sort(props.sortBy).toArray();
			if (result.length > 0) {
				return result;
			}
			return;
		} catch (err) {
			throw new Error(err);
		}
	}

	async selectDistinct(props) {
		try {
			if (props.sortBy === undefined) {
				props.sortBy = {sortOrder: 1, _id: 1};
			}
			if (props.limit === undefined) {
				props.limit = 0;
			}
			if (props.distinct === undefined) {
				props.distinct = '';
			}
			const result = await module.exports.db.collection(props.table).distinct(props.distinct, props.query).sort(props.sortBy).limit(props.limit).toArray();
			if (result.length > 0) {
				return result;
			}
			return;
		} catch (err) {
			throw new Error(err);
		}
	}

	async count(props) {
		try {
			const result = await module.exports.db.collection(props.table).countDocuments(props.query);
			return result;
		} catch (err) {
			throw new Error(err);
		}
	}

	async countDistinct(props) {
		try {
			const result = await module.exports.db.collection(props.table).distinct(props.distinct, props.query);
			return result;
		} catch (err) {
			throw new Error(err);
		}
	}

	async selectone(props) {
		try {
			const result = await module.exports.db.collection(props.table).findOne(props.query);
			if (result.length > 0) {
				return result;
			}
			return;
		} catch (err) {
			throw new Error(err);
		}
	}

	async add(props) {
		try {
			await module.exports.db.collection(props.table).insertOne(props.dataToUse);
			return 'added';
		} catch (err) {
			throw new Error(err);
		}
	}

	async update(props) {
		try {
			if (props.dataToUse !== undefined && props.inc !== undefined) {
				// If you want to update fields and inc. a field
				await module.exports.db.collection(props.table).updateOne(props.query, {$set: props.dataToUse, $inc: props.inc});
				return 'updated';
			}
			if (props.dataToUse === undefined && props.inc !== undefined) {
				// If you only want to inc. a field
				await module.exports.db.collection(props.table).updateOne(props.query, {$inc: props.inc});
				return 'updated';
			}
			// If you only want to update fields
			await module.exports.db.collection(props.table).updateOne(props.query, {$set: props.dataToUse});
			return 'updated';
		} catch (err) {
			throw new Error(err);
		}
	}

	async updateall(props) {
		try {
			if (props.dataToUse !== undefined && props.inc !== undefined) {
				// If you want to update fields and inc. a field
				await module.exports.db.collection(props.table).updateMany(props.query, {$set: props.dataToUse, $inc: props.inc});
				return 'updated';
			}
			if (props.dataToUse === undefined && props.inc !== undefined) {
				// If you only want to inc. a field
				await module.exports.db.collection(props.table).updateMany(props.query, {$inc: props.inc});
				return 'updated';
			}
			// If you only want to update fields
			await module.exports.db.collection(props.table).updateMany(props.query, {$set: props.dataToUse});
			return 'updated';
		} catch (err) {
			throw new Error(err);
		}
	}

	async removefield(props) {
		try {
			await module.exports.db.collection(props.table).updateOne(props.query, {$unset: props.dataToUse}, {multi: true});
			return 'updated';
		} catch (err) {
			throw new Error(err);
		}
	}

	async delete(props) {
		try {
			await module.exports.db.collection(props.table).deleteOne(props.query);
			return 'deleted';
		} catch (err) {
			throw new Error(err);
		}
	}

	async deleteall(props) {
		try {
			await module.exports.db.collection(props.table).deleteMany(props.query);
			return 'deleted';
		} catch (err) {
			throw new Error(err);
		}
	}

	async constants() {
		const props = {table: 'globalConstants'};
		const constants = await this.select(props);
		return {
			twitchOauthPass: constants[0].twitchOauthPass,
			twitchClientID: constants[0].twitchClientID,
			twitchTestClientID: constants[0].twitchTestClientID,
			YouTubeAPIKey: constants[0].YouTubeAPIKey,
			discordAPIKey: constants[0].discordAPIKey,
			sessionKey: constants[0].sessionKey,
			twitchOauthPassTest: constants[0].twitchOauthPassTest,
			twitchOauthScoped: constants[0].twitchOauthScoped
		};
	}
}

module.exports = new Database();
