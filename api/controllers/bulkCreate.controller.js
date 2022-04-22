'use strict';

const mongoose = require('mongoose');
const definition = require('../helpers/userMgmtBulkCreate.definition.js').definition;
// const definition= { 'name': { 'type': 'String' } };

const SMCrud = require('@appveen/swagger-mongoose-crud');
const schema = new mongoose.Schema(definition,{timestamps: true});

schema.index({createdAt: 1},{expireAfterSeconds: 3600});
const logger = global.logger;

var options = {
	logger: logger,
	collectionName: 'userMgmt.users.bulkCreate'
};

var crudder = new SMCrud(schema, 'bulkCreate', options);

function modifyFilterForBulkCreate(req) {
	let filter = req.query.filter;
	let fileId = req.params.fileId;
	if (filter && typeof filter === 'string') {
		filter = JSON.parse(filter);
	}
	if (filter && typeof filter === 'object') {
		filter.fileId = fileId;
	} else {
		filter = {
			fileId
		};
	}
	req.query.filter = JSON.stringify(filter);
}

function bulkUserIndex(req, res) {
	modifyFilterForBulkCreate(req);
	crudder.index(req, res);
}

function bulkUserCount(req, res) {
	modifyFilterForBulkCreate(req);
	crudder.count(req, res);
}

module.exports = {
	bulkUserCount: bulkUserCount,
	bulkUserIndex: bulkUserIndex
};