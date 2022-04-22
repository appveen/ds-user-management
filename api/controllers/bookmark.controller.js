'use strict';

const mongoose = require('mongoose');
const definition = require('../helpers/bookmark.definition.js').definition;
const SMCrud = require('@appveen/swagger-mongoose-crud');
const schema = new mongoose.Schema(definition);
const logger = global.logger;
const utils = require('@appveen/utils');

var options = {
	logger: logger,
	collectionName: 'userMgmt.bookmark'
};

schema.index({ name: 1, app: 1 }, { unique: '__CUSTOM_NAME_DUPLICATE_ERROR__' });

schema.pre('save', utils.counter.getIdGenerator('BM', 'bookmark', null, null, 1000));

schema.pre('save', function (next) {
	let self = this;
	if (self._metadata.version) {
		self._metadata.version.release = process.env.RELEASE;
	}
	next();
});

schema.post('save', function (error, doc, next) {
	if ((error.errors && error.errors.name) || error.name === 'ValidationError' && error.message.indexOf('__CUSTOM_NAME_DUPLICATE_ERROR__') > -1) {
		next(new Error('Bookmark name already in use'));
	} else {
		next();
	}
});

schema.pre('save', function (next) {
	let users = this.createdBy;
	if (users) {
		return mongoose.model('user').find({ _id: users }, '_id')
			.then(_u => {
				if (_u.length < 1) {
					next(new Error('Users with ' + users + ' id not found'));
				} else {
					next();
				}
			})
			.catch(err => {
				next(err);
			});
	}
	else {
		next();
	}
});

schema.pre('save', function (next) {
	let app = this.app;
	if (app) {
		return mongoose.model('app').find({ _id: app }, '_id')
			.then(_a => {
				if (_a.length < 1) {
					next(new Error('App with name ' + app + ' not found'));
				} else {
					next();
				}
			})
			.catch(err => {
				next(err);
			});
	}
	else {
		next();
	}
});

var crudder = new SMCrud(schema, 'bookmark', options);
var e = {};

function modifyFilterForBookmark(req) {
	let filter = req.query.filter;
	let app = req.params.app;
	if (filter && typeof filter === 'string') {
		filter = JSON.parse(filter);
	}
	if (filter && typeof filter === 'object') {
		filter.app = app;
	} else {
		filter = {
			app
		};
	}
	req.query.filter = JSON.stringify(filter);
}

e.customCount = (req, res) => {
	modifyFilterForBookmark(req);
	crudder.count(req, res);
};

e.customIndex = (req, res) => {
	modifyFilterForBookmark(req);
	crudder.index(req, res);
};

function checkApp(req) {
	let appParam = req.params.app.value;
	let appBody = req.body.app;
	return appParam == appBody;
}

e.customCreate = (req, res) => {
	checkApp(req, res) ? crudder.create(req, res) : res.status(400).json({ message: 'App name in the request parameter should match app name in request body' });
};

e.customUpdate = (req, res) => {
	checkApp(req, res) ? crudder.update(req, res) : res.status(400).json({ message: 'App name in the request parameter should match app name in request body' });
};
e.customDestroy = (req, res) => {
	crudder.destroy(req, res)
		.then(() => {
			let bm = req.params.id;
			let bmDelete = 'BM_' + bm;
			return mongoose.model('group').find({ 'roles.entity': bmDelete })
				.then(docs => {
					return docs.reduce((_bm, cur) => {
						return _bm
							.then(() => {
								cur.roles = cur.roles.filter(value => {
									if (value.entity == bmDelete) {
										return false;
									}
									else return true;
								});
								cur.markModified('roles');
								cur.save(req);
							});
					}, Promise.resolve());
				})
				.catch(err => {
					logger.error(err.message);
				});
		});
};

e.bulkDestroy = (req, res) => {
	let bm = req.params.id;
	bm = bm.split(',');
	let bookm = bm.map(k => 'BM_' + k);
	return mongoose.model('group').find({ 'roles.entity': { $in: bookm } })
		.then(docs => {
			return docs.reduce((_bm, cur) => {
				return _bm
					.then(() => {
						cur.roles = cur.roles.filter(value => {
							if (bookm.includes(value.entity)) {
								return false;
							}
							else return true;
						});
						cur.markModified('roles');
						cur.save(req);
					});
			}, Promise.resolve());
		})
		.then(() => {
			crudder.bulkDestroy(req, res);
		})
		.catch(err => {
			logger.error(err.message);
		});

};

module.exports = {
	customIndex: e.customIndex,
	customCount: e.customCount,
	show: crudder.show,
	create: e.customCreate,
	update: e.customUpdate,
	delete: e.customDestroy,
	bulkDelete: e.bulkDestroy
};