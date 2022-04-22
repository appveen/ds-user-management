'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const definition = require('../helpers/user.definition.js').definition;
const SMCrud = require('@appveen/swagger-mongoose-crud');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const dataStackUtils = require('@appveen/data.stack-utils');
const schema = new mongoose.Schema(definition);
let queueMgmt = require('../../util/queueMgmt');
// let globalCache = require('../../util/cache');
const cache = require('../../util/cache.utils').cache;
var client = queueMgmt.client;
const logger = global.logger;
const utils = require('@appveen/utils');
const envConfig = require('../../config/config');
const jwtKey = envConfig.secret;
const refreshSecret = envConfig.refreshSecret;
var userLog = require('./insight.log.controller');
const azureAdUtil = require('../helpers/util/azureAd.util');
// const MicrosoftGraph = require('@microsoft/microsoft-graph-client');
const cacheUtil = utils.cache;
const XLSX = require('xlsx');
const fs = require('fs');
const getSheetDataFromGridFS = require('../helpers/util/bulkAddUser').getSheetDataFromGridFS;
const getSheetData = require('../helpers/util/bulkAddUser').getSheetData;
const substituteMappingSheetToSchema = require('../helpers/util/bulkAddUser').substituteMappingSheetToSchema;
// const algorithm = 'aes256';
const appController = require('./app.controller');
const passport = require('passport');

var options = {
	logger: logger,
	collectionName: 'userMgmt.users'
};

function md5(data) {
	return crypto.createHash('md5').update(data).digest('hex');
}

// function getApps(_superAdmin, _id, _tokenHash) {
// 	logger.debug(`getApps(_superAdmin, _id) :: ${_superAdmin}, ${_id}`);
// 	if (!_superAdmin) {
// 		return mongoose.model('group').aggregate([{ '$match': { 'users': _id } }, { $group: { _id: '$app' } }])
// 		// .then(_apps => globalCache.setApp(`${_tokenHash}`, _apps));
// 	}
// 	return Promise.resolve();
// }

var generateToken = function (document, response, exp, isHtml, oldJwt, isExtend, _botKey) {
	logger.debug(`Generate token called for ${document._id}`);
	let resObj = JSON.parse(JSON.stringify(document));
	let claim = {
		_id: resObj._id,
		enableSessionRefresh: resObj.enableSessionRefresh,
		sessionTime: resObj.sessionTime,
		bot: resObj.bot,
		keyId: _botKey,
		isSuperAdmin: resObj.isSuperAdmin,
		apps: (resObj.accessControl.apps || []).map(e => e._id)
	};
	const deleteKeys = ['password', '_metadata', 'salt', '_v', 'roles', 'botKeys'];
	deleteKeys.forEach(_k => delete resObj[_k]);
	var token = null;
	let rToken = null;
	let expireIn = document.bot ? envConfig.RBAC_BOT_TOKEN_DURATION : envConfig.RBAC_USER_TOKEN_DURATION;
	// expireIn = expireIn * 60;
	logger.debug(`Is BOT? [${document.bot ? true : false}]`);
	logger.debug(`Token Expiry :: ${expireIn}`);

	let rbacUserToSingleSession = envConfig.RBAC_USER_TO_SINGLE_SESSION;
	if (resObj.bot) rbacUserToSingleSession = false;

	if (exp && !isExtend) {
		claim.exp = exp;
		token = jwt.sign(claim, jwtKey);
		rToken = jwt.sign(claim, refreshSecret);
	} else {
		token = jwt.sign(claim, jwtKey, {
			expiresIn: expireIn
		});
		rToken = jwt.sign(claim, refreshSecret, {
			expiresIn: expireIn
		});
	}
	return crudder.model.findOneAndUpdate({
		'_id': document._id
	}, {
		$currentDate: {
			'_metadata.lastUpdated': true,
			'lastLogin': true
		}
	})
		.then(() => {
			resObj['token'] = token;
			resObj['rToken'] = rToken;
			delete resObj.isActive;
			delete resObj.__v;
			resObj.serverTime = Date.now();
			resObj.expiresIn = (exp && !isExtend) ? exp * 1000 : Date.now() + (expireIn * 1000);
			resObj[_.camelCase('RBAC_USER_TOKEN_DURATION')] = envConfig.RBAC_USER_TOKEN_DURATION;
			resObj[_.camelCase('RBAC_USER_TOKEN_REFRESH')] = envConfig.RBAC_USER_TOKEN_REFRESH;
			resObj[_.camelCase('RBAC_USER_TO_SINGLE_SESSION')] = rbacUserToSingleSession;
			resObj[_.camelCase('RBAC_USER_CLOSE_WINDOW_TO_LOGOUT')] = envConfig.RBAC_USER_CLOSE_WINDOW_TO_LOGOUT;
			resObj[_.camelCase('RBAC_BOT_TOKEN_DURATION')] = envConfig.RBAC_BOT_TOKEN_DURATION;
			resObj[_.camelCase('RBAC_HB_INTERVAL')] = envConfig.RBAC_HB_INTERVAL;
			resObj[_.camelCase('RBAC_PASSWORD_LENGTH')] = envConfig.RBAC_PASSWORD_LENGTH;
			resObj[_.camelCase('RBAC_PASSWORD_COMPLEXITY')] = envConfig.RBAC_PASSWORD_COMPLEXITY;
			resObj[_.camelCase('PRIVATE_FILTER')] = envConfig.PRIVATE_FILTER;
			resObj[_.camelCase('GOOGLE_API_KEY')] = envConfig.GOOGLE_API_KEY;
			resObj[_.camelCase('b2BAgentMaxFileSize')] = envConfig.B2B_AGENT_MAX_FILE_SIZE;
			resObj[_.camelCase('B2B_FLOW_REJECT_ZONE_ACTION')] = envConfig.B2B_FLOW_REJECT_ZONE_ACTION;
			resObj[_.camelCase('B2B_FLOW_MAX_CONCURRENT_FILES')] = envConfig.B2B_FLOW_MAX_CONCURRENT_FILES;
			resObj[_.camelCase('B2B_ENABLE_TIMEBOUND')] = envConfig.B2B_ENABLE_TIMEBOUND;
			resObj[_.camelCase('B2B_ENABLE_TRUSTED_IP')] = envConfig.B2B_ENABLE_TRUSTED_IP;
			resObj[_.camelCase('B2B_ENABLE')] = envConfig.B2B_ENABLE;
			resObj[_.camelCase('EXPERIMENTAL_FEATURES')] = envConfig.EXPERIMENTAL_FEATURES;
			resObj[_.camelCase('FQDN')] = process.env.FQDN;
			resObj['enableSearchIndex'] = envConfig.DS_FUZZY_SEARCH;
			resObj['verifyDeploymentUser'] = envConfig.VERIFY_DEPLOYMENT_USER;
			resObj['defaultTimezone'] = envConfig.dataStackDefaultTimezone;
			resObj['allowedFileExt'] = envConfig.allowedFileExt;
			resObj['transactionsEnabled'] = global.isTransactionAllowed;
			let uuid = cacheUtil.uuid();
			resObj['uuid'] = uuid;
			if (resObj.auth && resObj.auth.authType == 'ldap') delete resObj.auth.dn;
			let id = resObj._id;
			cache.whitelistToken(id, md5(token));
			if (isExtend === true) {
				cache.whitelistToken(id, md5(rToken));
			}
			// if (isExtend === true) {
			// 	return cacheUtil.refreshToken(_botKey ? `B:${id}` : `U:${id}`, md5(oldJwt), md5(token), uuid, resObj.expiresIn, rbacUserToSingleSession, envConfig.RBAC_HB_INTERVAL + 5, isExtend);
			// }
			// return cacheUtil.addUser(_botKey ? `B:${id}` : `U:${id}`, md5(token), rbacUserToSingleSession)
			// 	.then(() => {
			// 		return cacheUtil.addToken(md5(token), resObj.bot ? true : !envConfig.RBAC_USER_CLOSE_WINDOW_TO_LOGOUT, uuid, resObj.expiresIn, envConfig.RBAC_HB_INTERVAL + 5);
			// 	})
			// 	.then(() => {
			// 		if (_botKey) {
			// 			return cacheUtil.addUser(`B:${id}:${_botKey}`, md5(token), rbacUserToSingleSession);
			// 		}
			// 	});
		})
		.then(() => {
			if (isHtml) {
				// const domain = process.env.FQDN ? process.env.FQDN.split(':').shift() : 'localhost';
				// const expires = new Date(resObj.expiresIn).toISOString();
				// let cookieJson = {};
				// if (domain != 'localhost') {
				// 	cookieJson = {
				// 		expires: new Date(resObj.expiresIn),
				// 		httpOnly: domain == 'localhost' ? false : true,
				// 		sameSite: true,
				// 		secure: true,
				// 		domain: domain,
				// 		path: '/api/'
				// 	};
				// }
				// response.cookie('Authorization', 'JWT ' + resObj.token, cookieJson);
				return sendAzureCallbackResponse(response, 200, resObj);
			}
			return response.json(resObj);
		})
		// .then(() => getApps(resObj.isSuperAdmin, resObj._id, md5(resObj.token), md5(oldJwt), resObj.expiresIn, isExtend))
		// .then(() => getApps(resObj.isSuperAdmin, resObj._id, md5(resObj.token)))
		.catch(err => {
			logger.error('Error in generateToken :: ', err);
			if (isHtml) {
				return sendAzureCallbackResponse(response, 500, {
					message: err.message
				});
			}
			return response.status(500).json({
				message: err.message
			});
		});
};

function handleLoginFailure(res, error) {
	res.status(400);
	res.json({
		'message': error && error.message ? error.message : error
	});
}

function serverIssues(err, res) {
	res.status(500);
	res.json({
		'message': err,
		'code': 'SERVER_ERROR'
	});
}

schema.pre('remove', function (next) {
	let self = this;
	if (self._id === 'admin') {
		next(new Error('user admin cannot be deleted'));
	}
	next();
});


schema.post('validate', function (error, doc, next) {
	if (error.errors && error.errors._id) {
		next(new Error('Username is already in use'));
	} else {
		next(error);
	}
});

schema.pre('validate', function (next) {
	let self = this;
	if (!self._id) self._id = self.username;
	next();
});

schema.pre('validate', function (next) {
	logger.trace(JSON.stringify(this));
	if (this.auth && ['ldap', 'azure'].includes(this.auth.authType)) return next();
	if (this.bot) return next();
	// var useregex = /^[0-9a-z_.@]+$/;
	var useregex = /^(([^<>()[\]\\/.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i;
	if (this._id.match(useregex) || this._id == 'admin') {
		next();
	} else {
		next(new Error('Invalid username. Username must be of email-format'));
	}
	// this._v = 1;
	next();
});
schema.pre('validate', function (next) {
	let self = this;
	var emailRegex = /^(([^<>()[\]\\/.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i;
	if ((self.basicDetails.alternateEmail && self.basicDetails.alternateEmail.match(emailRegex)) || self.basicDetails.alternateEmail == null) {
		next();
	} else {
		next(new Error('Invalid email. Must be of email-format'));
	}
	next();
});

schema.pre('validate', function (next) {
	if (this.auth && ((this.auth.authType === 'azure' && !this.bot) || this.auth.authType === 'ldap')) return next();
	if ((!this.auth || !this.auth.authType == 'local' || this.isNew) && this.bot) return next();
	if (((this._id && this.password && this.basicDetails.name) != null) && ((this.basicDetails.name.length && this._id.length) >= 1)) {
		next();
	} else {
		next(new Error('Username, Password and Name are mandatory fields.'));
	}
});


schema.pre('validate', function (next) {
	if (this.auth && ((this.auth.authType === 'azure' && !this.bot) || this.auth.authType === 'ldap')) return next();
	if ((!this.auth || !this.auth.authType == 'local' || this.isNew) && this.bot) return next();
	// if ((this.password.length) >= 8) {
	// 	next();
	// } else {
	// 	next(new Error('Password should contain minimum 8 character.'));
	// }
	next();
});


schema.pre('validate', function (next) {
	if ((!this.basicDetails.phone) || this.basicDetails.phone.length > 7 && this.basicDetails.phone.length < 16) {
		next();
	} else {
		next(new Error('Invalid Phone number.'));
	}
});

schema.pre('validate', function (next) {
	if (this.auth && ['azure', 'ldap'].includes(this.auth.authType)) return next();
	var nameRegex = /^[a-zA-Z0-9-_@#. ]*$/;
	if (this.basicDetails && this.basicDetails.name && this.basicDetails.name.match(nameRegex)) {
		next();
	} else {
		next(new Error('Name can contain alphanumeric and  _ , - , @ , # and . characters only'));
	}
});

schema.pre('validate', function (next) {
	if (this.auth && this.auth.authType === 'azure' && this.bot) {
		var idRegex = /^[a-zA-Z0-9-_@#.]*$/;
		if (this.username && this.username && this.username.match(idRegex)) {
			next();
		} else {
			next(new Error('Client Id can contain alphanumeric and  _ , - , @ , # and . characters only'));
		}
	} else {
		next();
	}
});

schema.pre('save', function (next, req) {
	let self = this;
	this.wasNew = this.isNew;
	this._req = req;
	if (self._metadata.version) {
		self._metadata.version.release = process.env.RELEASE;
	}
	next();
});

schema.pre('save', function (next) {
	let self = this;
	if (!self._id) self._id = self.username;
	next();
});

schema.pre('validate', function (next) {
	let self = this;
	let usernameRegex = new RegExp('^' + self._id + '$', 'i');
	return crudder.model.findOne({
		'_id': usernameRegex
	}).lean(true)
		.then(_doc => {
			if ((self.isNew && _doc) || (_doc && self._id && _doc._id != self._id)) {
				next(new Error('Username already in use.'));
			} else {
				next();
			}
		});
});

schema.pre('save', function (next) {
	if (!this.roles) {
		this.roles = [];
	}
	next();
});

schema.pre('save', utils.counter.getIdGenerator('USR', 'User', null, null, 1000));

schema.pre('save', function (next, req) {
	let self = this;
	this._req = req;
	if (self._metadata.version) {
		self._metadata.version.release = process.env.RELEASE;
	}
	const headers = {};
	const headersLen = req && req.rawHeaders ? req.rawHeaders.length : 0;
	for (let index = 0; index < headersLen; index += 2) {
		headers[req.rawHeaders[index]] = req.rawHeaders[index + 1];
	}
	this._req.headers = headers;
	next();
});

schema.pre('save', function (next) {
	if (this.auth && !this.bot && (this.auth.authType === 'azure' || this.auth.authType === 'ldap')) return next();
	var self = this;
	if (!self.salt) {
		crudder.model.findOne({
			_id: self._id
		})
			.then(_doc => {
				if (_doc) next(new Error(self._id + ' already exists'));
				else {
					self.salt = new Date().toJSON();
					self.password = crypto.createHash('md5').update(self.password + self.salt).digest('hex');
					next();
				}
			});
	} else next();
});

function compareAppsArr(obj1, obj2) {
	return obj1.every(ob1 =>
		obj2.find(ob2 => ob1._id == ob2._id && ob1.type == ob2.type)
	);
}

schema.pre('save', function (next) {
	let self = this;
	if (!self.accessControl) return next();
	if (self.accessControl.accessLevel == 'Selected') {
		let appList = self.accessControl.apps.map(ob => ob._id);
		return mongoose.model('app').find({
			'_id': {
				'$in': appList
			}
		}, {
			_id: 1,
			type: 1
		})
			.then(_d => {
				if (_.isEmpty(_d)) {
					next();
					return;
				}
				if (_d && compareAppsArr(_d, self.accessControl.apps)) {
					next();
				} else {
					next(new Error('App list is invalid'));
				}
			});
	} else {
		next();
	}
});

schema.pre('save', dataStackUtils.auditTrail.getAuditPreSaveHook('userMgmt.users'));

schema.post('save', userLog.updateUser());

schema.post('save', userLog.createUser());

schema.post('save', dataStackUtils.auditTrail.getAuditPostSaveHook('userMgmt.users.audit', client, 'auditQueue'));

schema.post('save', function (doc) {
	if (doc.wasNew && doc.bot) {
		dataStackUtils.eventsUtil.publishEvent('EVENT_BOT_CREATE', 'bot', doc._req, doc);
	} else if (doc.wasNew) {
		dataStackUtils.eventsUtil.publishEvent('EVENT_USER_CREATE', 'user', doc._req, doc);
	}
});

schema.pre('remove', function (next, req) {
	let self = this;
	this._req = req;
	if (self._metadata.version) {
		self._metadata.version.release = process.env.RELEASE;
	}
	const headers = {};
	const headersLen = req && req.rawHeaders ? req.rawHeaders.length : 0;
	for (let index = 0; index < headersLen; index += 2) {
		headers[req.rawHeaders[index]] = req.rawHeaders[index + 1];
	}
	this._req.headers = headers;
	next();
});

schema.pre('remove', dataStackUtils.auditTrail.getAuditPreRemoveHook());

schema.post('remove', dataStackUtils.auditTrail.getAuditPostRemoveHook('userMgmt.users.audit', client, 'auditQueue'));

schema.post('remove', userLog.removeUsers());

schema.pre('remove', function (next, req) {
	this._req = req;
	next();
});

schema.post('remove', function (doc) {
	mongoose.model('preference').find({
		userId: doc._id
	})
		.then(docs => {
			if (docs) {
				return Promise.all(docs.map(_d => _d.remove(doc._req)));
			}
		})
		.then(docs => {
			if (docs) {
				logger.info('Removed ' + docs.map(_d => _d._id) + ' preferences');
			}
			return mongoose.model('group').find({
				'users': doc._id
			});
		})
		.then(_grps => {
			if (_grps) {
				let promises = _grps.map(grp => {
					grp.users = grp.users.filter(_u => _u != doc._id);
					grp.markModified('users');
					return grp.save(doc._req);
				});
				return Promise.all(promises);
			}
		})
		.then(docs => {
			if (docs) {
				logger.info('Removed user from ' + docs.map(_d => _d._id) + ' groups');
			}
			return mongoose.model('app').find({
				'users': doc._id
			});
		})
		.then(_apps => {
			if (_apps) {
				let promises = _apps.map(app => {
					app.users = app.users.filter(_u => _u != doc._id);
					app.markModified('users');
					return app.save(doc._req);
				});
				return Promise.all(promises);
			}
		})
		.then(docs => {
			if (docs) {
				logger.info('Removed user from ' + docs.map(_d => _d._id) + ' app');
			}
		})
		.catch(err => {
			logger.error(err.message);
		});
});

function checkPassword(password) {
	let result = {};
	if (envConfig.RBAC_PASSWORD_COMPLEXITY) {
		const passwordPattern = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[!@#$%^&*?~]).+$/;
		if (password.length >= envConfig.RBAC_PASSWORD_LENGTH) {
			// check complexity
			if (password.match(passwordPattern)) {
				// success
				result = {
					success: true
				};
				return result;
			} else {
				// return password should contain alphanumeric and special characters
				result = {
					success: false,
					message: 'Password must have one of following - Uppercase(A - Z), Lowercase(a - z), Special characters (!@#$%^&*?~) and Numbers (0 - 9)'
				};
				return result;
			}
		} else {
			// return password should contain this many characters
			result = {
				success: false,
				message: `Password should contain ${envConfig.RBAC_PASSWORD_LENGTH} characters`
			};
			return result;
		}
	} else {
		if ((password.length) >= envConfig.RBAC_PASSWORD_LENGTH) {
			//
			result = {
				success: true
			};
			return result;
		} else {
			//
			result = {
				success: false,
				message: `Password should contain ${envConfig.RBAC_PASSWORD_LENGTH} characters`
			};
			return result;
		}
	}
}

function getLoginUserdoc(doc) {
	if (!doc) return null;
	let id = doc._id;
	let userdoc = null;
	return mongoose.model('group').find({
		users: id
	})
		.then(usrGrps => {
			userdoc = JSON.parse(JSON.stringify(doc));
			userdoc.group = usrGrps.map(_grp => {
				return {
					'groupId': _grp._id,
					'groupName': _grp.name
				};
			});
			if (!userdoc.roles) userdoc.roles = [];
			usrGrps.forEach(_grp => {
				if (_grp.roles && _grp.roles.length > 0)
					userdoc.roles = userdoc.roles.concat(_grp.roles);
			});
			let promise = null;
			if (userdoc.isSuperAdmin) {
				promise = mongoose.model('app').find({}, 'type description');
			} else {
				let appList = userdoc.roles ? userdoc.roles.map(_o => _o.app) : [];
				if (userdoc.accessControl && userdoc.accessControl.accessLevel === 'Selected' && userdoc.accessControl.apps) {
					appList = appList.concat(userdoc.accessControl.apps.map(obj => obj._id));
				}
				appList = _.uniq(appList);
				promise = mongoose.model('app').find({
					'_id': {
						'$in': appList
					}
				}, '_id');
			}
			return promise;
		})
		.then(_apps => {
			userdoc['apps'] = _apps;
			return userdoc;
		});
}

async function checkLoginCoolDown(username) {
	const db = global.mongoConnection.db(envConfig.mongoOptions.dbName);
	try {
		let doc = await db.collection('userMgmt.sessions').findOne({
			'username': username,
			'type': 'LOGIN COOLDOWN'
		});
		if (doc) {
			return true;
		} else {
			return false;
		}
	} catch (error) {
		logger.error(error);
	}
}

async function insertLoginFailure(username) {
	const db = global.mongoConnection.db(envConfig.mongoOptions.dbName);
	const collectionName = 'userMgmt.sessions';
	const loginFailed = 'LOGIN FAILED';
	const loginCoolDown = 'LOGIN COOLDOWN';
	try {
		// find all login failure entry
		let failureCount = await db.collection(collectionName).find({
			'username': username,
			'type': loginFailed
		}).count();
		logger.info('Current failure count ', failureCount);
		if ((failureCount + 1) < envConfig.RBAC_USER_LOGIN_FAILURE_THRESHOLD) {
			// insert login failed
			let failureDuration = envConfig.RBAC_USER_LOGIN_FAILURE_DURATION * 1000; // in milliseconds
			let d = new Date();
			d = d.getTime() + failureDuration;
			await db.collection(collectionName).insertOne({
				'username': username,
				'type': loginFailed,
				'expireAt': new Date(d)
			});
		} else {
			// insert login cooldown
			let cooldownDuration = envConfig.RBAC_USER_LOGIN_FAILURE_COOLDOWN * 1000; // in milliseconds
			let d = new Date();
			d = d.getTime() + cooldownDuration;
			await db.collection(collectionName).insertOne({
				'username': username,
				'type': loginCoolDown,
				'expireAt': new Date(d)
			});
		}
	} catch (error) {
		logger.error(error);
	}
}

async function deleteLoginFailure(username) {
	const db = global.mongoConnection.db(envConfig.mongoOptions.dbName);
	const collectionName = 'userMgmt.sessions';
	try {
		await db.collection(collectionName).deleteMany({
			'username': username
		});
	} catch (error) {
		logger.error(error);
	}
}

function findActiveUserbyAuthtype(username, authType) {
	return new Promise((resolve, reject) => {
		crudder.model.findOne({
			_id: new RegExp('^' + username + '$', 'i'),
			'isActive': true,
			'auth.authType': authType
		}).then(user => {
			if (user) {
				logger.debug(`Found user in data.stack with username :: ${username}`);
				resolve(user);
			} else {
				logger.error(`Unable to find user in data.stack with username ${username} for authType ${authType}`);
				reject(new Error('User not found.'));
			}
		}).catch(err => {
			logger.error('Error in findActiveUserbyAuthtype :: ', err);
			reject(err);
		});
	});
}

function validatePassword(userDoc, password) {
	if (userDoc.bot) {
		logger.debug(`${userDoc._id} is a bot. Checking key`);
		let matchedKeyObj = userDoc.botKeys.find(_k => {
			return _k.keyValue == crypto.createHash('md5').update(password + userDoc.salt).digest('hex') && _k.isActive;
		});
		return Promise.resolve(matchedKeyObj ? matchedKeyObj._id : null);
	}
	logger.debug(`Checking ${userDoc._id} is an local user`);
	return Promise.resolve(userDoc.password == crypto.createHash('md5').update(password + userDoc.salt).digest('hex') && userDoc.isActive);
}

async function validateLocalLogin(username, password, done) {
	let botKey = null;
	if (username && password) {
		let doc = null;
		let isCoolDown = await checkLoginCoolDown(username);
		if (!isCoolDown) {
			findActiveUserbyAuthtype(username, 'local')
				.then((dbUser) => {
					doc = dbUser;
					return validatePassword(doc, password);
				})
				.then(_isValidPassword => {
					if (!_isValidPassword) {
						logger.error(`Password check failed for user ${username}`);
						insertLoginFailure(username);
						done(new Error('Invalid Credentials'), false, JSON.parse(JSON.stringify(doc)));
					} else {
						// in case of a bot we get the bot key as response
						if (doc.bot) botKey = _isValidPassword;
						logger.debug(`Bot key :: ${botKey}`);
						logger.info(`Is password valid for ${username} :: true`);
						deleteLoginFailure(username);
						done(null, doc, botKey);
					}
				}).catch(err => {
					insertLoginFailure(username);
					logger.error('Error in validateLocalLogin :: ', err);
					done(err, false, { username, password });
				});
		} else {
			// try after some time
			done(new Error('Please try after some time'), false, { message: 'Please try after some time' });
		}
	} else {
		done(new Error('Invalid Credentials'), false, { username, password });
	}
}

function localLogin(req, res) {
	if (checkAuthMode(res, 'local')) {
		passport.authenticate('local', function (err, user, info) {
			if (err) {
				logger.error('error in local login ::: ', err);
				if (info) userLog.loginFailed(info, req, res);
				return handleLoginFailure(res, err);
			} else if (!user) {
				logger.error('Something went wrong in localLogin:: ', info);
				return handleLoginFailure(res, info);
			} else {
				let botKey = info;
				return handleSessionAndGenerateToken(req, res, user, botKey, false);
			}
		})(req, res);
	}
}

function validateLdapLogin(ldapUser, done) {
	logger.trace('Validating ldap user :: ', ldapUser);
	findActiveUserbyAuthtype(ldapUser.cn, 'ldap')
		.then(dbUser => {
			logger.trace('dbUser in validateLdapLogin :: ', dbUser);
			// For first time logging users
			if (dbUser && JSON.stringify(dbUser.basicDetails) == '{}') {
				let ldapMapping = envConfig.ldapDetails.mapping;
				dbUser.basicDetails = {
					name: ldapUser[ldapMapping.name],
					alternateEmail: ldapUser[ldapMapping.email],
					phone: null
				};
				dbUser.save().then(user => {
					done(null, user);
				});
			} else {
				done(null, dbUser);
			}
		})
		.catch(err => done(err, false));
}

function ldapLogin(req, res) {
	if (checkAuthMode(res, 'ldap')) {
		passport.authenticate('ldapauth', function (err, user, info) {
			if (err) {
				logger.error('error in ldap ::: ', err);
				if (info) userLog.loginFailed(info, req, res);
				return handleLoginFailure(res, err);
			} else if (!user) {
				logger.error('Something went wrong in ldapLogin:: ', info);
				return handleLoginFailure(res, info);
			} else {
				return handleSessionAndGenerateToken(req, res, user, null, false);
			}
		})(req, res);
	}
}

async function validateAzureLogin(iss, sub, profile, accessToken, refreshToken, done) {
	if (!profile.oid || !(profile._json && profile._json.email)) {
		logger.debug('profile:::: ', profile);
		return done(new Error('No oid/email found in profile.'), null);
	}
	try {
		logger.trace('azure acces token ::', accessToken);
		// get user info from azure to get odp username
		let userInfo = await azureAdUtil.getADUserInfo(accessToken);
		logger.debug('search User :: ', userInfo);
		let dbUser = await findActiveUserbyAuthtype(userInfo['username'], 'azure');
		logger.trace('dbUser :: ', dbUser.basicDetails);
		// For first time logging in user
		if (dbUser && JSON.stringify(dbUser.basicDetails) === '{}') {
			dbUser.basicDetails = {
				name: userInfo.name,
				alternateEmail: userInfo.email,
				phone: userInfo.phone
			};
			await dbUser.save();
		}
		let userDoc = await getLoginUserdoc(dbUser);
		done(null, userDoc);
	} catch (err) {
		logger.info('error in validate azure login:: ', err);
		done(err, false);
	}
}

function azureLogin(req, res) {
	logger.debug('Checking Azure Login.');
	if (checkAuthMode(res, 'azure')) {
		passport.authenticate('AzureLogIn', { session: false })(req, res);
	}
}

function azureLoginCallback(req, res) {
	logger.debug('login callback called : ', req.path);
	if (checkAuthMode(res, 'azure')) {
		passport.authenticate('AzureLogIn', {
			response: res,
			failureRedirect: '/'
		},
		function (err, user, info) {
			if (err) {
				logger.error('error in azureLoginCallback ::: ', err);
				if (info) userLog.loginFailed(info, req, res);
				return sendAzureCallbackResponse(res, 500, { message: err.message });
			} else if (!user) {
				logger.error('Something went wrong in azureLoginCallback:: ', info);
				return sendAzureCallbackResponse(res, 400, { meessage: info });
			} else {
				return handleSessionAndGenerateToken(req, res, user, null, true);
			}
		})(req, res);
	}
}

function sendAzureCallbackResponse(res, statusCode, body) {
	return res.end(`
		<script>
    		window.parent.localStorage.setItem('azure-status','${statusCode}');
    		window.parent.localStorage.setItem('azure-body','${JSON.stringify(body)}');
    		window.close();
		</script>
	`);
}

function checkAuthMode(res, authMode) {
	if (envConfig.RBAC_USER_AUTH_MODES.includes(authMode)) {
		return true;
	} else {
		logger.debug('Supported auth modes are :: ', envConfig.RBAC_USER_AUTH_MODES);
		res.status(400).json({
			message: authMode + ' auth mode is not enabled.'
		});
		return false;
	}
}

function handleSessionAndGenerateToken(_req, _res, user, botKey, isHtml) {
	let promise = Promise.resolve();
	if (envConfig.RBAC_USER_TO_SINGLE_SESSION && !user.bot) promise = cacheUtil.checkUser(`U:${user._id}`);
	return promise.then((_d) => {
		if (envConfig.RBAC_USER_TO_SINGLE_SESSION && _d) return cacheUtil.removeUser(`U:${user._id}`);
		else return Promise.resolve();
	}).then(() => {
		userLog.login(JSON.parse(JSON.stringify(user)), _req, _res);
		return generateToken(user, _res, null, isHtml, null, null, botKey);
	}).catch(_err => {
		logger.error(`Login error :: ${_err.message ? _err.message : _err}`);
		if (!_res.headersSent)
			return serverIssues(_err, _res);
	});
}

//to be deleted
// function loginCallbackAzure(req, res) {
// 	let code = req.params.code;
// 	let usr = null;
// 	let configADAttr = null;
// 	return mongoose.model('config').findOne({
// 		'configType': 'auth',
// 		'auth.class': 'AD',
// 		'auth.mode': 'azure',
// 		'auth.enabled': true
// 	})
// 		.then(_d => {
// 			if (!_d) throw new Error('Config is not AzureAD.');
// 			configADAttr = _d && _d.auth && _d.auth.connectionDetails && _d.auth.connectionDetails && _d.auth.connectionDetails.adUsernameAttribute ? _d.auth.connectionDetails.adUsernameAttribute : 'mail';
// 			return azureAdUtil.requestAccessCode(code, 'login');
// 		})
// 		.then(accToken => {
// 			let client = MicrosoftGraph.Client.init({
// 				authProvider: (done) => {
// 					done(null, accToken);
// 				}
// 			});
// 			return client
// 				.api('/me')
// 				.get((err, result) => {
// 					logger.debug(JSON.stringify({
// 						result
// 					}));
// 					if (err) {
// 						return res.end(`<script>
//     window.parent.localStorage.setItem('azure-status','500');
//     window.parent.localStorage.setItem('azure-body','${JSON.stringify({ message: err.message })}');
//     window.close();
//     </script>`);
// 						// return res.status(500).json({ message: err.message });
// 					}
// 					if (!result[configADAttr]) {
// 						return res.end(`<script>
//     window.parent.localStorage.setItem('azure-status','400');
//     window.parent.localStorage.setItem('azure-body','${JSON.stringify({ message: `User ${configADAttr} not found.` })}');
//     window.close();
//     </script>`);
// 						// return res.status(400).json({ message: 'User mail not found' });
// 					}
// 					let usernameRegex = new RegExp('^' + result[configADAttr] + '$', 'i');
// 					crudder.model.findOne({
// 						_id: usernameRegex
// 					})
// 						.then(_usr => {
// 							if (!_usr) {
// 								res.end(`<script>
//     window.parent.localStorage.setItem('azure-status','400');
//     window.parent.localStorage.setItem('azure-body','${JSON.stringify({ message: 'username ' + result[configADAttr] + ' not found' })}');
//     window.close();
//     </script>`);
// 							}
// 							usr = _usr;
// 							if (envConfig.RBAC_USER_TO_SINGLE_SESSION && !usr.bot) {
// 								return cacheUtil.checkUser(`U:${usr._id}`);
// 							}
// 							return null;
// 						})
// 						.then((_d) => {
// 							if (envConfig.RBAC_USER_TO_SINGLE_SESSION && _d) {
// 								return cacheUtil.removeUser(`U:${usr._id}`);
// 							}
// 						})
// 						.then(() => {
// 							return getLoginUserdoc(usr);
// 						})
// 						.then(_d => generateToken(_d, res, false, true))
// 						.catch(err => {
// 							res.status(500).json({
// 								'message': err.message
// 							});
// 						});
// 				});
// 		})
// 		.catch(err => {
// 			res.status(500).json({
// 				message: err.message
// 			});
// 		});
// }

function updatePassword(request, response) {
	// var credentials = crudder.swagMapper(request)['data'];
	var credentials = request.body;
	let id = request.params.id;
	let usrDoc = null;
	crudder.model.findOne({
		'_id': id
	})
		.then(doc => {
			usrDoc = doc;
			if (doc) {
				if (doc.auth && (doc.auth.authType === 'ldap' || (doc.auth.authType === 'azure' && !doc.bot))) {
					return response.status(400).json({
						message: 'Cannot update user password. Contact your AD admin'
					});
				}
				return validatePassword(doc, credentials.oldpassword);
			} else response.status(400).json({
				message: 'Invalid Credentials'
			});
		})
		.then(isPasswordValid => {
			if (isPasswordValid) {
				let result = checkPassword(credentials.newpassword);
				if (result.success) {
					//
					let salt = new Date().toJSON();
					let password = crypto.createHash('md5').update(credentials.newpassword + salt).digest('hex');
					usrDoc.password = password;
					usrDoc.salt = salt;
					usrDoc.save(err => {
						if (err) {
							return response.status(500).send({
								message: 'Something went wrong! Try again later.'
							});
						}
						if (response.status(200)) {
							// userLog.changePassword(request, response);
							closeAllSessionForUser(request, response);
							return response.status(200).send({
								message: 'Updated Password Successfully'
							});
						}
					});
				} else {
					return response.status(400).json({
						message: result.message
					});
				}
			} else {
				if (!response.headersSent)
					response.status(400).json({
						'message': 'Invalid Credentials'
					});
			}
		})
		.catch(err => {
			serverIssues(err, response);
		});
}

function resetPassword(req, res) {
	var credentials = req.body;
	let userDoc = null;
	let id = req.params.id;
	if (credentials.password == credentials.cpassword) {
		let result = checkPassword(credentials.password);
		if (result.success) {
			let salt = new Date().toJSON();
			let password = crypto.createHash('md5').update(credentials.password + salt).digest('hex');
			crudder.model.findOne({
				'_id': id
			})
				.then(doc => {
					if (doc) {
						userDoc = doc;
						doc.password = password;
						doc.salt = salt;
						return doc.save(req);
					} else {
						res.status(400).send({
							message: 'User not valid.'
						});
						throw new Error('User not valid');
					}
				})
				.then(() => {
					userLog.resetPassword(JSON.parse(JSON.stringify(userDoc)), req, res);
				})
				.then(() => {
					if (res.status(200)) {
						closeAllSessionForUser(req, res);

						return res.status(200).send({
							message: 'Updated Password Successfully.'
						});
					}
				})
				.catch(err => {
					logger.error(err);
					if (!res.headersSent) {
						return res.status(500).send({
							message: 'Something went wrong while resetting password! Try again later.'
						});
					}
				});
		} else {
			return res.status(400).json({
				message: result.message
			});
		}
	} else {
		return res.status(400).json({
			message: 'Passwords do not match.'
		});
	}
}

// function validateUserSession(req, res) {
// 	logger.debug('Validate user session called!');
// 	let token = req.get('authorization');
// 	if (!token) return res.status(400).json({
// 		message: 'Invalid session'
// 	});

// 	token = token.split('JWT ')[1];
// 	if (!token) return res.status(400).json({
// 		'message': 'Unauthorized'
// 	});

// 	let tokenHash = md5(token);
// 	logger.debug(`Token hash :: ${tokenHash}`);

// 	return cacheUtil.isBlacklistedToken(tokenHash)
// 		.then(_flag => _flag ? Promise.reject('invalid') : cacheUtil.isValidToken(tokenHash))
// 		.then(_flag => _flag ? _flag : Promise.reject('invalid'))
// 		.then(() => {
// 			try {
// 				let d = jwt.verify(token, jwtKey);
// 				if (d) {
// 					let doc = {};
// 					logger.debug(`Finding user with username :: ${d._id}`);
// 					return crudder.model.findOne({
// 						'_id': d._id,
// 						'isActive': true
// 					})
// 						.then(_doc => doc = _doc)
// 						// .then(() => getRoles(doc._id))
// 						// .then(_roles => roles = _roles.length > 0 ? _roles[0].roles : [])
// 						// .then(() => getApps(doc.isSuperAdmin, doc._id))
// 						// .then(_apps => {
// 						// 	if (doc) {
// 						// 		doc = JSON.parse(JSON.stringify(doc));
// 						// 		doc['apps'] = _apps;
// 						// 		doc['roles'] = roles;
// 						// 		logger.debug(`Found user with username :: ${doc._id}`);
// 						// 		return res.json(doc);
// 						// 	} else throw 'invalid';
// 						// });
// 						.then(() => res.json(doc))
// 					// .then(() => getApps(doc.isSuperAdmin, doc._id, tokenHash));
// 				} else throw 'invalid';
// 			} catch (err) {
// 				logger.error(err);
// 				logger.error('Validate user session : JWT verification failed');
// 				throw 'invalid';
// 			}
// 		})
// 		.catch(_err => {
// 			logger.error(`Error :: ${_err.message ? _err.message : _err}`);
// 			let message;
// 			if (_err == 'invalid')
// 				message = 'Invalid session';
// 			else
// 				message = _err && _err.message ? _err.message : _err;
// 			return res.status(400).json({ message });
// 		});
// }

async function validateUserSession(req, res) {
	try {
		logger.debug('Validate user session called!');
		let token = req.get('authorization');
		if (!token) throw 'invalid';

		token = token.split('JWT ')[1];
		if (!token) throw 'invalid';

		let tokenHash = md5(token);
		logger.debug(`Token hash :: ${tokenHash}`);
		const flag = cache.isTokenBlacklisted(tokenHash);

		if (flag) throw 'invalid';

		const user = jwt.verify(token, jwtKey);
		if (!user) {
			throw 'invalid';
		}
		logger.debug(`Finding user with username :: ${user._id}`);
		const doc = await crudder.model.findOne({
			'_id': user._id,
			'isActive': true
		});
		res.json(doc);
	} catch (err) {
		logger.error(`Error :: ${err.message ? err.message : err}`);
		let message;
		if (err == 'invalid')
			message = 'Invalid session';
		else
			message = err && err.message ? err.message : err;
		return res.status(400).json({ message });
	}
}

// function refreshToken(req, res) {
// 	logger.debug('Refesh token called!');

// 	let token = req.get('authorization');
// 	let refreshToken = req.get('rToken');

// 	logger.trace(token);
// 	logger.trace(refreshToken);

// 	if (!token) return res.status(400).json({
// 		'message': 'Invalid session'
// 	});
// 	if (!refreshToken) return res.status(400).json({
// 		'message': 'Invalid request. Missing refresh token header rToken.'
// 	});

// 	token = token.split(' ')[1];
// 	if (!token) return res.status(400).json({
// 		'message': 'Invalid session'
// 	});

// 	refreshToken = refreshToken.split(' ')[1];
// 	if (!refreshToken) return res.status(400).json({
// 		'message': 'Invalid session'
// 	});

// 	let tokenHash = md5(token);
// 	logger.debug(`Token hash :: ${tokenHash}`);

// 	return cacheUtil.isBlacklistedToken(tokenHash)
// 		.then(_flag => _flag ? Promise.reject('invalid') : cacheUtil.isValidToken(tokenHash))
// 		.then(_flag => _flag ? _flag : Promise.reject('invalid'))
// 		.then(() => {
// 			try {
// 				let d = jwt.verify(token, jwtKey);
// 				let rd = jwt.verify(refreshToken, refreshSecret);
// 				if (d && rd) {
// 					let newToken = null;
// 					let newRToken = null;
// 					let expiresIn = d.exp;
// 					let uuid = cacheUtil.uuid();

// 					if (!envConfig.RBAC_USER_TOKEN_REFRESH) {
// 						newToken = token;
// 						newRToken = refreshToken;
// 					} else {
// 						let newClaim = JSON.parse(JSON.stringify(d));
// 						let newRClaim = JSON.parse(JSON.stringify(rd));
// 						delete newClaim.iat;
// 						delete newClaim.exp;
// 						delete newRClaim.iat;
// 						delete newRClaim.exp;
// 						let expireIn = d.bot ? envConfig.RBAC_BOT_TOKEN_DURATION : envConfig.RBAC_USER_TOKEN_DURATION;
// 						// expireIn = expireIn * 60;

// 						newToken = jwt.sign(newClaim, jwtKey, {
// 							expiresIn: expireIn
// 						});
// 						newRToken = jwt.sign(newRClaim, refreshSecret, {
// 							expiresIn: expireIn
// 						});

// 						expiresIn = Date.now() + (expireIn * 1000);
// 						var userId = d.bot ? `B:${d._id}` : `U:${d._id}`;
// 						cacheUtil.refreshToken(userId, tokenHash, md5(newToken), uuid, expiresIn, envConfig.RBAC_USER_TO_SINGLE_SESSION, envConfig.RBAC_HB_INTERVAL + 5);
// 						if (envConfig.RBAC_USER_TO_SINGLE_SESSION)
// 							cacheUtil.blacklist(tokenHash);
// 						// Letting token expire itself when single session is disabled.
// 					}
// 					userLog.refreshToken(req.user, req, res);
// 					let userData = req.user;
// 					return getApps(userData.isSuperAdmin, userData._id, md5(newToken)).then(() => res.json({
// 						token: newToken,
// 						rToken: newRToken,
// 						expiresIn: expiresIn,
// 						serverTime: Date.now(),
// 						uuid: uuid
// 					}));
// 				} else throw 'invalid';
// 			} catch (err) {
// 				logger.error(err);
// 				logger.error('Validate user session : JWT verification failed');
// 				throw 'invalid';
// 			}
// 		})
// 		.catch(_err => {
// 			logger.error(`Error :: ${_err.message ? _err.message : _err}`);
// 			let message;
// 			if (_err == 'invalid')
// 				message = 'Invalid session';
// 			else
// 				message = _err && _err.message ? _err.message : _err;
// 			return res.status(400).json({ message });
// 		});
// }

async function refreshToken(req, res) {
	logger.debug('Refesh token called!');
	try {
		let token = req.get('authorization');
		let refreshToken = req.get('rToken');

		logger.trace(token);
		logger.trace(refreshToken);

		if (!token) throw 'invalid';
		if (!refreshToken) throw 'invalid_refresh';

		token = token.split(' ')[1];
		if (!token) throw 'invalid';

		refreshToken = refreshToken.split(' ')[1];
		if (!refreshToken) throw 'invalid_refresh';

		let tokenHash = md5(token);
		logger.debug(`Token hash :: ${tokenHash}`);

		const flag = await cache.isTokenBlacklisted(tokenHash);

		if (flag) throw 'invalid';

		let d = jwt.verify(token, jwtKey);
		let rd = jwt.verify(refreshToken, refreshSecret);
		if (d && rd) {
			let newToken = null;
			let newRToken = null;
			let expiresIn = d.exp;
			let uuid = cacheUtil.uuid();

			if (!envConfig.RBAC_USER_TOKEN_REFRESH) {
				newToken = token;
				newRToken = refreshToken;
			} else {
				let newClaim = JSON.parse(JSON.stringify(d));
				let newRClaim = JSON.parse(JSON.stringify(rd));
				delete newClaim.iat;
				delete newClaim.exp;
				delete newRClaim.iat;
				delete newRClaim.exp;
				let expireIn = d.bot ? envConfig.RBAC_BOT_TOKEN_DURATION : envConfig.RBAC_USER_TOKEN_DURATION;
				// expireIn = expireIn * 60;

				newToken = jwt.sign(newClaim, jwtKey, {
					expiresIn: expireIn
				});
				newRToken = jwt.sign(newRClaim, refreshSecret, {
					expiresIn: expireIn
				});

				expiresIn = Date.now() + (expireIn * 1000);
				await cache.whitelistToken(d._id, md5(newToken));
				await cache.whitelistToken(d._id, md5(newRToken));
				if (envConfig.RBAC_USER_TO_SINGLE_SESSION) {
					cache.blacklistToken(tokenHash);
				}
			}
			userLog.refreshToken(req.user, req, res);
			res.json({
				token: newToken,
				rToken: newRToken,
				expiresIn: expiresIn,
				serverTime: Date.now(),
				uuid: uuid
			});
		} else {
			throw 'invalid';
		}
	} catch (err) {
		logger.error('Validate user session : JWT verification failed');
		logger.error(err);
		let message;
		if (err == 'invalid') {
			message = 'Invalid Session';
		} else if (err == 'invalid_refresh') {
			message = 'Invalid Refresh Token';
		} else {
			message = err && err.message ? err.message : err;
		}

		res.status(400).json({ message });
	}
}

async function checkAndExtendUserSession(_req, _res, _isExtend) {
	logger.debug('Check user session called!');
	try {
		let token = _req.get('authorization');
		if (!token) throw 'invalid';

		token = token.split('JWT ')[1];
		if (!token) throw 'invalid';

		let tokenHash = md5(token);
		logger.debug(`Token hash :: ${tokenHash}`);

		let flag = await cache.isTokenBlacklisted(tokenHash);
		if (flag) throw 'invalid';

		const data = jwt.verify(token, jwtKey);
		if (!data) throw 'invalid';

		flag = await cache.isValidToken(data._id, tokenHash);
		if (!flag) throw 'invalid';

		logger.debug(`Finding user with username :: ${data._id}`);
		const user = await crudder.model.findOne({
			'_id': data._id,
			'isActive': true
		});
		if (!user) throw 'invalid';
		logger.debug(`Found user with username :: ${user._id}`);
		const botKey = data.bot && data.keyId ? data.keyId : null;
		return generateToken(user, _res, data.exp, false, token, _isExtend, botKey);
	} catch (err) {
		logger.error(`Error :: ${err.message ? err.message : err}`);
		let message;
		if (err == 'invalid')
			message = 'Invalid session';
		else
			message = err && err.message ? err.message : err;
		return _res.status(400).json({ message });
	}
}

// function checkAndExtendUserSession(_req, _res, _isExtend) {
// 	logger.debug('Check user session called!');
// 	let token = _req.get('authorization');
// 	if (!token) return _res.status(400).json({
// 		message: 'Invalid session'
// 	});

// 	token = token.split('JWT ')[1];
// 	if (!token) return _res.status(400).json({
// 		'message': 'Unauthorized'
// 	});

// 	let tokenHash = md5(token);
// 	logger.debug(`Token hash :: ${tokenHash}`);

// 	return cacheUtil.isBlacklistedToken(tokenHash)
// 		.then(_flag => _flag ? Promise.reject('invalid') : cacheUtil.isValidToken(tokenHash))
// 		.then(_flag => _flag ? _flag : Promise.reject('invalid'))
// 		.then(() => {
// 			try {
// 				let d = jwt.verify(token, jwtKey);
// 				if (d) {
// 					logger.debug(`Finding user with username :: ${d._id}`);
// 					return crudder.model.findOne({
// 						'_id': d._id,
// 						'isActive': true
// 					})
// 						.then(_doc => {
// 							if (_doc) {
// 								logger.debug(`Found user with username :: ${_doc._id}`);
// 								let botKey = d.bot && d.keyId ? d.keyId : null;
// 								return generateToken(_doc, _res, d.exp, false, token, _isExtend, botKey);
// 							} else throw 'invalid';
// 						});
// 				} else throw 'invalid';
// 			} catch (err) {
// 				logger.error(err);
// 				logger.error('Validate user session : JWT verification failed');
// 				throw 'invalid';
// 			}
// 		})
// 		.catch(_err => {
// 			logger.error(`Error :: ${_err.message ? _err.message : _err}`);
// 			let message;
// 			if (_err == 'invalid')
// 				message = 'Invalid session';
// 			else
// 				message = _err && _err.message ? _err.message : _err;
// 			return _res.status(400).json({ message });
// 		});
// }

function checkUserSession(req, res) {
	return checkAndExtendUserSession(req, res, false);
}

function extendSession(req, res) {
	return checkAndExtendUserSession(req, res, true);
}

function init() {
	let users = require('../../config/users.js');
	return new Promise((_resolve, _reject) => {
		crudder.model.find({}).count()
			.then(_d => {
				if (_d == 0) {
					return users.reduce((_p, _c) => {
						return _p.then(() => {
							return crudder.model.create(_c)
								.then(_d => {
									logger.info('Added user :: ' + _d._id);
								},
								_e => {
									logger.error('Error adding user :: ' + _c._id);
									logger.error(_e);
								});
						});
					}, new Promise(_resolve2 => _resolve2()))
						.then(() => _resolve());
				} else _resolve();
			}, () => _reject());
	});
}

var crudder = new SMCrud(schema, 'user', options);

function modifyFilter(req) {
	let apps = req.params.apps ? req.params.apps.split(',') : [];
	if (!apps.length) return Promise.resolve();
	let filter = req.query.filter;
	if (filter && typeof filter === 'string') {
		filter = JSON.parse(filter);
	}
	return mongoose.model('group').find({
		app: { $in: apps }
	})
		.then(_grps => {
			let users = [].concat.apply([], _grps.map(_g => _g.users));
			if (filter && typeof filter === 'object') {
				filter = {
					$and: [filter, {
						'$or': [{
							'_id': {
								'$in': users
							}
						}, {
							'isSuperAdmin': true
						}]
					}]
				};
			} else {
				filter = {
					'$or': [{
						'_id': {
							'$in': users
						}
					}, {
						'isSuperAdmin': true
					}]
				};
			}
			req.query.filter = JSON.stringify(filter);
		});
}
function customIndex(_req, _res) {
	let omitKeys = ['-salt', '-password'];
	let select = _req.query.select ? _req.query.select.split(',') : [];
	let _idIndex = select.indexOf('-_id');
	if (_idIndex > -1) select.splice(_idIndex, 1);
	if (select.indexOf('password') > -1) select.splice(select.indexOf('password'), 1);
	if (select.indexOf('salt') > -1) select.splice(select.indexOf('salt'), 1);
	if (select.length == 0) select = select.concat(omitKeys);
	_idIndex > -1 ? select.push('-_id') : null;
	select = select.join(',');
	_req.query.select = select;
	let apps = _req.params.apps;
	if (apps) {
		return modifyFilter(_req).then(() => crudder.index(_req, _res));
	}
	return crudder.index(_req, _res);
}

function customCount(_req, _res) {
	let apps = _req.params.apps;
	if (apps) {
		return modifyFilter(_req).then(() => crudder.count(_req, _res));
	}
	return crudder.count(_req, _res);
}

function customUpdate(req, res) {
	let isBot = req.body.bot;
	let arr = ['password', 'accessControl', 'isSuperAdmin', 'salt', '_metadata', 'bot', 'lastLogin', 'botKeys', 'auth', '__v'];
	arr.forEach(_k => {
		delete req.body[_k];
	});
	var body = req.body;
	if (body._id) {
		delete req.body._id;
	}
	let oldValues = null;
	let updated = null;
	let id = req.params.id;
	if (req.body.username && req.body.username != id) {
		return res.status(400).json({
			message: 'Username cannot be changed.'
		});
	}
	return crudder.model.findOne({
		'_id': id,
		'_metadata.deleted': false
	})
		.then(_document => {
			if (!_document) {
				return res.status(404).send();
			}
			oldValues = _document.toObject();
			updated = _.mergeWith(_document, body, customizer);
			if (body.attributes)
				updated.attributes = body.attributes;
			if (_.isEqual(JSON.parse(JSON.stringify(updated)), JSON.parse(JSON.stringify(oldValues)))) return;
			updated = new crudder.model(updated);
			Object.keys(body).forEach(el => updated.markModified(el));
			return updated.save(req);
		})
		.then(() => {
			publishUserOrBotUpdates(isBot, updated, oldValues, req);
			return res.status(200).json(updated);
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({
				message: err.message
			});
		});
}

function publishUserOrBotUpdates(isBot, newData, oldData, req) {
	let source, eventId1, eventId2;
	if (isBot) {
		source = 'bot';
		eventId1 = 'EVENT_BOT_UPDATE_BASICDETAILS';
		eventId2 = 'EVENT_BOT_UPDATE_ATTRIBUTES';
	} else {
		source = 'user';
		eventId1 = 'EVENT_USER_UPDATE_BASICDETAILS';
		eventId2 = 'EVENT_USER_UPDATE_ATTRIBUTES';
	}
	let newBasicDetails = newData.basicDetails ? JSON.parse(JSON.stringify(newData.basicDetails)) : {};
	let oldBasicDetails = oldData.basicDetails ? JSON.parse(JSON.stringify(oldData.basicDetails)) : {};
	let newAttibutes = newData.attributes ? JSON.parse(JSON.stringify(newData.attributes)) : {};
	let oldAttibutes = oldData.attributes ? JSON.parse(JSON.stringify(oldData.attributes)) : {};
	if (!_.isEqual(newBasicDetails, oldBasicDetails))
		dataStackUtils.eventsUtil.publishEvent(eventId1, source, req, newData);
	if (!_.isEqual(newAttibutes, oldAttibutes))
		dataStackUtils.eventsUtil.publishEvent(eventId2, source, req, newData);
}

function customizer(objValue, srcValue) {
	if (_.isArray(objValue)) {
		return srcValue;
	}
}

function customCreate(req, res) {
	req.body._id = (!req.body._id && req.body.bot) ? cacheUtil.uuid() : req.body._id;
	let authType = req.body.auth && req.body.auth.authType ? req.body.auth.authType : 'local';
	if (!envConfig.RBAC_USER_AUTH_MODES.includes(authType)) {
		logger.error(authType + ' auth mode is not supported.');
		return res.status(400).json({
			message: authType + ' auth mode is not supported.'
		});
	}
	if (!req.body.accessControl) {
		req.body.accessControl = {
			accessLevel: 'None',
			app: []
		};
	}
	let password = req.body.password;
	let result = checkPassword(password);
	if (result.success) {
		crudder.create(req, res);
	} else {
		return res.status(400).json({
			message: result.message
		});
	}
}

function createBotKey(req, res) {
	let data = req.body;
	let uuid = cacheUtil.uuid();
	let botId = req.params._id;
	let resKeyValue = '';
	let botData;
	//condition based -
	for (var i = 0; i < 5; i++)
		resKeyValue += Math.random().toString(36).substring(2, 6) + '-';
	resKeyValue += Math.random().toString(36).substring(2, 6);

	let collectionObj = {
		_id: uuid,
		label: data.label,
		expires: data.expires,
		isActive: true,
		createdAt: new Date()
	};

	return crudder.model.findOne({
		'_id': botId
	})
		.then(document => {
			if (!document) {
				return res.status(404).send();
			}

			if (document.botKeys.find(item => item.label == data.label)) {
				res.status(400).json({
					message: 'Label already exists'
				});
				throw new Error('Label already exists');
			}

			let hashKeyValue = crypto.createHash('md5').update(resKeyValue + document.salt).digest('hex');
			botData = document;
			collectionObj.keyValue = hashKeyValue;
			document.botKeys.push(collectionObj);
			document.save(req);
		})
		.then(() => {
			collectionObj.keyValue = resKeyValue;
			dataStackUtils.eventsUtil.publishEvent('EVENT_BOT_KEYS_ADDED', 'bot', req, botData);
			return res.status(200).json(collectionObj);
		})
		.catch(err => {
			logger.error(err);
			if (!res.headersSent)
				return res.status(500).json({
					message: err.message
				});
		});
}

function endSessionForBotKey(botId, keyId) {
	let idToEndSession = `B:${botId}:${keyId}`;
	return cacheUtil.removeUser(idToEndSession);
}

function endBotKeySession(req, res) {
	let botId = req.params._id;
	let data = req.body;
	if (!data || !data.keyId) return res.status(500).json({
		message: 'Please provide the Bot\'s keyId'
	});
	return endSessionForBotKey(botId, data.keyId)
		.then(() => {
			return res.status(200).json({
				message: 'Bot Key\'s session ended!'
			});
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({
				message: err.message
			});
		});
}

function endSessionForUser(userObject) {
	let idToEndSession = null;
	if (!userObject.bot) {
		cache.endSession(userObject._id);
		return cacheUtil.removeUser(`U:${userObject._id}`);
	} else {
		let promises = userObject.botKeys.map(obj => {
			idToEndSession = 'B:' + userObject._id + ':' + obj._id;
			return cacheUtil.removeUser(idToEndSession);
		});
		return Promise.all(promises);
	}
}

function updateBotKey(req, res) {
	let data = req.body;
	let botId = req.params._id;
	let responseObj = null;
	let endSessionFlag = false;
	if (data.keyValue) {
		delete data.keyValue;
	}
	let eventId;
	return crudder.model.findOne({
		'_id': botId,
		'bot': true,
		'botKeys._id': data.keyId
	})
		.then((document) => {
			if (!document) {
				return res.status(404).send();
			}
			document.botKeys.forEach((obj) => {
				if (obj._id === data.keyId) {
					if (data.expires != undefined && data.expires !== obj.expires) {
						obj.expires = data.expires;
						endSessionFlag = true;
					}
					if (data.label != undefined && data.label !== obj.label)
						obj.label = data.label;
					if (data.isActive != undefined && data.isActive !== obj.isActive) {
						obj.isActive = data.isActive;
						endSessionFlag = true;
						eventId = data.isActive ? 'EVENT_BOT_KEYS_ACCESS_ACTIVATED' : 'EVENT_BOT_KEYS_ACCESS_DEACTIVATED';
					}
					if (endSessionFlag)
						endSessionForBotKey(botId, data.keyId);
				}
			});
			document.markModified('botKeys');
			responseObj = document.toObject();
			return document.save(req);
		})
		.then(() => {
			dataStackUtils.eventsUtil.publishEvent(eventId, 'bot', req, data);
			res.status(200).json(responseObj);
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({
				message: err.message
			});
		});
}

function disableUser(req, res) {
	let botId = req.params._id;
	let status = (req.params.userState === 'enable') ? true : false;
	let isBot = (req.params.userType === 'bot') ? true : false;
	let responseObj = null;
	return crudder.model.findOne({
		'_id': botId,
		'bot': isBot
	})
		.then((document) => {
			if (!document) {
				res.status(404).send();
				throw new Error('Not found');
			}
			document.isActive = status;
			document.save(req);
			responseObj = document.toObject();
			if (!status) {
				return endSessionForUser(responseObj);
			}
		})
		.then(() => {
			if (isBot) {
				let eventId = status ? 'EVENT_BOT_ACCESS_LOGIN_ENABLED' : 'EVENT_BOT_ACCESS_LOGIN_DISABLED';
				dataStackUtils.eventsUtil.publishEvent(eventId, 'bot', req, responseObj);
			} else {
				let eventId = status ? 'EVENT_BOT_ACCESS_LOGIN_ENABLED' : 'EVENT_BOT_ACCESS_LOGIN_DISABLED';
				dataStackUtils.eventsUtil.publishEvent(eventId, 'user', req, responseObj);
			}
			return res.status(200).json(responseObj);
		})
		.catch(err => {
			logger.error(err);
			if (!res.headersSent)
				return res.status(500).json({
					message: err.message
				});
		});
}

/* 
botId - path
{
	keyId
	_id
}
*/
function deleteBotKey(req, res) {
	let botId = req.params._id;
	return crudder.model.findOne({
		'_id': botId,
		'bot': true,
		'botKeys._id': req.body.keyId
	})
		.then(document => {
			if (!document) {
				res.status(404).send();
				throw new Error('Not found');
			}
			document.botKeys = _.filter(document.botKeys, function (o) {
				return o._id != req.body.keyId;
			});
			document.markModified('botKeys');
			return document.save(req);
		})
		.then((doc) => {
			dataStackUtils.eventsUtil.publishEvent('EVENT_BOT_KEYS_DELETED', 'bot', req, doc.toObject());
			return res.status(200).json(doc.toObject());
		})
		.catch(err => {
			logger.error(err);
			if (!res.headersSent)
				return res.status(500).json({
					message: err.message
				});
		});
}

function getRolesList(req, res) {
	let searchText = req.params.text;
	let id = req.params.id;
	let idType = req.params.idType;
	let entity = req.params.entity;
	let regex = new RegExp(searchText, 'i');
	let promise = null;
	if (id && idType === 'user') promise = crudder.model.findOne({
		'_id': id
	}).lean(true);
	else if (id && idType === 'group') promise = mongoose.model('group').findOne({
		'_id': id
	}).lean(true);
	else promise = Promise.resolve();
	promise.then(usr => {
		let agg1 = {
			'$match': {
				'roles.name': regex
			}
		};
		let agg3 = {
			'$match': {
				'roles.name': regex
			}
		};
		if (entity) {
			agg1['$match']['entity'] = entity;
			agg3['$match']['entity'] = entity;
		}
		if (usr) {
			if (usr.roles && usr.roles.length > 0) {
				let rolesMatch = usr.roles.map(_r => {
					return {
						'$or': [{
							'roles.id': {
								'$ne': _r.id
							}
						}, {
							'app': {
								'$ne': _r.app
							}
						}]
					};
				});
				agg3['$match']['$and'] = rolesMatch;
			}
			if (idType === 'user' && usr.accessControl && usr.accessControl.accessLevel === 'Selected') {
				let appList = usr.accessControl.apps ? usr.accessControl.apps.map(_d => _d._id) : null;
				if (appList) {
					agg1['$match']['app'] = {
						'$in': appList
					};
					agg3['$match']['app'] = {
						'$in': appList
					};
				}
			}
		}
		return mongoose.model('roles').aggregate([
			agg1,
			{
				'$unwind': '$roles'
			},
			agg3,
			{
				'$project': {
					'app': 1,
					'roles.id': 1,
					'roles.name': 1,
					'entity': 1
				}
			}
		]);
	})
		.then(roles => {
			if (roles) {
				res.json(roles);
			} else {
				res.status(404).json({
					message: 'Roles not found'
				});
			}
		})
		.catch(err => {
			if (!res.headersSent) {
				res.status(500).json({
					message: err.message
				});
			}
		});
}

function getRolesType(req, res) {
	let usrId = req.params.userId;
	let oprtns;
	let CUD = 0,
		view = 0;
	if (usrId) {
		crudder.model.findOne({
			'_id': usrId
		})
			.then(_usr => {
				if (_usr.roles) {
					oprtns = _usr.roles.map(e => {
						let roleObj = {};
						roleObj['entity'] = e.entity;
						roleObj['app'] = e.app;
						roleObj['roles.id'] = e.id;
						return roleObj;
					});
					if (oprtns.length > 0) {
						mongoose.model('roles').find({
							'$or': oprtns
						})
							.then(_roleList => {
								_roleList.forEach(_role => {
									_role.roles.forEach(r => {
										r.operations.forEach(mthd => {
											if (mthd.method === 'POST' || mthd.method === 'PUT' || mthd.method === 'DELETE') {
												CUD = CUD + 1;
											} else if (mthd.method === 'GET') {
												view = view + 1;
											}
										});
									});
								});
								res.status(200).json({
									CUDRole: CUD,
									viewRole: view
								});
							})
							.catch(err => {
								res.status(500).json({
									message: err.message
								});
							});
					} else {
						res.status(200).json({
							CUDRole: 0,
							viewRole: 0
						});
					}
				} else {
					res.status(200).json({
						CUDRole: 0,
						viewRole: 0
					});
				}
			})
			.catch(err => {
				res.status(500).json({
					message: err.message
				});
			});
	}
}

async function logout(req, res) {
	try {
		let token = req.get('Authorization') ? req.get('Authorization').split('JWT ')[1] : null;
		await userLog.logout(req, res);
		if (!token) return res.status(400).json({
			message: 'Authorization token not found'
		});
		// let tokenHash = md5(token);
		// globalCache.unsetApp(tokenHash);
		const user = jwt.verify(token, jwtKey);
		await cache.endSession(user._id);
		await cache.unsetUserPermissions(user._id);
		res.status(200).json({
			message: 'logged out successfully'
		});
		// return cacheUtil.blacklist(md5(token))
		// 	.then(() => {
		// 		if (envConfig.RBAC_USER_TO_SINGLE_SESSION) return cacheUtil.removeUser(`U:${req.user._id}`);
		// 	});
	} catch (err) {
		logger.error(err.message);
		if (!req.headersSent) {
			res.status(500).json({
				message: err.message
			});
		}
	}
}

function getAllRolesofUser(req, res) {
	let id = req.params.id;
	let user = null;
	let filter = req.query.filter;
	try {
		if (filter && typeof filter == 'string') filter = JSON.parse(filter);
	} catch (err) {
		logger.error(err);
		return res.status(500).json({
			message: err.message
		});
	}
	return crudder.model.findOne({
		_id: id
	}, 'roles').lean(true)
		.then(usr => {
			if (usr) {
				user = usr;
				let promise = Promise.resolve([]);
				if (filter) {
					promise = mongoose.model('group').aggregate([{
						$match: {
							users: usr._id
						}
					},
					{
						$unwind: '$roles'
					},
					{
						$match: filter
					},
					{
						$project: {
							roles: 1
						}
					}
					]);
				} else {
					promise = mongoose.model('group').find({
						users: usr._id
					}, {
						roles: 1
					});
				}
				return promise;
			} else {
				res.status(404).json({
					message: 'User not found'
				});
			}
		})
		.then(_grps => {
			if (!user.roles) user.roles = [];
			if (_grps) {
				if (filter) {
					user.roles = user.roles.concat(_grps.map(_o => _o.roles));
				} else {
					_grps.forEach(_grp => {
						if (_grp.roles && _grp.roles.length > 0)
							user.roles = user.roles.concat(_grp.roles);
					});
				}

			}
			if (user) {
				res.json(user);
			}
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({
				message: err.message
			});
		});
}

async function authType(req, res) {
	try {
		let username = req.params.id;
		let resObj = {};
		const user = await crudder.model.findOne({ _id: username }).lean();
		if (!user) {
			return res.status(404).json({
				message: 'Couldn\'t find your account'
			});
		}
		resObj.authType = user.auth && user.auth.authType ? user.auth.authType : 'local';
		if (user && !user.bot) {
			resObj.sessionActive = await cache.isSessionActive(user._id);
		}
		resObj.bot = user.bot;
		resObj.name = user.basicDetails ? user.basicDetails.name : user._id;
		resObj[_.camelCase('RBAC_USER_TO_SINGLE_SESSION')] = envConfig.RBAC_USER_TO_SINGLE_SESSION;
		resObj[_.camelCase('RBAC_USER_RELOGIN_ACTION')] = envConfig.RBAC_USER_RELOGIN_ACTION;
		resObj['fqdn'] = process.env.FQDN;
		resObj['validAuthTypes'] = envConfig['RBAC_USER_AUTH_MODES'];
		res.json(resObj);
	} catch (err) {
		logger.error(err);
		if (!res.headersSent) {
			res.status(500).json({
				message: err.message
			});
		}
	}
}

function getAppList(usrId) {
	return mongoose.model('group').find({
		'users': usrId
	}, 'app')
		.then(_grps => {
			return _grps.map(_g => _g.app);
		});
}

function getUserAppList(req, res) {
	let usrId = req.params.usrId;
	let requestingUsrId = req.user ? req.user._id : null;
	let requestingUsrIdApps = null;
	if (req.user.isSuperAdmin) {
		return getAppList(usrId)
			.then(_apps => {
				res.json({
					apps: _.uniq(_apps)
				});
			})
			.catch(err => {
				logger.error(err.message);
				res.status(500).json({
					message: err.message
				});
			});
	}
	return getAppList(requestingUsrId)
		.then(_apps => {
			requestingUsrIdApps = _apps;
			return getAppList(usrId);
		})
		.then(_apps => {
			res.json({
				apps: _.uniq(_.intersection(_apps, requestingUsrIdApps))
			});
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function createUserinGroups(req, res) {
	let groups = req.body.groups;
	let app = req.params.app;
	let createdUser = null;
	let UserModel = crudder.model;
	// console.log(JSON.stringify(req.body));
	let user = req.body.user;
	let authType = user.auth ? user.auth.authType : 'local';
	if (!envConfig.RBAC_USER_AUTH_MODES.includes(authType)) {
		logger.error(authType + ' auth mode is not supported.');
		return res.status(400).json({
			message: authType + ' auth mode is not supported.'
		});
	}
	if (user && user.bot) {
		user._id = user._id ? user._id : (user.username ? user.username : cacheUtil.uuid());
		user.username = user._id;
	}
	if (!user.accessControl) {
		user.accessControl = {
			accessLevel: 'None',
			apps: []
		};
	}
	let userDoc = new UserModel(user);
	return userDoc.save(req)
		.then(_d => {
			createdUser = JSON.parse(JSON.stringify(_d));
			if (createdUser && !createdUser.bot) {
				let eventDoc = Object.assign(createdUser, {
					app: app,
					name: createdUser.basicDetails ? createdUser.basicDetails.name : createdUser._id
				});
				dataStackUtils.eventsUtil.publishEvent('APP_USER_ADDED', 'app', req, eventDoc);
			}
			return mongoose.model('group').find({
				$or: [{
					_id: {
						'$in': groups
					}
				}, {
					name: '#',
					app: app
				}]
			});
		})
		.then(_grps => {
			if (_grps.some(_g => _g.app != app)) {
				res.status(400).json({
					message: 'Groups are not present in app ' + app
				});
				return;
			}
			let promises = _grps.map(_grp => {
				_grp.users.push(createdUser._id);
				return _grp.save(req);
			});
			return Promise.all(promises);
		})
		.then(_d => {
			if (_d) {
				delete createdUser.salt;
				delete createdUser.password;
				res.json({
					user: createdUser,
					groups: _d.map(_o => _o._id)
				});
			}
		}, err => {
			if (err) {
				logger.error('Error in createUserinGroups :: ', err);
				res.status(400).json({
					message: err.message
				});
			}
		})
		.catch(err => {
			logger.error('Error in createUserinGroups :: ', err);
			res.status(500).json({
				message: err.message
			});
		});
}

function addUserToGroups(req, res) {
	let usrId = req.params.usrId;
	let groups = req.body.groups;
	let groupDocs = null;
	let data = null;
	let app;
	return mongoose.model('group').find({ _id: { '$in': groups } })
		.then(_grps => {
			groupDocs = _grps;
			let promises = _grps.map(_grp => {
				app = _grp.app;
				_grp.users.push(usrId);
				return _grp.save(req);
			});
			return Promise.all(promises);
		})
		.then(async (_d) => {
			data = _d;
			const hashGroup = await mongoose.model('group').findOne({ name: '#', app: app });
			if (hashGroup) {
				hashGroup.users.push(usrId);
				return await hashGroup.save(req);
			}
			return;
		})
		.then(() => {
			return crudder.model.findOne({
				_id: usrId
			});
		})
		.then(docs => {
			return userLog.userAddedInTeam(req, res, docs, groupDocs);
		})
		.then(() => {
			res.json({
				user: usrId,
				groups: data.map(_o => _o._id)
			});
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function removeUserFromGroups(req, res) {
	let usrId = req.params.usrId;
	let groups = req.body.groups;
	return mongoose.model('group').find({
		_id: {
			'$in': groups
		}
	})
		.then(_grps => {
			let promises = _grps.map(_grp => {
				//_grp.users.push(usrId);
				_grp.users = _grp.users.filter(function remove(value) {
					return value != usrId;
				});
				return _grp.save(req);
			});
			return Promise.all(promises);
		})
		.then(groupDocs => {
			userLog.userRemovedFromTeam(req, res, groupDocs, usrId);
			return res.json({
				user: usrId,
				groups: groupDocs.map(_g => _g._id)
			});
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({
				message: err.message
			});
		});
}

function editAppAdmin(req, res) {
	let userId = req.params.userId;
	logger.debug(`Requested userID : ${userId}`);
	if (req.user._id === userId) {
		return res.status(400).json({
			message: 'User cannot modify his own app admin permission'
		});
	}
	logger.debug(`Requested apps : ${JSON.stringify(req.body.apps)}`);
	let apps = req.body.apps;
	let docs = null;
	let action = req.params.action;
	let userData;
	logger.debug(`Requested action : ${action}`);
	return crudder.model.findOne({
		_id: userId
	})
		.then(_user => {
			if (_user) {
				if (_user.accessControl && _user.accessControl.accessLevel === 'Selected') {
					if (_user.accessControl.apps) {
						if (action === 'grant')
							_user.accessControl.apps = _user.accessControl.apps.concat(apps.map(_a => {
								return {
									_id: _a,
									'type': 'Management'
								};
							}));
						else if (action === 'revoke') {
							_user.accessControl.apps = _user.accessControl.apps.filter(_a => apps.indexOf(_a._id) === -1);
						}
					} else {
						if (action === 'grant') _user.accessControl.apps = apps.map(_a => {
							return {
								_id: _a,
								'type': 'Management'
							};
						});
					}
				} else {
					if (action === 'grant') {
						_user.accessControl = {
							accessLevel: 'Selected',
							apps: apps.map(_a => {
								return {
									_id: _a,
									'type': 'Management'
								};
							})
						};
					}
				}
				userData = _user;
				_user.markModified('accessControl.apps');
				return _user.save(req);
			} else {
				res.status(400).json({
					message: 'User not found'
				});
			}
		})
		.then(_d => {
			docs = _d;
			return crudder.model.findOne({
				_id: req.params.userId
			});
		})
		.then(data => {
			return userLog.appAdminAccess(req, res, action, data, apps);
		})
		.then(() => {
			if (docs) {
				logger.trace(JSON.stringify(docs));
				let eventId = action == 'grant' ? 'EVENT_USER_ACCESS_APPADMIN_GRANTED' : 'EVENT_USER_ACCESS_APPADMIN_REVOKED';
				dataStackUtils.eventsUtil.publishEvent(eventId, 'user', req, userData);
				res.status(200).json({
					message: 'App Admin access:: ' + action
				});
			}
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function editSuperAdmin(req, res) {
	let userId = req.params.userId;
	let action = req.params.action;
	let allApps = [];
	let diff = [];
	let promise = null;
	let userData;
	if (!req.user.isSuperAdmin) {
		return res.status(403).json({
			message: 'User is not superAdmin'
		});
	}
	if (req.user._id === userId) {
		return res.status(403).json({
			message: 'User cannot modify itself'
		});
	}
	if (action == 'revoke') {
		promise = mongoose.model('app').find({}, {
			'_id': 1
		})
			.then(data => {
				allApps = _.uniq(data);
				return getAppList(userId);
			})
			.then(apps => {
				apps = _.uniq(apps);
				diff = _.difference(allApps.map(app => app._id), apps);
				let pr = [];
				let usrIds = [];
				usrIds.push(userId);
				pr = diff.map(apps => {
					return appController.validateUser(req, usrIds, apps, true);
				});
				return Promise.all(pr);
			})
			.then(data => {
				let finalData = [];
				data.forEach(doc => {
					if (doc && doc.diff && doc.diff.length > 0) {
						doc.diff.forEach(id => {
							finalData.push(id);
						});
					}
				});
				if (finalData.length > 0) {
					throw new Error('User is in use');
				}
			});

	} else {
		promise = new Promise(_resolve2 => _resolve2());
	}
	return promise
		.then(() => {
			return crudder.model.findOne({
				_id: userId
			});

		})
		.then(usr => {
			if (usr) {
				if (action === 'grant') {
					usr.isSuperAdmin = true;
				} else if (action === 'revoke') {
					usr.isSuperAdmin = false;
				}
				userData = usr;
				return usr.save(req);
			} else {
				res.status(400).json({
					message: 'User not found'
				});
			}
		})
		.then(() => {
			return crudder.model.findOne({
				_id: req.params.userId
			});
		})
		.then(data => {
			return userLog.superAdminAccess(req, res, action, data);
		})
		.then(() => {
			let eventId = action == 'grant' ? 'EVENT_USER_ACCESS_SUPERADMIN_GRANTED' : 'EVENT_USER_ACCESS_SUPERADMIN_REVOKED';
			dataStackUtils.eventsUtil.publishEvent(eventId, 'user', req, userData);
			res.json({
				message: 'Super Admin access:: ' + action
			});
			if (action === 'grant') {
				return mongoose.model('group').find({
					users: userId
				});
			}
		})
		.then(_grps => {
			if (_grps) {
				let promises = _grps.map(_g => {
					_g.users = _g.users.filter(_u => _u != userId);
					return _g.save(req);
				});
				return Promise.all(promises);
			}
		})
		.then(() => {
			let pr = [];
			let usrIds = [];
			usrIds.push(userId);
			pr = diff.map(app => {
				return appController.deleteUserDoc(req, usrIds, app);
			});
			return Promise.all(pr);
		})
		.catch(err => {
			logger.error(err.message);
			res.status(400).json({
				message: err.message
			});
		});
}

function customDestroy(req, res) {
	let userDoc = {};
	let apps = [];

	if (!req.user.isSuperAdmin) return res.status(403).json({
		message: 'Current user does not have permission to delete user'
	});
	if (req.params.id === req.user._id) return res.status(403).json({
		message: 'User cannot delete itself'
	});
	return getAppList(req.params.id)
		.then(apps => {
			apps = _.uniq(apps);
			let usrIds = [];
			usrIds.push(req.params.id);
			let pr = [];
			pr = apps.map(app => {
				return appController.validateUser(req, usrIds, app);
			});
			return Promise.all(pr);
		})
		.then(data => {
			let usedInApps = [];
			data.forEach(doc => {
				if (doc && doc.diff && doc.diff.length > 0) {
					usedInApps.push(doc.app);
				}
			});
			if (usedInApps.length > 0) {
				throw new Error('User/s in use for ' + usedInApps + ' app/s.');
			}
		})
		.then(() => {
			return crudder.model.findOne({
				_id: req.params.id
			});
		})
		.then(data => {
			userDoc = data;
			return mongoose.model('group').find({
				'users': req.params.id
			}, 'app');
		})
		.then(_grps => {
			apps = _grps.map(_g => _g.app);
			apps = _.uniq(apps);
			userDoc.app = apps;
			return mongoose.model('userMgmt.filter').remove({
				$and: [{
					'private': true
				}, {
					'createdBy': req.params.id
				}]
			});
		})
		.then(() => {
			crudder.destroy(req, res);
		})
		.then(() => {
			let pr = [];
			let usrIds = [];
			usrIds.push(req.params.id);
			pr = apps.map(app => {
				return appController.deleteUserDoc(req, usrIds, app);
			});
			return Promise.all(pr);
		})
		.then(() => dataStackUtils.eventsUtil.publishEvent('EVENT_USER_DELETE', 'user', req, userDoc))
		.catch(err => {
			logger.error('Error in User customDestroy :: ', err);

			return res.status(400).json({
				message: err.message
			});
		});

}

async function closeAllSessionForUser(req, res) {
	try {
		let userId = req.params.id;
		const status = await cache.endSession(userId);
		await cacheUtil.removeUser(`U:${userId}`);
		logger.debug('Cache remove user');
		logger.trace(JSON.stringify(status));
		if (!res.headersSent) {
			res.json({
				message: 'All user session closed.'
			});
		}
	} catch (err) {
		logger.error(err.message);
		res.status(500).json({
			message: err.message
		});
	}
}

function addUserToApps(req, res) {
	let usrId = req.params.usrId;
	let apps = req.body.apps;
	crudder.model.findOne({
		_id: usrId
	}).lean(true)
		.then(_usr => {
			if (!_usr) {
				res.status(400).json({
					message: 'User does not exist'
				});
				return;
			}
			return mongoose.model('group').find({
				name: '#',
				app: {
					$in: apps
				}
			});
		})
		.then(_grps => {
			if (_grps) {
				let promises = _grps.map(_grp => {
					_grp.users = _grp.users ? _grp.users.concat([usrId]) : [usrId];
					return _grp.save(req);
				});
				return Promise.all(promises);
			}
		})
		.then(_d => {
			if (_d) {
				logger.debug(`Added User To App : ${JSON.stringify(apps)}`);
				logger.trace(JSON.stringify(_d));
				res.status(200).json({
					message: 'User added to ' + _d.map(_e => _e.app)
				});
			}
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({
				message: err.message
			});
		});
}

function bulkAddUserValidate(_req, _res) {
	let data = _req.body;
	let isHeaderProvided = data.fileHeaders;
	let headerMapping = data.headerMapping;
	let fileName = data.fileName;
	let fileId = _req.params.fileId;
	let collectionName = 'userMgmt.users';
	getSheetDataFromGridFS(fileId, mongoose.connection.db, collectionName)
		.then((bufferData) => {
			let wb = XLSX.read(bufferData, {
				type: 'buffer',
				cellDates: true,
				cellNF: false,
				cellText: true,
				dateNF: 'YYYY-MM-DD HH:MM:SS'
			});
			let ws = wb.Sheets[wb.SheetNames[0]];
			let sheetData = getSheetData(ws, isHeaderProvided);
			let mappedSchemaData = substituteMappingSheetToSchema(sheetData, headerMapping);
			let sNo = 0;
			mappedSchemaData.forEach(parsedData => {
				var date = new Date();
				let obj = {
					'fileName': fileName,
					'_metadata': {
						'version': {
							'document': 1
						},
						'deleted': false,
						'lastUpdated': date,
						'createdAt': date
					},
					'fileId': fileId,
					'data': parsedData,
					'sNo': sNo,
					'conflict': 'false',
					'status': 'Pending',
					'errorMessage': null,
					'downloadFile': false,
				};
				let BulkCreateModel = mongoose.model('bulkCreate');
				let bulkUserDoc = new BulkCreateModel(obj);
				bulkUserDoc.save({ checkKeys: false });
				sNo++;
			});
			var userData = mappedSchemaData;
			var promises = userData.map((user, sNo) => {
				var basicDetails = {
					'name': user['basicDetails.name'],
					'phone': user['basicDetails.phone']
				};
				let dataObj = {
					'data': {
						'username': user['username'],
						basicDetails,
						'password': user['password']
					}
				};
				let UserModel = crudder.model;
				let userDoc = new UserModel(dataObj.data);
				return userDoc.validate({ checkKeys: false })
					.then(() => {
						dataObj.status = 'Validated';
						return mongoose.model('bulkCreate').updateOne({
							'fileId': fileId,
							'fileName': fileName,
							'sNo': sNo
						}, dataObj);
					})
					.catch(err => {
						dataObj.errorMessage = err.message;
						dataObj.status = 'Error';
						return mongoose.model('bulkCreate').updateOne({
							'fileId': fileId,
							'fileName': fileName,
							'sNo': sNo
						}, dataObj);
					});
			});
			return Promise.all(promises)
				.then(() => {
					return mongoose.model('bulkCreate').aggregate([{
						'$match': {
							'fileId': fileId,
							'status': 'Validated'
						}
					},
					{
						'$group': {
							'_id': '$data.username',
							'count': {
								'$sum': 1
							}
						}
					},
					{
						'$match': {
							'_id': {
								'$ne': null
							},
							'count': {
								'$gt': 1
							}
						}
					},
					{
						'$project': {
							'data.username': '$_id',
							'_id': 0
						}
					}
					])
						.then(data => {
							var promise = data.map(userData => {
								return mongoose.model('bulkCreate').updateMany({
									'data.username': userData.data.username,
									'fileId': fileId,
									'fileName': fileName,
									'status': 'Validated'
								}, {
									$set: {
										'conflict': true
									}
								});
							});
							return Promise.all(promise);
						})
						.then(() => {
							return mongoose.model('bulkCreate').aggregate([{
								'$facet': {
									'totalCount': [{
										'$match': {
											'fileId': fileId
										}
									}, {
										'$count': 'totalCount'
									}],
									'conflictsCount': [{
										'$match': {
											'conflict': true,
											'fileId': fileId
										}
									}, {
										'$count': 'conflictsCount'
									}],
									'errorCount': [{
										'$match': {
											'fileId': fileId,
											'status': 'Error'
										}
									}, {
										'$count': 'errorCount'
									}]
								}
							}]);
						})
						.then((res) => {
							if (res[0].errorCount[0] == undefined) {
								res[0].errorCount[0] = {
									'errorCount': 0
								};
							}
							if (res[0].conflictsCount[0] == undefined) {
								res[0].conflictsCount[0] = {
									'conflictsCount': 0
								};
							}
							if (res[0].totalCount[0] == undefined) {
								res[0].totalCount[0] = {
									'totalCount': 0
								};
							}
							logger.info('Users details validated');
							return _res.json({
								'conflicts': res[0].conflictsCount[0].conflictsCount,
								'errors': res[0].errorCount[0].errorCount,
								'total': res[0].totalCount[0].totalCount
							});
						}).then(() => {
							return mongoose.connection.db.collection('userMgmt.users.fileTransfers').update({
								fileId: fileId
							}, {
								$set: {
									isHeaderProvided,
									headerMapping,
									status: 'Validated'
								}
							});
						});
				});
		});
}

function bulkAddUserCreate(_req, _res) {
	let data = _req.body;
	let sNo = data.conflictSerialNo;
	let fileId = data.fileId;
	let fileName = data.fileName;
	let obj = {};
	obj.conflict = false;
	return mongoose.model('bulkCreate').updateMany({
		'fileId': fileId,
		'fileName': fileName,
		'sNo': sNo,
		'conflict': true,
	}, obj)
		.then(() => {
			let obj = {};
			obj.status = 'Ignored';
			return mongoose.model('bulkCreate').updateMany({
				'fileId': fileId,
				'fileName': fileName,
				'conflict': true
			}, obj);
		})
		.then(() => {
			return mongoose.model('bulkCreate').find({
				'fileId': fileId,
				'fileName': fileName,
				'status': 'Validated',
				'conflict': false,
				'errorMessage': null
			}).then(data => {
				var promises = data.map(userData => {
					var accessControl = {
						accessLevel: 'None',
						apps: null
					};
					var isActive = true;
					var auth = {
						authType: 'local'
					};
					let userDetails = {
						username: userData.data.username,
						basicDetails: userData.data.basicDetails,
						password: userData.data.password,
						accessControl,
						isActive,
						auth
					};

					let userModel = crudder.model;
					let doc = new userModel(userDetails);
					return doc.save(_req);
				});
				return Promise.all(promises)
					.then(() => {
						return mongoose.model('bulkCreate').aggregate([{
							'$facet': {
								'createdCount': [{
									'$match': {
										'fileId': fileId,
										'status': 'Validated',
										'conflict': false
									}
								}, {
									'$count': 'createdCount'
								}],
								'conflictsCount': [{
									'$match': {
										'conflict': true,
										'fileId': fileId
									}
								}, {
									'$count': 'conflictsCount'
								}],
								'errorCount': [{
									'$match': {
										'fileId': fileId,
										'status': 'Error'
									}
								}, {
									'$count': 'errorCount'
								}],
								'ignoredCount': [{
									'$match': {
										'fileId': fileId,
										'status': 'Ignored'
									}
								}, {
									'$count': 'ignoredCount'
								}]

							}
						}]);
					})
					.then((res) => {
						if (res[0].errorCount[0] == undefined) {
							res[0].errorCount[0] = {
								'errorCount': 0
							};
						}
						if (res[0].conflictsCount[0] == undefined) {
							res[0].conflictsCount[0] = {
								'conflictsCount': 0
							};
						}
						if (res[0].createdCount[0] == undefined) {
							res[0].createdCount[0] = {
								'createdCount': 0
							};
						}

						if (res[0].ignoredCount[0] == undefined) {
							res[0].ignoredCount[0] = {
								'ignoredCount': 0
							};
						}
						logger.info('User imported to ODP');
						return _res.json({
							'created': res[0].createdCount[0].createdCount,
							'conflict': res[0].conflictsCount[0].conflictsCount,
							'error': res[0].errorCount[0].errorCount,
							'ignored': res[0].ignoredCount[0].ignoredCount,
						});
					});
			});
		});
}

function bulkAddUserDownload(_req, _res) {
	let fileId = _req.params.fileId;
	let newDir = './downloads/' + fileId + '.csv';
	let header = 'Sno, Username, Name, Phone, Status, Conflict, Error message\n';
	fs.writeFileSync(newDir, header, function (err) {
		if (err) {
			return logger.info(err);
		}
	});
	return mongoose.model('bulkCreate').find({
		'fileId': fileId
	})
		.then((d) => {
			var promises = d.map(i => {
				let content = i.sNo + ',' + i.data._id + ',' + i.data.basicDetails.name + ',' + i.data.basicDetails.phone + ',' + i.status + ',' + i.conflict + ',' + i.errorMessage;
				fs.writeFileSync(newDir, content + '\n', {
					'flag': 'a'
				}, function (err) {
					if (err) throw err;
				});
			});
			return Promise.all(promises)
				.then(() => {
					_res.download(newDir);
				});
		});
}

function importUserToApp(req, res) {
	let username = req.params.username;
	let apps = req.params.apps;
	let groups = req.body.groups;
	let usrdoc = null;
	let usernameRegex = new RegExp('^' + username + '$', 'i');
	crudder.model.findOne({
		_id: usernameRegex
	}).lean(true)
		.then(usr => {
			if (!usr) {
				res.status(400).json({
					message: 'User does not exist'
				});
				return;
			}
			usrdoc = usr;
			return mongoose.model('group').find({
				$or: [{
					_id: {
						'$in': groups
					}
				}, {
					name: '#',
					app: {
						'$in': apps
					}
				}]
			});
		})
		.then(_grps => {
			// if (_grps.some(_g => _g.app != app)) {
			// 	res.status(400).json({
			// 		message: 'Groups are not present in app ' + app
			// 	});
			// 	return;
			// }
			let promises = _grps.map(_grp => {
				_grp.users.push(usrdoc._id);
				return _grp.save(req);
			});
			return Promise.all(promises);
		})
		.then(_d => {
			if (_d) {
				delete usrdoc.salt;
				delete usrdoc.password;
				userLog.addUserToApp(req, res, usrdoc);
				apps.forEach(app => {
					dataStackUtils.eventsUtil.publishEvent('EVENT_APP_USER_ADDED', 'app', req, Object.assign(usrdoc, {
						app: app
					}));
				});
				res.json({
					user: usrdoc,
					groups: _d.map(_o => _o._id)
				});
			}
		})
		.catch(err => {
			res.status(500).json({
				message: err.message
			});
		});
	// 	return mongoose.model('group').findOne({ name: '#', app: app });
	// })
	// .then(grp => {
	// 	if (!grp) {
	// 		res.status(400).json({ message: 'App does not exist' });
	// 		return;
	// 	}
	// 	grp.users.push(usrdoc._id);
	// 	return grp.save(req);
	// })
	// .then((_d) => {
	// 	logger.debug('Import user to app');
	// 	logger.debug(_d);
	// 	if (_d) {
	// 		res.json({ message: 'User added to app ' + app });
	// 	}
	// })
	// .catch(err => {
	// 	logger.error(err.message);
	// 	res.status(500).json({ message: err.message });
	// });

}


function modifyFilterForApp(req, isBot) {
	let filter = req.query.filter;
	let app = req.params.app;
	if (filter && typeof filter === 'string') {
		filter = JSON.parse(filter);
	}
	return mongoose.model('group').find({
		app: app
	})
		.then(_grps => {
			let users = [].concat.apply([], _grps.map(_g => _g.users));
			if (filter && typeof filter === 'object') {
				filter = {
					$and: [filter, {
						'$or': [{
							'_id': {
								'$in': users
							},
							bot: isBot
						}, {
							'isSuperAdmin': true
						}]
					}]
				};
			} else {
				filter = {
					'$or': [{
						'_id': {
							'$in': users
						},
						bot: isBot
					}, {
						'isSuperAdmin': true
					}]
				};
			}
			req.query.filter = JSON.stringify(filter);
		});
}

function userInApp(req, res) {
	modifyFilterForApp(req, false)
		.then(() => {
			crudder.index(req, res);
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function userInAppShow(req, res) {
	const app = req.params.app.trim();
	const userId = req.params.id.trim();
	mongoose.model('group').find({ app: app, users: userId }).lean().then(groups => {
		if (groups && groups.length > 0) {
			return crudder.show(req, res);
		}
		return res.status(400).json({ message: 'User Not Found' });
	}).catch(err => {
		logger.error(err.message);
		res.status(500).json({
			message: err.message
		});
	});
}

function modifyFilterForGroup(req) {
	let filter = req.query.filter;
	let group = req.params.groupId;
	let app = req.params.app;
	let botFlag = req.params.usrType == 'bot' ? true : false;
	if (filter && typeof filter === 'string') {
		filter = JSON.parse(filter);
	}
	return mongoose.model('group').findOne({
		_id: group,
		app: app
	})
		.then(_grp => {
			let users = _grp ? _grp.users : [];
			if (filter && typeof filter === 'object') {
				filter = {
					$and: [filter, {
						'_id': {
							'$in': users
						},
						bot: botFlag
					}]
				};
			} else {
				filter = {
					'_id': {
						'$in': users
					}
				};
			}
			req.query.filter = JSON.stringify(filter);
		});
}

function UserInGroup(req, res) {
	modifyFilterForGroup(req)
		.then(() => {
			crudder.index(req, res);
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function UserInGroupCount(req, res) {
	modifyFilterForGroup(req)
		.then(() => {
			crudder.count(req, res);
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function userInAppCount(req, res) {
	modifyFilterForApp(req, false)
		.then(() => {
			crudder.count(req, res);
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function botInApp(req, res) {
	modifyFilterForApp(req, true)
		.then(() => {
			crudder.index(req, res);
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function botInAppCount(req, res) {
	modifyFilterForApp(req, true)
		.then(() => {
			crudder.count(req, res);
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({
				message: err.message
			});
		});
}

function heartBeatAPI(_req, _res) {
	let token = _req.get('Authorization');
	token = token ? token.split('JWT ')[1] : null;
	if (!token) return _res.status(401).json({
		message: 'Unauthorized'
	});
	cacheUtil.handleHeartBeat(_req.body.uuid, md5(token), envConfig.RBAC_HB_INTERVAL + 5);
	_res.json({
		message: 'HB received'
	});
}

let initDone = false;

function readiness(req, res) {
	if (!initDone) {
		return require('../init/init')()
			.then(() => {
				initDone = true;
				return res.status(200).json();
			})
			.catch(err => {
				logger.error(err.message);
				return res.status(400).json();
			});
	}
	return res.status(200).json();
}

function health(req, res) {
	logger.trace(`mongoose.connection.readyState: ${mongoose.connection.readyState}`);
	logger.trace(`client.nc.connected: ${client.nc.connected}`);
	logger.trace(`cacheUtil.isConnected(): ${cacheUtil.isConnected()}`);
	if (mongoose.connection.readyState === 1 && client && client.nc && client.nc.connected && cacheUtil.isConnected()) {
		return res.status(200).json();
	} else {
		return res.status(400).json();
	}
}

function distinctUserAttribute(req, res) {
	let app = req.params.app;
	return mongoose.model('group').find({
		app: app
	}, {
		users: 1
	})
		.then(_grps => {
			let users = [].concat.apply([], _grps.map(_g => _g.users));
			return crudder.model.find({
				_id: {
					$in: users
				},
				attributes: {
					$exists: true,
					$ne: null
				}
			}, {
				attributes: 1
			});
		})
		.then(_users => {
			let uniqAttrib = [];
			_users.forEach(_u => {
				if (_u.attributes) {
					Object.keys(_u.attributes).forEach(_k => {
						if (_u.attributes[_k] != null) {
							let flag = uniqAttrib.find(_a => _a.key == _k && _a.type == _u.attributes[_k].type);
							if (!flag) {
								uniqAttrib.push({
									key: _k,
									label: _u.attributes[_k].label,
									type: _u.attributes[_k].type,
									properties: {
										name: _u.attributes[_k].label
									}
								});
							}
						}
					});
				}
			});
			res.json({
				attributes: uniqAttrib
			});
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({
				message: err.message
			});
		});
}

module.exports = {
	init: init,
	create: customCreate,
	authType: authType,
	index: customIndex,
	show: crudder.show,
	destroy: customDestroy,
	update: customUpdate,
	count: customCount, //crudder.count,
	localLogin: localLogin,
	ldapLogin: ldapLogin,
	logout: logout,
	updatePassword: updatePassword,
	resetPassword: resetPassword,
	validateUserSession: validateUserSession,
	checkUserSession: checkUserSession,
	refreshToken: refreshToken,
	importLdapUser: crudder.create,
	azureLoginCallback: azureLoginCallback,
	health: health,
	readiness: readiness,
	getRolesList: getRolesList,
	getRolesType: getRolesType,
	// loginCallbackAzure: loginCallbackAzure,
	getAllRolesofUser: getAllRolesofUser,
	getUserAppList: getUserAppList,
	createUserinGroups: createUserinGroups,
	addUserToGroups: addUserToGroups,
	removeUserFromGroups: removeUserFromGroups,
	editAppAdmin: editAppAdmin,
	editSuperAdmin: editSuperAdmin,
	// closeAllSession: closeAllSession,
	closeAllSessionForUser: closeAllSessionForUser,
	addUserToApps: addUserToApps,
	importUserToApp: importUserToApp,
	userInApp: userInApp,
	userInAppShow: userInAppShow,
	userInAppCount: userInAppCount,
	UserInGroup: UserInGroup,
	UserInGroupCount: UserInGroupCount,
	botInApp: botInApp,
	botInAppCount: botInAppCount,
	heartBeatAPI: heartBeatAPI,
	extendSession: extendSession,
	bulkAddUserValidate: bulkAddUserValidate,
	bulkAddUserCreate: bulkAddUserCreate,
	bulkAddUserDownload: bulkAddUserDownload,
	// fixAllADUsers: fixAllADUsers,
	// fixSingleADUsers: fixSingleADUsers,
	// refreshADEmail: refreshADEmail,
	distinctUserAttribute: distinctUserAttribute,
	createBotKey: createBotKey,
	deleteBotKey: deleteBotKey,
	updateBotKey: updateBotKey,
	endBotKeySession: endBotKeySession,
	disableUser: disableUser,
	validateLocalLogin: validateLocalLogin,
	validateLdapLogin: validateLdapLogin,
	validateAzureLogin: validateAzureLogin,
	azureLogin: azureLogin,
	// azureUserFetch: azureUserFetch,
	// azureUserFetchCallback: azureUserFetchCallback,
	// validateAzureUserFetch: validateAzureUserFetch
};