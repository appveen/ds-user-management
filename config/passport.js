var LocalStrategy = require('passport-local').Strategy;
var LdapStrategy = require('passport-ldapauth');
// var OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
// var AzureAdOAuth2Strategy = require('passport-azure-ad-oauth2');
var config = require('./config');
var { validateLocalLogin, validateLdapLogin, validateAzureLogin } = require('./../api/controllers/user.controller');

module.exports = function (passport) {
	passport.use(new LocalStrategy(validateLocalLogin));

	if (config.RBAC_USER_AUTH_MODES.includes('ldap')) {
		passport.use(new LdapStrategy({ server: config.ldapDetails.ldapServerDetails }, validateLdapLogin));
	}

	// if (config.RBAC_USER_AUTH_MODES.includes('azure')) {
	// 	passport.use('AzureLogIn', new OIDCStrategy(config.azurePassportConfig('login'), validateAzureLogin));
	// }
};