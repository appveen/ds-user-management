'use strict';

const mongoose = require('mongoose');
const definition = require('../helpers/group.definition.js').definition;
const SMCrud = require('@appveen/swagger-mongoose-crud');
const schema = new mongoose.Schema(definition);
const logger = global.logger;
const utils = require('@appveen/utils');
const cacheUtils = require('../../util/cache.utils').cache;
const dataStackUtils = require('@appveen/data.stack-utils');
let queueMgmt = require('../../util/queueMgmt');
let groupLog = require('./insight.group.controller');
var client = queueMgmt.client;
const _ = require('lodash');
var options = {
	logger: logger,
	collectionName: 'userMgmt.groups'
};

schema.index({ name: 1, app: 1 });

schema.pre('validate', function (next) {
	if (this.name.length > 40) {
		next(new Error('Entity name must be less than 40 characters. '));
	} else {
		next();
	}
});

schema.pre('validate', function (next) {
	if (this.description && this.description.length > 250) {
		next(new Error('Entity description should not be more than 250 character '));
	} else {
		next();
	}
});

schema.pre('save', utils.counter.getIdGenerator('GRP', 'group', null, null, 1000));

schema.pre('save', function (next) {
	let self = this;
	if (!self.users) self.users = [];
	self.users = _.uniq(self.users);
	next();
});

schema.pre('save', function (next) {
	let nameRegex = new RegExp('^' + this.name + '$', 'i');
	let filter = { 'app': this.app, 'name': nameRegex };
	this.wasNew = this.isNew;
	if (!this.isNew) {
		filter['_id'] = { $ne: this._id };
	}
	return crudder.model.findOne(filter).lean(true)
		.then(_d => {
			if (_d) {
				return next(new Error('Group name already in use'));
			}
			next();
		})
		.catch(next);
});

// To check if Users in group valid or not
schema.pre('save', function (next) {
	let users = _.uniq(this.users);
	if (users) {
		return mongoose.model('user').find({ _id: { $in: users } }, '_id')
			.then(_u => {
				if (_u.length != users.length) {
					let invalidUsr = _.difference(users, _u.map(_o => _o._id));
					next(new Error('Users with ' + invalidUsr + ' not found'));
				} else {
					next();
				}
			})
			.catch(err => {
				next(err);
			});
	} else {
		next();
	}
});

schema.pre('save', function (next) {
	let self = this;
	if (self.roles && self.roles.some(_r => _r.app != self.app)) {
		next(new Error('Roles of other app cannot be added'));
	} else {
		next();
	}
});

schema.pre('save', function (next, req) {
	const users = _.uniq(this.users);
	if (this.name == '#') {
		return next();
	}
	if (req && req.user && req.user._id) {
		if (users.indexOf(req.user._id) > -1) {
			return next(new Error('Cannot manipulate a group, which you are part of.'));
		}
	}
	next();
});

schema.pre('save', function (next, req) {
	let self = this;
	this._req = req;
	if (self._metadata.version) {
		self._metadata.version.release = process.env.RELEASE;
	}
	const headers = {};
	if (req && req.rawHeaders) {
		const headersLen = req.rawHeaders.length;
		for (let index = 0; index < headersLen; index += 2) {
			headers[req.rawHeaders[index]] = req.rawHeaders[index + 1];
		}
	}
	this._req.headers = headers;
	next();
});

schema.pre('save', dataStackUtils.auditTrail.getAuditPreSaveHook('userMgmt.groups'));


schema.pre('save', function (next) {
	let users = [];
	if (this.isNew) {
		users = _.uniq(this.users);
	} else {
		users = _.uniq(_.concat(this.users, this._auditData.data.old.users));
	}
	logger.debug('Removing permissions from Cache');
	users.map(async (userId) => {
		logger.debug('Removing permissions from Cache for User:', userId);
		const keys = await cacheUtils.client.keys(`perm:${userId}_*`);
		const promises = keys.map(async (key) => {
			await cacheUtils.client.del(`${key}`);
		});
		return await Promise.all(promises);
	});
	next();
});


schema.post('save', dataStackUtils.auditTrail.getAuditPostSaveHook('userMgmt.groups.audit', client, 'auditQueue'));

schema.post('save', groupLog.create());

schema.post('save', groupLog.updateGroup());

schema.post('save', function (doc) {
	let eventId;
	if (doc.wasNew)
		eventId = 'EVENT_GROUP_CREATE';
	else
		eventId = 'EVENT_GROUP_UPDATE';
	dataStackUtils.eventsUtil.publishEvent(eventId, 'group', doc._req, doc);
});


schema.pre('remove', dataStackUtils.auditTrail.getAuditPreRemoveHook());
schema.pre('remove', function (next, req) {
	this._req = req;
	logger.debug('Removing permissions from Cache');
	this.users.map(usr => {
		logger.debug('Removing permissions from Cache for User:', usr);
		cacheUtils.unsetUserPermissions(usr + '_' + this.app);
	});
	next();
});

schema.post('remove', dataStackUtils.auditTrail.getAuditPostRemoveHook('userMgmt.groups.audit', client, 'auditQueue'));

schema.post('remove', groupLog.deleteGroup());

schema.post('remove', function (doc) {
	dataStackUtils.eventsUtil.publishEvent('EVENT_GROUP_DELETE', 'group', doc._req, doc);
});

schema.post('remove', function (doc) {
	return mongoose.model('app').find({ 'groups': doc._id })
		.then(_apps => {
			logger.debug('mongoose.model(\'app\').find({ \'groups\': doc._id })');
			logger.debug(_apps);
			if (_apps) {
				let promises = _apps.map(app => {
					app.groups = app.groups.filter(_u => _u != doc._id);
					return app.save(doc._req);
				});
				return Promise.all(promises);
			}
		})
		.then(docs => {
			logger.debug(JSON.stringify(docs));
			if (docs) {
				logger.info('Removed group from ' + docs.map(_d => _d._id) + ' app');
			}
		})
		.catch(err => {
			logger.error(err.message);
		});
});

var crudder = new SMCrud(schema, 'group', options);


function customCreate(req, res) {
	crudder.create(req, res);
}

function customUpdate(req, res) {
	delete req.body.app;
	logger.debug('Update Group ' + JSON.stringify(req.body));
	crudder.update(req, res);
}

function modifyFilterForApp(req) {
	let filter = req.query.filter;
	let app = req.params.app;
	if (filter && typeof filter === 'string') {
		filter = JSON.parse(filter);
	}
	if (filter && typeof filter === 'object') {
		filter.app = app;
	} else {
		filter = { app };
	}
	req.query.filter = JSON.stringify(filter);
}

function modifyBodyForApp(req) {
	let app = req.swagger.params.app.value;
	req.body.app = app;
}

function groupInApp(req, res) {
	modifyFilterForApp(req);
	crudder.index(req, res);
}

function groupInAppShow(req, res) {
	//modifyFilterForApp(req);
	crudder.show(req, res);
}
function groupInAppCount(req, res) {
	modifyFilterForApp(req);
	crudder.count(req, res);
}


function groupInAppCreate(req, res) {
	modifyBodyForApp(req);
	crudder.create(req, res);
}

function groupInAppUpdate(req, res) {
	modifyBodyForApp(req);
	crudder.update(req, res);
}
function groupInAppDestroy(req, res) {
	modifyBodyForApp(req);
	crudder.destroy(req, res);
}

module.exports = {
	create: customCreate,
	index: crudder.index,
	show: crudder.show,
	destroy: crudder.destroy,
	update: customUpdate,
	count: crudder.count,
	groupInApp,
	groupInAppCount,
	groupInAppShow,
	groupInAppCreate,
	groupInAppUpdate,
	groupInAppDestroy
};