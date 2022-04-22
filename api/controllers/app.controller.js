'use strict';

const mongoose = require('mongoose');
const definition = require('../helpers/app.definition.js').definition;
const SMCrud = require('@appveen/swagger-mongoose-crud');
const schema = new mongoose.Schema(definition);
const logger = global.logger;
const dataStackUtils = require('@appveen/data.stack-utils');
const kubeutil = require('@appveen/data.stack-utils').kubeutil;
let queueMgmt = require('../../util/queueMgmt');
var client = queueMgmt.client;
const appInit = require('../../config/apps');
const isK8sEnv = require('../../config/config').isK8sEnv();
const config = require('../../config/config');
var userLog = require('./insight.log.controller');
const dataStackNS = config.dataStackNS;
const blockedAppNames = config.blockedAppNames;
let _ = require('lodash');
let release = process.env.RELEASE;
const request = require('request');
let appHook = require('../helpers/util/appHooks');
var options = {
	logger: logger,
	collectionName: 'userMgmt.apps'
};

let e = {};

function appUniqueCheck(_id) {
	let idRegex = new RegExp('^' + _id + '$', 'i');
	return crudder.model.findOne({
		'_id': idRegex
	}).lean(true)
		.then(_d => {
			if (_d) {
				return Promise.reject(new Error('App name already in use'));
			} else {
				return Promise.resolve();
			}
		});
}

schema.pre('save', function (next) {
	let self = this;
	if (self.isNew) {
		return appUniqueCheck(self._id)
			.then(() => {
				next();
			})
			.catch(err => {
				logger.error(err);
				next(err);
			});
	} else {
		next();
	}
});

schema.pre('save', function (next) {
	logger.info('Blocked Apps List - ', blockedAppNames);
	if (blockedAppNames.includes(this._id)) {
		return next(new Error('App name is not allowed.'));
	}
	next();
});

schema.pre('save', function (next, req) {
	this._req = req;
	this._wasNew = this.isNew;
	if (!this.type) {
		this.type = 'Management';
	}
	next();
});

schema.pre('save', function (next) {
	let self = this;
	if (self._metadata.version) {
		self._metadata.version.release = process.env.RELEASE;
	}
	next();
});

schema.pre('save', function (next) {
	var idregex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]+$/;
	// var idregex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
	if (!this._id.match(idregex)) {
		next(new Error('App name must consist of alphanumeric characters or \'-\' , and must start and end with an alphanumeric character.'));
	} else if (this._id.length > 40) {
		next(new Error('App name cannot be greater than 40'));
	}
	next();
});


schema.post('save', function (error, doc, next) {
	if (error.errors && error.errors._id || error.code == 11000 || error._id === 'ValidationError' && error.message.indexOf('__CUSTOM_ID_DUPLICATE_ERROR__') > -1) {
		logger.error(error);
		next(new Error('App name is already in use'));
	} else {
		next(error);
	}
});

schema.pre('save', function (next) {
	if (this.description && this.description.length > 250) {
		next(new Error('App description should not be more than 250 character '));
	} else {
		next();
	}
});

schema.pre('save', dataStackUtils.auditTrail.getAuditPreSaveHook('userMgmt.apps'));

schema.post('save', dataStackUtils.auditTrail.getAuditPostSaveHook('userMgmt.apps.audit', client, 'auditQueue'));

schema.post('save', function (doc) {
	let eventId;
	if (doc._wasNew)
		eventId = 'EVENT_APP_CREATE';
	else
		eventId = 'EVENT_APP_UPDATE';
	dataStackUtils.eventsUtil.publishEvent(eventId, 'app', doc._req, doc);
});

// To add SM role in new App.
schema.post('save', function (doc) {
	if (doc._wasNew) {
		const ns = dataStackNS + '-' + doc._id.toLowerCase().replace(/ /g, '');
		const appInitList = appInit.map(obj => obj._id);
		if (appInitList.indexOf(doc._id) == -1) {
			let GroupModel = mongoose.model('group');
			let groupDoc = new GroupModel({
				name: '#',
				description: 'Default Group for ' + doc._id,
				app: doc._id,
				users: [],
				roles: []
			});
			return groupDoc.save(doc._req).then(() => {
				if (isK8sEnv) kubeutil.namespace.createNamespace(ns, release)
					.then(_ => {
						if (_.statusCode != 200 || _.statusCode != 202) {
							logger.error(_.message);
							logger.debug(JSON.stringify(_));
							return Error(_.message);
						}
						return _;
					});
			})
				.then(_ => {
					if (isK8sEnv) {
						logger.debug(_);
						logger.info('Created kubernetes namespace:: ' + ns);
						if (process.env.DOCKER_REGISTRY_SERVER && process.env.DOCKER_USER && process.env.DOCKER_PASSWORD && process.env.DOCKER_EMAIL) {
							logger.info('Creating imagepullsecret');
							return kubeutil.imagePullSecret.createSecret(ns);
						}
					}
				})
				.then(() => {
					var body = { app: doc._id };
					// return appHook.sendRequest(config.baseUrlSEC + `/app/${doc._id}`, 'post', null, body, doc._req);
					const keysModel = mongoose.model('keys');
					const keyDoc = new keysModel(body);
					return keyDoc.save();
				})
				.then(
					() => {
						logger.info('Security key created');
					}
				)
				.catch(err => logger.error(err));
		}
	}
});

function isEqualObjectValue(a, b) {
	return _.isEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
}

schema.pre('remove', dataStackUtils.auditTrail.getAuditPreRemoveHook());

schema.post('remove', dataStackUtils.auditTrail.getAuditPostRemoveHook('userMgmt.apps.audit', client, 'auditQueue'));

schema.pre('remove', function (next, req) {
	this._req = req;
	next();
});

//check FLows exist
// schema.pre('remove', appHook.preRemovePMFlows());
schema.pre('remove', appHook.preRemovePMFaas());

// schema.post('remove', appHook.getPostRemoveHook());

schema.post('remove', (_doc) => {
	if (isK8sEnv) {
		const ns = dataStackNS + '-' + _doc._id.toLowerCase();
		kubeutil.namespace.deleteNamespace(ns)
			.then(_ => {
				logger.debug(_);
				logger.info('Deleted kubernetes namespace :: ' + ns);
				kubeutil.namespace.getNamespace(ns)
					.then(nsData => {
						logger.trace("Namespace data ", nsData);
                        nsData.body.spec.finalizers = [];

						namespace.updateNamespace(ns, nsData.body)
							.then(_ => {
								logger.trace("Updated NS :: ", JSON.stringify(_));
								logger.info('Updated kubernetes namespace :: ' + ns);
								}, _ => {
									logger.trace(_);
									logger.info('Unable to update kubernetes namespace :: ' + ns);
								});
					}, _ => {
						logger.trace(_);
						logger.info('Unable to get kubernetes namespace :: ' + ns);		
					})
			}, _ => {
				logger.debug(_);
				logger.info('Unable to delete kubernetes namespace :: ' + ns);
			});
	}
	mongoose.model('group').remove({ app: _doc._id }).then(_d => {
		logger.info('App deleted removing related Groups');
		logger.debug(_d);
	})
		.catch(err => {
			logger.error(err.message);
		});
	mongoose.model('keys').remove({ app: _doc._id }).then(_d => {
		logger.info('Sec Keys Deleted');
		logger.debug(_d);
	})
		.catch(err => {
			logger.error(err.message);
		});
	mongoose.model('user').find({ 'accessControl.accessLevel': 'Selected', 'accessControl.apps._id': _doc._id })
		.then(_users => {
			let promises = _users.map(_usr => {
				_usr.accessControl.apps = _usr.accessControl.apps.filter(_a => _a._id != _doc._id);
				_usr.markModified('accessControl.apps');
				return _usr.save(_doc._req);
			});
			return Promise.all(promises);
		})
		.then(_d => {
			logger.info('App deleted:: updating users app admin list');
			logger.debug(_d);
		})
		.catch(err => {
			logger.error(err.message);
		});
});

schema.post('remove', (doc) => {
	let appName = doc._id;
	appHook.sendRequest(config.baseUrlSM + `/${appName}/internal/app`, 'DELETE', null, null, doc._req).then(() => {
		logger.debug(doc._id + 'App Services are deleted.');
	}).catch(err => {
		logger.error('Error in removing Services of App ' + doc._id, err);
	});
});

schema.post('remove', (doc) => {
	let appName = doc._id;
	appHook.sendRequest(config.baseUrlPM + `/internal/app/${appName}`, 'DELETE', null, null, doc._req).then(() => {
		logger.debug(doc._id + 'App B2B Objects are deleted.');
	}).catch(err => {
		logger.error('Error in removing B2b Objects of App ' + doc._id, err);
	});
});

schema.post('remove', function (doc) {
	dataStackUtils.eventsUtil.publishEvent('EVENT_APP_DELETE', 'app', doc._req, doc);
});

// Update ipWhiteList in agents
schema.post('save', function (doc) {
	let oldData = doc._auditData.data.old;
	let newData = doc.toJSON();
	if ((!oldData.agentIPWhitelisting && newData.agentIPWhitelisting) || !isEqualObjectValue(oldData.agentIPWhitelisting, newData.agentIPWhitelisting)) {
		var options = {
			url: config.baseUrlPM + '/app/' + doc._id,
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'TxnId': doc._req && doc._req.headers ? doc._req.headers['txnId'] : null,
				'User': doc._req && doc._req.headers ? doc._req.headers['user'] : null
			},
			json: true,
			body: {
				agentIPWhitelisting: doc.agentIPWhitelisting
			}
		};
		request(options, function (err, res) {
			if (err) {
				logger.error(err.message);
			} else if (!res) {
				logger.error('PM is DOWN');
			} else {
				logger.debug('Request to update IP whitelist completed');
			}
		});
	}
});

// Inform PM for new App creation
schema.post('save', function (doc) {
	if (doc._wasNew) {
		var options = {
			url: config.baseUrlPM + '/app',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'TxnId': doc._req && doc._req.headers ? doc._req.headers['txnId'] : null,
				'User': doc._req && doc._req.headers ? doc._req.headers['user'] : null
			},
			json: true,
			body: {
				_id: doc._id
			}
		};
		request(options, function (err, res) {
			if (err) {
				logger.error(err.message);
			} else if (!res) {
				logger.error('PM is DOWN');
			} else {
				logger.debug('Request to Inform PM completed');
			}
		});
	}
});


e.init = () => {
	let app = require('../../config/apps.js');
	return new Promise((_resolve, _reject) => {
		crudder.model.find({}).count()
			.then(_d => {
				if (_d == 0) {
					return app.reduce((_p, _c) => {
						const ns = dataStackNS + '-' + _c._id.toLowerCase().replace(/ /g, '');
						logger.debug(`init() :: ns :: ${ns}`);
						return _p.then(() => {
							return crudder.model.create(_c)
								.then(_d => {
									logger.info('Added App :: ' + _d._id);
									return _d;
								}, _e => {
									logger.error('Error adding App :: ' + _c._id);
									logger.error(_e);
								});
						})
							.then(() => {
								if (isK8sEnv) kubeutil.namespace.createNamespace(ns, release);
							})
							.then(_ => {
								if (isK8sEnv) {
									logger.debug(_);
									logger.info('Created kubernetes namespace :: ' + ns);
								}
							})
							.then(() => {
								// Create default Group
								return mongoose.model('group').create({
									name: '#',
									description: 'Default Group for ' + _c._id,
									app: _c._id,
									users: [],
									roles: []
								});
							})
							.then((_grp) => {
								logger.debug(_grp);
								var body = { app: _c._id };
								// return appHook.sendRequest(config.baseUrlSEC + `/app/${_c._id}`, 'post', null, body);
								const keysModel = mongoose.model('keys');
								const keyDoc = new keysModel(body);
								return keyDoc.save();
							})
							.then(() => {
								logger.info('Security key created');
							}).catch(err => {
								logger.error('Security key creation failed', err);
							});
					}, new Promise(_resolve2 => _resolve2()))
						.then(() => _resolve());
				} else _resolve();
			}, () => _reject());
	});
};

e.removeUserBotFromApp = (req, res, isBot, usrIdArray) => {
	let usrIds = req.body.userIds;
	usrIds = usrIds ? usrIds : [];
	usrIds = _.difference(usrIds, usrIdArray);
	let app = req.params.app;
	usrIds = _.uniq(usrIds);
	return mongoose.model('user').find({ _id: { $in: usrIds }, bot: isBot })
		.then(_usr => {
			if (_usr.length != usrIds.length) {
				let usrNotFound = _.difference(usrIds, _usr.map(_u => _u._id));
				return res.status(400).json({ message: 'Could not find these ' + isBot ? 'bots ' : 'users ' + usrNotFound });
			}
			return mongoose.model('group').find({ users: { '$in': usrIds }, app: app })
				.then(_grps => {
					let promises = _grps.map(_grp => {
						_grp.users = _grp.users.filter(_u => usrIds.indexOf(_u) === -1);
						let model = mongoose.model('group');
						let doc = new model(_grp);
						return doc.save(req);
					});
					return Promise.all(promises);
				})
				.then(_rs => {
					logger.info('Removed user ' + usrIds + ' from ' + _rs.map(_r => _r._id));
					return mongoose.model('user').find({ _id: { $in: usrIds }, 'accessControl.accessLevel': 'Selected', 'accessControl.apps._id': app });
				})
				.then(_users => {
					let promises = _users.map(_usr => {
						if (_usr.accessControl.apps) _usr.accessControl.apps = _usr.accessControl.apps.filter(_a => _a._id != app);
						let model = mongoose.model('user');
						let doc = new model(_usr);
						doc.markModified('accessControl.apps');
						return doc.save(req);
					});
					return Promise.all(promises);
				})
				.then((_d) => {
					logger.debug('Remove user from app');
					logger.debug(_d);
					if (usrIdArray.length > 0) {
						res.status(400).json({ message: 'Can not detete ' + usrIdArray + ' from ' + app + ' app' });
					} else {
						let eventId = isBot ? 'EVENT_BOT_DELETE' : 'EVENT_APP_USER_REMOVED';
						let userType = isBot ? 'bot' : 'user';
						_usr.forEach(user => dataStackUtils.eventsUtil.publishEvent(eventId, userType, req, user));
						_usr.forEach(user => userLog.removeUser(req, res, JSON.parse(JSON.stringify(user))));
						res.status(200).json({ message: `Removed ${userType}/s from app` });
					}
				});
		})
		.then(() => e.deleteUserDoc(req, usrIds, app))
		.catch(err => {
			logger.error('Error in removeUserBotFromApp :: ', err);
			res.status(500).json({ message: err.message });
		});
};

e.removeUserFromApp = (req, res) => {
	let usrIds = req.body.userIds;
	let app = req.params.app;
	return e.validateUser(req, usrIds, app)
		.then(diff => e.removeUserBotFromApp(req, res, false, diff.diff));
};

e.removeBotFromApp = (req, res) => {
	let usrIds = req.body.userIds;
	let app = req.params.app;
	return e.validateUser(req, usrIds, app)
		.then(diff => e.removeUserBotFromApp(req, res, true, diff.diff));
};

e.customDestroy = (req, res) => {
	let txnId = req.get('txnId');
	let appName = req.params.id;
	logger.info(`[${txnId}] App delete request received for ${appName}`);

	if (!req.user.isSuperAdmin) return res.status(403).json({ message: 'Current user does not have permission to delete app' });
	var options = {
		url: config.baseUrlSM + `/${appName}/service`,
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'TxnId': req && req.headers ? req.headers['txnId'] : null,
			'User': req && req.headers ? req.headers['user'] : null,
			'Authorization': req && req.headers ? req.headers['authorization'] || req.headers['Authorization'] : null
		},
		json: true,
		qs: { filter: { status: { $eq: 'Active' }, 'app': req.params.id }, select: 'name,status,app' }
	};
	logger.debug(`Options for request : ${JSON.stringify(options)}`);

	request(options, function (err, newres, body) {
		if (err) {
			logger.error(err.message);
			res.status(500).json({ message: err.message });
		} else if (!res) {
			logger.error('Server is DOWN');
			res.status(500).json({ message: 'SM server down' });
		} else {
			if (body.length > 0) {
				res.status(400).json({ message: body.map(_b => _b.name) + ' services are running. Please stop them before deleting app' });
			} else {
				crudder.destroy(req, res)
					.then(() => {
						return mongoose.model('bookmark').find({ app: appName }).then((d) => {
							var promises = d.map(i => {
								i.remove();
							});
							return Promise.all(promises);
						});
					})
					.then(() => {
						var dbName = `${process.env.DATA_STACK_NAMESPACE}` + '-' + appName;
						return global.mongoConnection.db(dbName).dropDatabase();
					}).catch(err => {
						logger.error(err);
					});
			}
		}
	});
};

e.addUsersToApp = (req, res) => {
	let app = req.params.app;
	let users = req.body.users;
	return mongoose.model('group').findOne({ name: '#', app: app })
		.then(grp => {
			if (!grp) {
				res.status(400).json({ 'message': app + ' App does not exist' });
				return;
			}
			grp.users = grp.users.concat(users);
			let model = mongoose.model('group');
			let doc = new model(grp);
			return doc.save(req);
		})
		.then((_d) => {
			logger.debug('Add Users to App');
			logger.debug(_d);
			if (_d) res.status(200).json({ message: 'Added users to the app' });
		})
		.catch(err => {
			logger.error(err.message);
			res.status(500).json({ message: err.message });
		});
};

var crudder = new SMCrud(schema, 'app', options);

e.fetchIPwhitelisting = (req, res) => {
	crudder.model.find({}, { _id: 1, agentIPWhitelisting: 1 })
		.then(apps => {
			let resObj = apps.map(_app => {
				return {
					_id: _app._id,
					name: _.camelCase(_app._id),
					agentIPWhitelisting: _app.agentIPWhitelisting ? _app.agentIPWhitelisting : { enabled: false, list: [] }
				};
			});
			res.json(resObj);
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({ message: err.message });
		});
};

e.validateUser = (req, usrIds, app, flag) => {
	usrIds = usrIds ? usrIds : [];
	usrIds = _.uniq(usrIds);
	let newUsrId = [];
	let pr = [];
	let resArray = [];
	let resObj = {};
	return mongoose.model('user').find({ _id: { $in: usrIds } }, { '_id': 1, 'isSuperAdmin': 1 })
		.then(usrs => {
			if (!flag) newUsrId = usrs.filter(usr => !usr.isSuperAdmin);
			else newUsrId = usrs;
			pr = newUsrId.map(usrId => {
				let url = config.baseUrlSM + `/${app}/internal/validateUserDeletion/${usrId._id}`;
				return e.sendRequest(url)
					.then(res => {
						if (res.status != 200) {
							resArray.push(usrId._id);
						}
					});
			});
			return Promise.all(pr);
		})
		.then(() => {
			resObj.newUser = newUsrId.map(_d => _d._id);
			resObj.diff = resArray;
			resObj.app = app;
			return resObj;
		});
};

e.deleteUserDoc = (req, usrIds, app) => {
	usrIds = usrIds ? usrIds : [];
	usrIds = _.uniq(usrIds);
	let newUsrId = [];
	let pr = [];
	return mongoose.model('user').find({ _id: { $in: usrIds } }, { '_id': 1, 'isSuperAdmin': 1 })
		.then(usrs => {
			newUsrId = usrs.filter(usr => !usr.isSuperAdmin);
			pr = newUsrId.map(usrId => {
				let url = config.baseUrlSM + `/userDeletion/${app}/${usrId._id}`;
				return e.sendRequest(url);
			});
			return Promise.all(pr);
		})
		.catch(err => {
			logger.debug(err);
		});
};

e.sendRequest = (url) => {
	var options = {
		url: url,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
	};
	return new Promise((resolve, reject) => {
		request.put(options, function (err, res, body) {
			if (err) {
				logger.error(err.message);
				reject(err);
			} else if (!res) {
				logger.error('Service Manager is DOWN');
				reject(new Error('Service Manager is DOWN'));
			} else {
				body = body ? JSON.parse(body) : {};
				body.status = res.statusCode;
				resolve(body);
			}
		});
	});
};

e.customAppIndex = (_req, _res) => {
	logger.debug(`customAppIndex() _req.headers.user :: ${_req.headers.user}`);
	let user = {};
	mongoose.model('user').findOne({ _id: _req.headers.user })
		.select('isSuperAdmin accessControl.apps._id')
		.then(_user => {
			if (_user) {
				logger.debug(`Is superadmin? [${_user.isSuperAdmin}]`);
				logger.debug(JSON.stringify(_user));
				user = _user;
			}
			return user;
		})
		.then(_user => {
			if (_user && _user.isSuperAdmin) {
				logger.debug('Apps = [] because user is superadmin');
				return [];
			}
			return mongoose.model('group').aggregate([{
				'$match': {
					'users': _user._id
				}
			}, {
				$group: {
					_id: '$app'
				}
			}]);
		})
		.then(_apps => {
			let filter = _req.query.filter;
			logger.debug(`Incoming filter :: ${filter}`);

			if (user.isSuperAdmin) return crudder.index(_req, _res);

			if (typeof filter == 'string') filter = JSON.parse(filter);
			else filter = {};

			logger.debug(`Filter :: ${JSON.stringify(filter)}`);
			logger.debug(`Apps : ${JSON.stringify(_apps)}`);

			let apps = user.accessControl && user.accessControl.apps ? _apps.concat(user.accessControl.apps) : _apps;
			apps = _.uniq(apps);
			apps = apps.map(_app => _app._id);
			logger.debug(`Apps array :: ${apps}`);

			if (filter._id) filter = { '$and': [{ '_id': { '$in': apps } }, filter] };
			else filter['_id'] = { '$in': apps };

			logger.info(`Updated filter :: ${JSON.stringify(filter)}`);
			_req.query.filter = JSON.stringify(filter);

			return crudder.index(_req, _res);
		}).catch(err => {
			logger.error('Error in customAppIndex ', err);
			_res.status(400).json({ message: err.message });
		});
};

module.exports = {
	init: e.init,
	create: crudder.create,
	index: e.customAppIndex,
	show: crudder.show,
	destroy: e.customDestroy,
	update: crudder.update,
	removeUserFromApp: e.removeUserFromApp,
	removeBotFromApp: e.removeBotFromApp,
	removeUserBotFromApp: e.removeUserBotFromApp,
	addUsersToApp: e.addUsersToApp,
	fetchIPwhitelisting: e.fetchIPwhitelisting,
	validateUser: e.validateUser,
	deleteUserDoc: e.deleteUserDoc,
	sendRequest: e.sendRequest
};