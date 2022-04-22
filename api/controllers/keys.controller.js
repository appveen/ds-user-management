'use strict';

const mongoose = require('mongoose');
const SMCrud = require('@appveen/swagger-mongoose-crud');
const utils = require('@appveen/utils');
const { Certificate } = require('@fidm/x509');
const _ = require('lodash');

const config = require('../../config/config');
const cryptUtils = require('../helpers/util/crypto.utils');
const definition = require('../helpers/key.definition.js').definition;
const schema = new mongoose.Schema(definition);
const logger = global.logger;

var options = {
	logger: logger,
	collectionName: 'sec.encr'
};

schema.pre('save', utils.counter.getIdGenerator('EN', 'sec.encr', null, null, 1000));


schema.pre('save', async function (next) {
	try {
		const doc = this;
		if (!doc.isNew) {
			return next();
		}
		const certificate = {};
		const keys = await cryptUtils.createKeyCert(doc.app);
		logger.trace(keys);
		const cert = Certificate.fromPEM(keys.certificate);
		const encCert = cryptUtils.encrypt(keys.certificate, config.encryptionKey);
		const encKey = cryptUtils.encrypt(keys.serviceKey, config.encryptionKey);

		keys.key = encKey;
		keys.certificate = encCert;
		keys.app = doc.app;
		keys.expiry = cert.validTo;
		keys.name = cert.subject.commonName;
		certificate.serialNumber = cert.serialNumber.toString();
		certificate.signatureOID = cert.signatureOID.toString();
		certificate.signatureAlgorithm = cert.signatureAlgorithm.toString();
		certificate.infoSignatureOID = cert.infoSignatureOID.toString();
		certificate.validFrom = cert.validFrom.toString();
		certificate.validTo = cert.validTo.toString();
		certificate.subjectKeyIdentifier = cert.subjectKeyIdentifier.toString();
		certificate.authorityKeyIdentifier = cert.authorityKeyIdentifier.toString();
		certificate.ocspServer = cert.ocspServer.toString();
		certificate.issuingCertificateURL = cert.issuingCertificateURL.toString();
		certificate.isCA = cert.isCA.toString();
		certificate.maxPathLen = cert.maxPathLen.toString();
		certificate.basicConstraintsValid = cert.basicConstraintsValid.toString();
		certificate.keyUsage = cert.keyUsage.toString();
		certificate.extensions = cert.extensions;
		certificate.dnsNames = cert.dnsNames;
		certificate.emailAddresses = cert.emailAddresses;
		certificate.ipAddresses = cert.ipAddresses;
		certificate.uris = cert.uris;
		certificate.issuer = JSON.parse(JSON.stringify(cert.issuer));
		certificate.subject = JSON.parse(JSON.stringify(cert.subject));
		certificate.publicKey = {};
		certificate.publicKey.algo = JSON.parse(JSON.stringify(cert.publicKey)).algo;
		certificate.publicKey.oid = JSON.parse(JSON.stringify(cert.publicKey)).oid;
		keys.info = certificate;
		_.merge(this, keys);
	} catch (err) {
		logger.error(err);
		next(err);
	}
});


var crudder = new SMCrud(schema, 'keys', options);


async function customShow(req, res) {
	try {
		const keys = {};
		keys.encryptionKey = config.encryptionKey;
		const app = req.params.app;
		const doc = await crudder.model.findOne({ app }).lean();
		keys.baseKey = doc.key;
		keys.baseCert = doc.certificate;
		res.status(200).json(keys);
	} catch (err) {
		logger.error(err);
		res.status(500).json({ message: err.message });
	}
}

module.exports = {
	GetKeysOfApp: customShow,
};