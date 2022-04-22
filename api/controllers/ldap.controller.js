// 'use strict';

// const logger = global.logger;
// let ldapUtil = require('../helpers/util/ldap.util');
// let azureAdUtil = require('../helpers/util/azureAd.util');
// const envConfig = require('../../config/config');

// TBD

// function testAuth(req, res) {
// 	let auth = req.params.auth.value;
// 	if (auth === 'ldap') {
// 		return testMapping(req, res);
// 	} else if (auth === 'azure') {
// 		return testAzure(req, res);
// 	}
// }

// function testAzure(req, res) {
// 	let fqdn = process.env.FQDN || 'localhost';
// 	let protocol = envConfig.isK8sEnv() ? 'https' : 'http';
// 	let configObj = {
// 		'configType': 'auth',
// 		'auth': {
// 			'class': 'AD',
// 			'mode': 'azure',
// 			'connectionDetails': {
// 				'clientId': req.body.clientId,
// 				'clientSecret': req.body.clientSecret,
// 				'tenant': req.body.tenant,
// 				'redirectUri': {
// 					'login': `${protocol}://${fqdn}/api/a/rbac/callback/azure/login`,
// 					'userFetch': `${protocol}://${fqdn}/api/a/rbac/callback/azure/userFetch`
// 				},
// 				'adUsernameAttribute': (req.body.adUsernameAttribute ? req.body.adUsernameAttribute : 'mail')
// 			},
// 			'enabled': false
// 		},
// 		'_metadata': {
// 			'deleted': false,
// 			'createdAt': new Date(),
// 			'lastUpdated': new Date()
// 		}
// 	};
// 	mongoose.model('config').update({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure', 'auth.enabled': false }, configObj, { upsert: true })
// 		.then(() => {
// 			res.status(200).json(configObj);
// 		})
// 		.catch(err => {
// 			logger.error(err);
// 			res.status(500).json({ message: err.message });
// 		});
// }

// function authorizationRequestCallback(req, res) {
// 	let code = req.params.code.value;
// 	return azureAdUtil.requestAccessCode(code, 'userFetch')
// 		.then(accToken => {
// 			let client = MicrosoftGraph.Client.init({
// 				authProvider: (done) => {
// 					done(null, accToken); //first parameter takes an error if you can't get an access token
// 				}
// 			});
// 			logger.info('Access Token Received');
// 			logger.debug({ accToken });
// 			const encrypted = encrypt(accToken);
// 			logger.debug({ encrypted });
// 			return new Promise((resolve, reject) => {
// 				client
// 					.api('/users')
// 					.top(2)
// 					.get((err) => {
// 						if (err) {
// 							logger.error(err);
// 							reject(err);
// 							let errMsg = 'User fetch API failed';
// 							if (err.message) errMsg = err.message;
// 							else {
// 								try {
// 									let errBody = JSON.parse(err.body);
// 									errMsg = errBody.error && errBody.error.message ? errBody.error.message : errMsg;
// 								} catch (err) {
// 									//do nothing
// 								}
// 							}
// 							res.end(`<script>
//     window.parent.localStorage.setItem('azure-status','401');
//     window.parent.localStorage.setItem('azure-body','${JSON.stringify({ message: errMsg, adToken: encrypted })}');
//     window.close();
//     </script>`);
// 							return;
// 						}
// 						return resolve(encrypted);
// 					});
// 			});
// 		})
// 		// .then(accToken => {
// 		// 	if (accToken)
// 		// 		return mongoose.model('config').update({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure' }, { $set: { 'auth.connectionDetails.accessToken': accToken } });
// 		// })
// 		.then((encrypted) => {
// 			if (!res.headersSent) {
// 				res.end(`<script>
//     window.parent.localStorage.setItem('azure-status','200');
//     window.parent.localStorage.setItem('azure-body','${JSON.stringify({ message: 'Success', adToken: encrypted })}');
//     window.close();
//     </script>`);
// 			}
// 		})
// 		.catch(err => {
// 			logger.error(err);
// 			if (!res.headersSent) {
// 				res.end(`<script>
//     window.parent.localStorage.setItem('azure-status','500');
//     window.parent.localStorage.setItem('azure-body','${JSON.stringify({ message: err.message })}');
//     window.close();
//     </script>`);
// 			}
// 			// res.status(500).json({ message: err.message });
// 		});
// }

// function getUsersFromAD(req, res) {
// 	let filter = req.body.filter;
// 	// let savedConfig = req.body.savedConfig ? req.body.savedConfig : false;
// 	let accToken = req.body.adToken;
// 	if (accToken) {
// 		const decrypted = azureAdUtil.decrypt(accToken);
// 		logger.debug({ decrypted });
// 		// let client = MicrosoftGraph.Client.init({
// 		// 	authProvider: (done) => {
// 		// 		done(null, decrypted); //first parameter takes an error if you can't get an access token
// 		// 	}
// 		// });
// 		// let filter = searchText && searchText.length > 0 ? `startswith(displayName, '${searchText}')` : '';
// 		azureAdUtil.searchUser(decrypted, filter).then(usersList => {
// 			if(usersList && usersList.length)
// 				return res.json(usersList);
// 			else
// 				return res.status(400).json({ message: 'Users not found' });
// 		}).catch(error => {
// 			logger.error('Error in getUsersFromAD :: ', error);
// 			return res.status(400).json({ message: error.message });
// 		});
// 		// return mongoose.model('config').findOne({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure' })
// 		// 	.then(_d => {
// 		// 		if (!_d) throw new Error('Config is not AzureAD.');
// 		// 		let configADAttr = _d && _d.auth && _d.auth.connectionDetails && _d.auth.connectionDetails && _d.auth.connectionDetails.adUsernameAttribute ? _d.auth.connectionDetails.adUsernameAttribute : 'mail';
// 		// 		return client
// 		// 			.api('/users')
// 		// 			.filter(filter)
// 		// 			.get((err, result) => {
// 		// 				if (err) {
// 		// 					logger.error(err);
// 		// 					let errMsg = 'User fetch API failed';
// 		// 					if (err.message) errMsg = err.message;
// 		// 					else {
// 		// 						try {
// 		// 							let errBody = JSON.parse(err.body);
// 		// 							errMsg = errBody.error && errBody.error.message ? errBody.error.message : errMsg;
// 		// 						} catch (err) {
// 		// 							//do nothing
// 		// 						}
// 		// 					}
// 		// 					return res.status(401).json({ message: errMsg });
// 		// 				}
// 		// 				if (result.value) {
// 		// 					logger.debug(JSON.stringify({ searchUsersList: result.value }));
// 		// 					let usersList = result.value.filter(_r => _r[configADAttr]).map(_r => { return { username: _r[configADAttr], name: _r.displayName, email: _r.mail }; });
// 		// 					res.json(usersList);
// 		// 				} else {
// 		// 					res.status(400).json({ message: 'Users not found' });
// 		// 				}
// 		// 			});
// 		// 	});
// 	} else {
// 		return res.status(404).json({ message: 'adToken not found' });
// 	}
// 	/*
// 	return mongoose.model('config').findOne({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure', 'auth.enabled': savedConfig, 'auth.connectionDetails.accessToken': { $exists: true } })
// 		.then(_conf => {
// 			if (_conf) {
// 				let client = MicrosoftGraph.Client.init({
// 					authProvider: (done) => {
// 						done(null, _conf.auth.connectionDetails.accessToken); //first parameter takes an error if you can't get an access token
// 					}
// 				});
// 				let filter = searchText && searchText.length > 0 ? `startswith(displayName, '${searchText}')` : '';
// 				return client
// 					.api('/users')
// 					.filter(filter)
// 					.get((err, result) => {
// 						if (err) {
// 							logger.error(err);
// 							return res.status(401).json({ message: err.message });
// 						}
// 						if (result.value) {
// 							let usersList = result.value.filter(_r => _r.mail).map(_r => { return { username: _r.mail, name: _r.displayName }; });
// 							res.json(usersList);
// 						} else {
// 							res.status(400).json({ message: 'Users not found' });
// 						}

// 					});
// 			} else {
// 				res.status(404).json({ message: 'Azure AD config not found' });
// 			}
// 		})
// 		.catch(err => {
// 			res.status(500).json({ message: err.message });
// 		});
// 	*/
// }

// function getUsersFromLDAP(req, res) {
// 	let searchText = req.body.searchText;
// 	let strictSearch = req.body.strict;
// 	let ldapDetails = envConfig.ldapDetails;
// 	let serverDetails = ldapDetails.ldapServerDetails;
// 	let mapping = ldapDetails.mapping;
// 	return ldapUtil.connectLDAP(serverDetails.url, serverDetails.bindDN, serverDetails.bindCredentials)
// 		.then(client => {
// 			let attributes = null;
// 			if (mapping) {
// 				attributes = Object.keys(mapping).map(_k => mapping[_k]);
// 				attributes.push('dn');
// 			}
// 			let filter = '';
// 			if (ldapDetails.baseFilter) {
// 				filter = '&' + ldapDetails.baseFilter;
// 			}
// 			if (strictSearch) {
// 				filter += `(${mapping['username']}=${searchText})`;
// 			} else {
// 				filter += `(|(${mapping['name']}=*${searchText}*)(${mapping['username']}=*${searchText}*))`;
// 			}
// 			return ldapUtil.searchLdap(client, serverDetails.searchBase, filter, attributes);
// 		}, () => {
// 			res.status(400).json({ message: 'Connection/Authentication failed' });
// 		})
// 		.then(users => {
// 			if (users && users.length > 0) {
// 				users = mapUsers(mapping, users);
// 				res.json(users);
// 			} else {
// 				if (!res.headersSent)
// 					res.status(400).json({ message: 'users not found' });
// 			}
// 		}, () => {
// 			res.status(400).json({ message: 'User fetch failed' });
// 		})
// 		.catch(err => {
// 			if (!res.headersSent)
// 				res.status(500).json({ message: err.message });
// 		});
// }

// TBDL
// function testMapping(req, res) {
// 	let url = req.body.url;
// 	let dn = req.body.bindDN;
// 	let pwd = req.body.bindPassword;
// 	let baseDN = req.body.baseDN;
// 	let mapping = req.body.mapping;
// 	let filter = req.body.baseFilter;
// 	let requiredMapping = ['name', 'username'];
// 	if (requiredMapping.some(_k => !mapping[_k] || typeof mapping[_k] !== 'string' || mapping[_k].length == 0)) {
// 		return res.status(400).json({ message: requiredMapping + ' is required' });
// 	}
// 	if (req.user) {
// 		if (!req.user.isSuperAdmin) {
// 			return res.status(403).json({ message: 'user is not super admin' });
// 		}
// 	} else {
// 		return res.status(400).json({ message: 'user detail not found' });
// 	}
// 	ldapUtil.connectLDAP(url, dn, pwd)
// 		.then(client => {
// 			let attributes = null;
// 			if (mapping) {
// 				attributes = Object.keys(mapping).map(_k => mapping[_k]);
// 			}
// 			return ldapUtil.searchLdap(client, baseDN, filter, attributes, 1);
// 		}, msg => {
// 			res.status(400).json(msg);
// 		})
// 		.then(users => {
// 			if (users && users.length > 0) {
// 				res.json({ connection: true, authentication: true, users: true });
// 			} else {
// 				res.status(400).json({ connection: true, authentication: true, users: false });
// 			}
// 		}, msg => {
// 			res.status(400).json(msg);
// 		})
// 		.catch(err => {
// 			if (!res.headersSent)
// 				res.status(500).json({ message: err.message });
// 		});
// }

// TBDL
// function getConnectionDetails(req) {
// 	if (req.user && req.user.auth && req.user.auth.isLdap) {
// 		let auth = req.params.auth.value;
// 		return mongoose.model('config').findOne({ 'auth.mode': auth }).lean(true)
// 			.then(_cf => {
// 				let usrDN = req.user && req.user.auth && req.user.auth.dn ? req.user.auth.dn : null;
// 				if (!usrDN) throw new Error('user dn');
// 				let cf = _cf.auth.connectionDetails;
// 				cf.mapping = JSON.parse(cf.mapping);
// 				cf.bindPassword = req.body.bindPassword;
// 				cf.bindDN = usrDN;
// 				return cf;
// 			});
// 	} else {
// 		return Promise.resolve({
// 			url: req.body.url,
// 			bindDN: req.body.bindDN,
// 			bindPassword: req.body.bindPassword,
// 			baseDN: req.body.baseDN,
// 			mapping: req.body.mapping,
// 			baseFilter: req.body.baseFilter
// 		});
// 	}
// }

// function mapUsers(mapping, users) {
// 	let revMapping = {};
// 	Object.keys(mapping).map(_k => {
// 		revMapping[mapping[_k]] = _k;
// 	});
// 	let newUsers = users.map(_u => {
// 		let newUser = {};
// 		Object.keys(_u).forEach(_k => {
// 			if (revMapping[_k]) {
// 				newUser[revMapping[_k]] = _u[_k];
// 			}
// 		});
// 		newUser['dn'] = _u['dn'];
// 		return newUser;
// 	});
// 	return newUsers;
// }

// function searchUsers(req, res) {
// 	let auth = req.params.auth.value;
// 	if (auth === 'azure' && envConfig.RBAC_USER_AUTH_MODES.includes('azure')) {
// 		return getUsersFromAD(req, res);
// 	} else if((auth === 'ldap' && envConfig.RBAC_USER_AUTH_MODES.includes('ldap'))) {
// 		return getUsersFromLDAP(req, res);
// 	} else {
// 		logger.debug('Authmodes :: ', envConfig.RBAC_USER_AUTH_MODES);
// 		logger.error('Unknown auth mode for this api :: ', auth);
// 		return res.status(400).json({ message: `Unknown auth mode ${auth} for this api.`});
// 	}
// }

// function switchToLdap(req, res) {
// 	let url = req.body.url;
// 	let dn = req.body.bindDN;
// 	let pwd = req.body.bindPassword;
// 	let mapping = req.body.mapping;
// 	let baseDN = req.body.baseDN;
// 	let baseFilter = req.body.baseFilter;
// 	let newAdmin = req.body.admin;
// 	if (req.user) {
// 		if (!req.user.isSuperAdmin) {
// 			return res.status(403).json({ message: 'user is not super admin' });
// 		}
// 	} else {
// 		return res.status(400).json({ message: 'user detail not found' });
// 	}
// 	let newUserDetail = {};
// 	ldapUtil.connectLDAP(url, dn, pwd)
// 		.then(client => {
// 			let attributes = null;
// 			if (mapping) {
// 				attributes = Object.keys(mapping).map(_k => mapping[_k]);
// 				attributes.push('dn');
// 			}
// 			let filter = `(${mapping.username}=${newAdmin})`;
// 			return ldapUtil.searchLdap(client, baseDN, filter, attributes);
// 		}, () => {
// 			res.status(400).json({ message: 'Connection/Authentication failed' });
// 			throw new Error('Connection/Authentication failed');
// 		})
// 		.then(users => {
// 			if (users && users.length > 0) {
// 				logger.info('------ Switching to LDAP config -------');
// 				let ldapUserDetail = users[0];
// 				newUserDetail = {
// 					'basicDetails': {
// 						'name': ldapUserDetail[mapping['name']],
// 						'phone': null,
// 						'alternateEmail': mapping['email'] ? ldapUserDetail[mapping['email']] : null
// 					},
// 					'auth': {
// 						'isLdap': true,
// 						'dn': ldapUserDetail['dn'],
// 						'authType': 'ldap'
// 					},
// 					'isActive': true,
// 					'isSuperAdmin': true,
// 					'enableSessionRefresh': true,
// 					'username': ldapUserDetail[mapping['username']],
// 					'sessionTime': 30,
// 					'accessControl': {
// 						'accessLevel': 'All',
// 						'apps': null
// 					},
// 					'roles': []
// 				};
// 				let ldapConnection = {
// 					'_id': 'LDAP1001',
// 					'auth': {
// 						'mode': 'ldap',
// 						'class': 'Directory',
// 						'connectionDetails': { url: url, bindDN: dn, mapping: JSON.stringify(mapping), baseDN: baseDN, baseFilter: baseFilter }
// 					},
// 					'configType': 'auth'
// 				};
// 				return mongoose.model('config').create(ldapConnection);
// 			} else {
// 				res.status(400).json({ message: 'user not found' });
// 				throw new Error('User not found');
// 			}
// 		}, () => {
// 			res.status(400).json({ message: 'User fetch failed' });
// 			throw new Error('User fetch failed');
// 		})
// 		.then(_d => {
// 			if (_d) {
// 				let UserModel = mongoose.model('user');
// 				let userDoc = new UserModel(newUserDetail);
// 				return userDoc.save(req);
// 			}
// 		})
// 		.then((_d) => {
// 			if (_d) {
// 				logger.info('user created ' + _d._id);
// 				return mongoose.model('user').remove({ '$or': [{ 'auth': { $exists: false } }, { 'auth.isLdap': { $exists: false } }, { 'auth.isLdap': false }, { 'auth.authType': { '$ne': 'ldap' } }] });
// 			}
// 		})
// 		.then(() => {
// 			logger.info('Removed all other users');
// 			return mongoose.model('config').remove({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure', 'auth.enabled': true });
// 		})
// 		.then(() => {
// 			logger.info('Removed existing config');
// 			return mongoose.model('preference').remove({});
// 		})
// 		.then(() => {
// 			logger.info('Removed all preference');
// 			return mongoose.model('group').update({}, { 'users': [] }, { multi: true });
// 		})
// 		.then(() => {
// 			logger.info('Removed all users from group');
// 			logger.info('----- Switched to LDAP config -----');
// 			odpUtils.eventsUtil.publishEvent('EVENT_AUTHENTICATION_MODE_LDAP', 'config', req, {});
// 			res.json({ message: 'Configuration has changed to LDAP' });
// 		})
// 		.catch(err => {
// 			logger.info('-------- Switch to LDAP failed --------');
// 			logger.error(err);
// 			if (!res.headersSent) {
// 				res.status(500).json({ message: err.message });
// 			}
// 			mongoose.model('config').remove({ _id: 'LDAP1001' })
// 				.then(_r => logger.debug(_r));
// 			return mongoose.model('user').remove({ '_id': newUserDetail.username, 'auth.isLdap': true }).then(_r => logger.debug(_r));
// 		});
// }

// function switchToLocal(req, res) {
// 	let user = req.body.user;
// 	if (!req.user.isSuperAdmin) {
// 		return res.status(403).json({ message: 'user is not super admin' });
// 	}
// 	user.isSuperAdmin = true;
// 	user.isActive = true;
// 	if (user.auth) user.auth.authType = 'local';
// 	else user.auth = { 'authType': 'local' };
// 	mongoose.model('user').create(user)
// 		.then(() => {
// 			logger.info('Local user created');
// 			return mongoose.model('user').remove({ $or: [{ 'auth.isLdap': true }, { 'auth.authType': { '$ne': 'local' } }] });
// 		})
// 		.then(() => {
// 			logger.info('Removed all other users');
// 			return mongoose.model('config').remove({ '$or': [{ 'auth.mode': 'ldap' }, { 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure', 'auth.enabled': true }] });
// 		})
// 		.then(() => {
// 			logger.info('Removed existing config');
// 			return mongoose.model('preference').remove({});
// 		})
// 		.then(() => {
// 			logger.info('Removed all preference');
// 			return mongoose.model('group').update({}, { 'users': [] }, { multi: true });
// 		})
// 		.then(() => {
// 			logger.info('Removed all users from group');
// 			odpUtils.eventsUtil.publishEvent('EVENT_AUTHENTICATION_MODE_LOCAL', 'config', req, {});
// 			res.json({ message: 'Configuration has changed to Local' });
// 		})
// 		.catch(err => {
// 			logger.error(err.message);
// 			res.status(500).json({ message: err.message });
// 		});
// }

// function switchToAzure(req, res) {
// 	let user = {
// 		'username': req.body.username,
// 		'isActive': true,
// 		'roles': [],
// 		'basicDetails': {
// 			'name': req.body.name,
// 			'alternateEmail': req.body.username
// 		},
// 		'sessionTime': 30,
// 		'accessControl': {
// 			'accessLevel': 'All',
// 			'apps': null
// 		},
// 		'auth': {
// 			'authType': 'azure'
// 		},
// 		'isSuperAdmin': true,
// 		'description': 'Super admin user for ODP',
// 		'enableSessionRefresh': true
// 	};
// 	if (req.user) {
// 		if (!req.user.isSuperAdmin) {
// 			return res.status(403).json({ message: 'user is not super admin' });
// 		}
// 	} else {
// 		return res.status(400).json({ message: 'user detail not found' });
// 	}
// 	return mongoose.model('config').findOne({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure', 'auth.enabled': true })
// 		.then(_d => {
// 			if (_d) {
// 				res.status(400).json({ message: 'Azure config aleady active' });
// 				throw new Error('Azure config aleady active');
// 			} else {
// 				return mongoose.model('user').create(user);
// 			}
// 		})
// 		.then(() => mongoose.model('config').update({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure', 'auth.enabled': false }, { $set: { 'auth.enabled': true } }))
// 		.then(() => {
// 			logger.info('Azure user created');
// 			// return removeAllUsers({ $or: [{ 'auth.isLdap': true }, { 'auth.authType': { '$ne': 'azure' } }] }, req);
// 			return mongoose.model('user').remove({ $or: [{ 'auth.isLdap': true }, { 'auth.authType': { '$ne': 'azure' } }] });
// 		})
// 		.then(() => {
// 			logger.info('Removed all other users');
// 			return mongoose.model('preference').remove({});
// 		})
// 		.then(() => {
// 			logger.info('Removed all preference');
// 			return mongoose.model('group').update({}, { 'users': [] }, { multi: true });
// 		})
// 		.then(() => {
// 			logger.info('Removed all users from group');
// 			return mongoose.model('config').remove({ '$or': [{ 'auth.mode': 'ldap' }] });
// 		})
// 		.then(() => {
// 			logger.info('Removed existing config');
// 			odpUtils.eventsUtil.publishEvent('EVENT_AUTHENTICATION_MODE_AZURE', 'config', req, {});
// 			res.json({ message: 'Configuration has changed to Azure' });
// 		})
// 		.catch(err => {
// 			logger.error(err.message);
// 			mongoose.model('config').update({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure', 'auth.enabled': true }, { $set: { 'auth.enabled': false } });
// 			if (!res.headersSent) res.status(500).json({ message: err.message });
// 		});
// }

// function saveConnection(req, res) {
// 	let auth = req.params.auth.value;
// 	if (auth === 'ldap') {
// 		switchToLdap(req, res);
// 	} else if (auth === 'azure') {
// 		switchToAzure(req, res);
// 	} else {
// 		switchToLocal(req, res);
// 	}
// }

// function removeAzureConfig(req, res) {
// 	mongoose.model('config').remove({ 'configType': 'auth', 'auth.class': 'AD', 'auth.mode': 'azure', 'auth.enabled': false })
// 		.then(() => {
// 			res.json({ 'message': 'Azure config removed' });
// 		})
// 		.catch(err => {
// 			res.status(500).json({ 'message': err.message });
// 		});
// }

// module.exports = {
// 	// testAuth: testAuth,
// 	// searchUsers: searchUsers,
// 	// saveConnection: saveConnection,
// 	// authorizationRequestCallback: authorizationRequestCallback,
// 	// removeAzureConfig: removeAzureConfig
// };