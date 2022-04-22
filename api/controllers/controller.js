
// const logger = global.logger;

'use strict';
//controllers
const KeyController = require('./keys.controller');
const UserController = require('./user.controller.js');
const AppController = require('./app.controller.js');
const PerferencesController = require('./preferences.controller.js');
const GroupController = require('./group.controller.js');
const ConfigController = require('./config.controller');
const FilterController = require('./filter.controller');
const BulkCreateController = require('./bulkCreate.controller.js');
const BookmarkController=require('./bookmark.controller.js');


AppController.init()
	.then(() => UserController.init());

//exports
// var exports = {};
// exports.UserCreate = UserController.create;
// exports.authType = UserController.authType;
// exports.UserList = UserController.index;
// exports.UserShow = UserController.show;
// exports.UserDestroy = UserController.destroy;
// exports.UserUpdate = UserController.update;
// exports.UserCount = UserController.count;
// exports.UserAudit = UserAuditController.index;
// exports.UserAuditCount = UserAuditController.count;
// exports.UserUpdatePassword = UserController.updatePassword;
// exports.UserResetPassword = UserController.resetPassword;
// exports.UserRolesListing = UserController.getRolesList;
// exports.UserRolesType = UserController.getRolesType;
// exports.UserAllRoles = UserController.getAllRolesofUser;
// exports.UserAppList = UserController.getUserAppList;
// exports.UserCloseSessionsForUser = UserController.closeAllSessionForUser;
// // exports.UserCloseSessions = UserController.closeAllSession;
// exports.UserHB = UserController.heartBeatAPI;
// exports.LdapUserImport = UserController.importLdapUser;
// exports.health = UserController.health;
// exports.readiness = UserController.readiness;
// exports.BulkAddUserValidate = UserController.bulkAddUserValidate;
// exports.BulkAddUserCreate = UserController.bulkAddUserCreate;
// exports.BulkAddUserDownload = UserController.bulkAddUserDownload;

// exports.BulkCreateUserCount = BulkCreateController.bulkUserCount;
// exports.BulkCreateUserList = BulkCreateController.bulkUserIndex;

// exports.BookmarkCreate=BookmarkController.create;
// exports.BookmarkUpdate=BookmarkController.update;
// exports.BookmarkDelete=BookmarkController.delete;
// exports.BookmarkList = BookmarkController.customIndex;
// exports.BookmarkCount = BookmarkController.customCount;
// exports.BookmarkShow = BookmarkController.show;
// exports.BookmarkBulkDelete = BookmarkController.bulkDelete;

// exports.UserLocalLogin = UserController.localLogin;
// exports.UserLdapLogin = UserController.ldapLogin;
// exports.UserLogout = UserController.logout;
// exports.UserValidateUserSession = UserController.validateUserSession;
// exports.UserCheckUserSession = UserController.checkUserSession;
// exports.UserExtendUserSession = UserController.extendSession;
// exports.UserRefreshUserSession = UserController.refreshToken;
// exports.UserAzureLogin = UserController.azureLogin;
// exports.UserAzureLoginCallback = UserController.azureLoginCallback;
// // exports.AzureUserFetch = UserController.azureUserFetch,
// // exports.AzureUserFetchCallback = UserController.azureUserFetchCallback,
// exports.CreateUserAddToGroup = UserController.createUserinGroups;
// exports.UserAddToGroup = UserController.addUserToGroups;
// exports.UserRemoveFromGroup = UserController.removeUserFromGroups;
// exports.UserEditAppAdmin = UserController.editAppAdmin;
// exports.UserEditSuperAdmin = UserController.editSuperAdmin;
// exports.UserAddToApps = UserController.addUserToApps;
// exports.UserImportToApp = UserController.importUserToApp;
// exports.UserInApp = UserController.userInApp;
// exports.BotInApp = UserController.botInApp;
// exports.UserInAppCount = UserController.userInAppCount;
// exports.UserInAppShow = UserController.userInAppShow;
// exports.UserInGroup = UserController.UserInGroup;
// exports.UserInGroupCount = UserController.UserInGroupCount;
// exports.distinctUserAttribute = UserController.distinctUserAttribute;
// exports.BotInAppCount = UserController.botInAppCount;
// // exports.UserChangeADAttribute = UserController.fixAllADUsers;
// // exports.UserADFix = UserController.fixSingleADUsers;
// // exports.UserADEmailFix = UserController.refreshADEmail;

// exports.ConfigList = ConfigController.index;
// exports.ConfigShow = ConfigController.show;

// // exports.LdapTestConnection = LdapController.testConnection;
// // exports.LdapTestMapping = LdapController.testAuth;
// // exports.LdapSearchUsers = LdapController.searchUsers;
// // exports.LdapSaveConnection = LdapController.saveConnection;
// // exports.AzureCode = LdapController.authorizationRequestCallback;

// exports.AppCreate = AppController.create;
// exports.AppList = AppController.index;
// exports.AppShow = AppController.show;
// exports.AppUpdate = AppController.update;
// exports.AppDestroy = AppController.destroy;
// exports.AppAudit = AppAuditController.index;
// exports.AppAuditCount = AppAuditController.count;
// exports.AppRemoveUsers = AppController.removeUserFromApp;
// exports.AppRemoveBots = AppController.removeBotFromApp;
// exports.AppAddUsers = AppController.addUsersToApp;
// exports.AppIPlist = AppController.fetchIPwhitelisting;

// exports.RolesCreate = RolesController.create;
// exports.RolesList = RolesController.index;
// exports.RolesShow = RolesController.show;
// exports.RolesUpdate = RolesController.update;
// exports.RolesDestroy = RolesController.destroy;
// exports.RolesDefinitionUpdate = RolesController.changeRolesDefinition;
// exports.RolesNameShow = RolesController.getRoleName;

// exports.ApproversList = WorkflowController.getApproversList;

// exports.ServiceDestroy = ServiceController.destroy;
// exports.ServiceCreate = ServiceController.create;
// exports.LibraryDestroy = ServiceController.deleteLibrary;
// exports.LibraryCreate = ServiceController.createLibrary;

// exports.PartnerDestroy = PartnerController.destroy;
// exports.PartnerCreate = PartnerController.create;
// exports.FlowDestroy = PartnerController.destroyFlow;
// exports.NSCreate = PartnerController.CreateNs;
// exports.NSDestroy = PartnerController.destroyNS;
// exports.DFDestroy = PartnerController.destroyDF;

// exports.PreferencesCreate = PerferencesController.create;
// exports.PreferencesList = PerferencesController.index;
// exports.PreferencesShow = PerferencesController.show;
// exports.PreferencesUpdate = PerferencesController.update;
// exports.PreferencesDestroy = PerferencesController.destroy;
// exports.PreferencesAudit = PerferencesAuditController.index;
// exports.PreferencesAuditCount = PerferencesAuditController.count;

// exports.FilterCreate = FilterController.create;
// exports.FilterList = FilterController.index;
// exports.FilterShow = FilterController.show;
// exports.FilterUpdate = FilterController.update;
// exports.FilterDestroy = FilterController.destroy;

// exports.GroupCreate = GroupController.create;
// exports.GroupList = GroupController.index;
// exports.GroupShow = GroupController.show;
// exports.GroupUpdate = GroupController.update;
// exports.GroupDestroy = GroupController.destroy;
// exports.GroupCount = GroupController.count;
// exports.GroupInApp = GroupController.groupInApp;
// exports.GroupInAppShow = GroupController.groupInAppShow;
// exports.GroupInAppCount = GroupController.groupInAppCount;

// exports.ReviewPermission = RolesController.reviewPermission;
// exports.ReviewPermissionService = RolesController.reviewPermissionService;

// exports.createBotKey = UserController.createBotKey;
// exports.updateBotKey = UserController.updateBotKey;
// exports.deleteBotKey = UserController.deleteBotKey;
// exports.endBotKeySession = UserController.endBotKeySession;
// exports.disableUser = UserController.disableUser;
// exports.GetKeysOfApp = KeyController.GetKeysOfApp;
// module.exports = exports;


const router = require('express').Router();

router.get('/admin/app', AppController.index);
router.post('/admin/app', AppController.create);
router.get('/admin/app/:id', AppController.show);
router.put('/admin/app/:id', AppController.update);
router.delete('/admin/app/:id', AppController.destroy);
router.get('/admin/user', UserController.index);
router.post('/admin/user', UserController.create);
router.get('/admin/user/utils/count', UserController.count);
router.get('/admin/user/:id', UserController.show);
router.put('/admin/user/:id', UserController.update);
router.delete('/admin/user/:id', UserController.destroy);
router.put('/admin/user/:id/superAdmin/:action', UserController.editSuperAdmin);
router.put('/admin/user/utils/addToGroups/:id', UserController.addUserToGroups);
router.put('/admin/user/utils/removeFromGroups/:id', UserController.removeUserFromGroups);
router.put('/admin/user/utils/addToApps/:id', UserController.addUserToApps);
router.put('/admin/user/utils/appAdmin/:id/:action', UserController.editAppAdmin);
router.get('/admin/group/count', GroupController.count);
router.get('/admin/group', GroupController.index);
router.post('/admin/group', GroupController.create);
router.get('/admin/group/:id', GroupController.show);
router.put('/admin/group/:id', GroupController.update);
router.delete('/admin/group/:id', GroupController.destroy);
router.get('/:app/user', UserController.userInApp);
router.post('/:app/user', UserController.createUserinGroups);
router.get('/:app/user/utils/count', UserController.userInAppCount);
router.get('/:app/user/:id', UserController.userInAppShow);
router.put('/:app/user/:id', UserController.update);
router.delete('/:app/user/:id', UserController.destroy);
router.put('/:app/user/utils/bulkCreate/:fileId/validate', UserController.bulkAddUserValidate);
router.post('/:app/user/utils/bulkCreate/:fileId', UserController.bulkAddUserCreate);
router.get('/:app/user/utils/bulkCreate/:fileId/download', UserController.bulkAddUserDownload);
router.get('/:app/user/utils/bulkCreate/:fileId/count', BulkCreateController.bulkUserCount);
router.get('/:app/user/utils/bulkCreate/:fileId/userList', BulkCreateController.bulkUserIndex);
router.get('/:app/user/utils/distinctAttributes', UserController.distinctUserAttribute);
router.delete('/:app/user/utils/closeAllSessions/:id', UserController.closeAllSessionForUser);
router.put('/:app/user/utils/appAdmin/:id/:action', UserController.editAppAdmin);
router.put('/:app/user/utils/reset/:id', UserController.resetPassword);
router.put('/:app/user/utils/addToGroups/:id', UserController.addUserToGroups);
router.put('/:app/user/utils/removeFromGroups/:id', UserController.removeUserFromGroups);
router.put('/:app/user/utils/import/:id', UserController.importUserToApp);
router.put('/:app/user/utils/removeUsers', AppController.removeUserFromApp);
router.put('/:app/user/utils/removeBots', AppController.removeBotFromApp);
router.put('/:app/:userType/utils/status/:id/:userState', UserController.disableUser);
router.get('/:app/bot', UserController.botInApp);
router.post('/:app/bot', UserController.createUserinGroups);
router.get('/:app/bot/utils/count', UserController.botInAppCount);
router.get('/:app/bot/:id', UserController.userInAppShow);
router.put('/:app/bot/:id', UserController.update);
router.delete('/:app/bot/:id', UserController.destroy);
router.post('/:app/bot/utils/botKey/:id', UserController.createBotKey);
router.put('/:app/bot/utils/botKey/:id', UserController.updateBotKey);
router.delete('/:app/bot/utils/botKey/:id', UserController.deleteBotKey);
router.delete('/:app/bot/utils/botKey/session/:id', UserController.endBotKeySession);
router.get('/:app/group/count', GroupController.groupInAppCount);
router.get('/:app/group', GroupController.groupInApp);
router.post('/:app/group', GroupController.create);
router.get('/:app/group/:id', GroupController.groupInAppShow);
router.put('/:app/group/:id', GroupController.update);
router.delete('/:app/group/:id', GroupController.destroy);
router.get('/:app/group/:id/:usrType/count', UserController.UserInGroupCount);
router.get('/:app/group/:id/:usrType', UserController.UserInGroup);
router.get('/:app/keys', KeyController.GetKeysOfApp);
router.get('/data/:id/allRoles', UserController.getAllRolesofUser);
router.get('/data/:id/appList', UserController.getUserAppList);
router.get('/data/preferences', PerferencesController.index);
router.post('/data/preferences', PerferencesController.create);
router.get('/data/preferences/:id', PerferencesController.show);
router.put('/data/preferences/:id', PerferencesController.update);
router.delete('/data/preferences/:id', PerferencesController.destroy);
router.get('/data/filter', FilterController.index);
router.post('/data/filter', FilterController.create);
router.get('/data/filter/:id', FilterController.show);
router.put('/data/filter/:id', FilterController.update);
router.delete('/data/filter/:id', FilterController.destroy);
router.get('/data/config', ConfigController.index);
router.get('/data/config/:id', ConfigController.show);
router.get('/data/app/:id', AppController.show);
router.get('/data/app', AppController.index);
router.get('/auth/authType/:id', UserController.authType);
router.post('/auth/login', UserController.localLogin);
router.post('/auth/ldap/login', UserController.ldapLogin);
router.get('/auth/azure/login', UserController.azureLogin);
router.get('/auth/azure/login/callback', UserController.azureLoginCallback);
router.delete('/auth/logout', UserController.logout);
router.put('/auth/change-password', UserController.updatePassword);
router.get('/auth/validate', UserController.validateUserSession);
router.get('/auth/check', UserController.checkUserSession);
router.get('/auth/extend', UserController.extendSession);
router.get('/auth/refresh', UserController.refreshToken);
router.put('/auth/hb', UserController.heartBeatAPI);
router.get('/:app/app/ipwhitelisting', AppController.fetchIPwhitelisting);
router.get('/:app/bookmark/utils/count', BookmarkController.customCount);
router.post('/:app/bookmark', BookmarkController.create);
router.get('/:app/bookmark', BookmarkController.customIndex);
router.delete('/:app/bookmark/utils/bulkDelete', BookmarkController.bulkDelete);
router.get('/:app/bookmark/:id', BookmarkController.show);
router.put('/:app/bookmark/:id', BookmarkController.update);
router.delete('/:app/bookmark/:id', BookmarkController.delete);
router.get('/internal/health/live', UserController.health);
router.get('/internal/health/ready', UserController.readiness);

module.exports = router;
