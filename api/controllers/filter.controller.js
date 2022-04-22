'use strict';

const mongoose = require('mongoose');
const definition = require('../helpers/filter.definition').definition;
const SMCrud = require('@appveen/swagger-mongoose-crud');
const utils = require('@appveen/utils');
const schema = new mongoose.Schema(definition);
let queueMgmt = require('../../util/queueMgmt');
var client = queueMgmt.client;
const logger = global.logger;
const dataStackUtils = require('@appveen/data.stack-utils');

var options = {
	logger: logger,
	collectionName: 'userMgmt.filter'
};
schema.index({ userId: 1, key: 1 });

schema.pre('save', utils.counter.getIdGenerator('FIL', 'filter', null, null, 1000));

schema.pre('save', function (next) {
	let self = this;
	if (self._metadata.version) {
		self._metadata.version.release = process.env.RELEASE;
	}
	next();
});

schema.pre('save', function (next) {
	var idregex = '^[a-zA-Z0-9 ]*$';
	if (!this.name.match(idregex)) {
		next(new Error('Filter name must consist of alphanumeric characters .'));
	}
	else if (this.name.length > 40) {
		next(new Error('Filter name cannot be greater than 40'));
	}
	next();
});

schema.pre('validate', function (next) {
	let self = this;
	return crudder.model.findOne({ app: self.app, name: self.name, serviceId: self.serviceId, _id: { $ne: self._id } }, { _id: 1 })
		.then(_d => {
			if (_d) {
				return next(new Error('Filter name is already in use'));
			}
			return next();
		})
		.catch(err => {
			logger.error(err);
			next(err);
		});
});

schema.pre('save', dataStackUtils.auditTrail.getAuditPreSaveHook('userMgmt.filter'));

schema.post('save', dataStackUtils.auditTrail.getAuditPostSaveHook('userMgmt.filter.audit', client, 'auditQueue'));

schema.pre('remove', dataStackUtils.auditTrail.getAuditPreRemoveHook());

schema.post('remove', dataStackUtils.auditTrail.getAuditPostRemoveHook('userMgmt.apps.audit', client, 'auditQueue'));

var crudder = new SMCrud(schema, 'userMgmt.filter', options);
function customCreate(req, res) {
	if (req.body.private == null) {
		if (process.env.SAVE_FILTER_DEFAULT_MODE_PRIVATE == null) {
			req.body.private = true;
		}
		else req.body.private = process.env.SAVE_FILTER_DEFAULT_MODE_PRIVATE;
	}
	let body = {};
	body = req.body;
	crudder.model.create(body).then(result => {
		return res.status(200).json(result);
	})
		.catch(err => {
			return res.status(500).json({ message: err.message });
		});

}
function customIndex(req, res) {
	let filter = {};
	if (req.query.filter) filter = JSON.parse(req.query.filter);
	let user = req.headers.user;
	filter['$or'] = [{ $and: [{ 'private': true }, { 'createdBy': user }] }, { 'private': false }];
	crudder.model.find(filter)
		.then(result => {
			return res.status(200).json(result);
		})
		.catch(err => {
			return res.status(500).json({ message: err.message });
		});
}

function customUpdate(req, res) {
	let id = req.params.id;
	let user = req.headers.user;
	let userDatails = req.user;
	crudder.model.findOne({ '_id': id })
		.then(result => {
			if (result) {
				if (userDatails.isSuperAdmin && !result.private) {
					crudder.update(req, res);
				}
				else if (userDatails.isSuperAdmin && result.private && result.createdBy == user) {
					crudder.update(req, res);
				}
				else if (userDatails.isSuperAdmin && result.private && result.createdBy != user) {
					return res.status(400).json({ 'mesaage': 'unauthorized' });
				}
				else if (!userDatails.isSuperAdmin && result.createdBy == user) {
					crudder.update(req, res);
				}
				else {
					return res.status(400).json({ 'mesaage': 'unauthorized' });
				}
			}
			else {
				return res.status(400).json({ 'mesaage': 'filter not found' });
			}
		});



}
module.exports = {
	create: customCreate,
	index: customIndex,
	show: crudder.show,
	destroy: crudder.destroy,
	update: customUpdate
};