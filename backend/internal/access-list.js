const _ = require('lodash');
const fs = require('fs');
const batchflow = require('batchflow');
const error = require('../lib/error');
const utils = require('../lib/utils');
const accessListModel = require('../models/access_list');
const accessListAuthModel = require('../models/access_list_auth');
const accessListClientModel = require('../models/access_list_client');
const accessListRoleModel = require('../models/access_list_role');
const logger = require('../logger').access;
const internalNginx = require('./nginx');
const md5 = require('apache-md5');

const internalAccessList = {

	/**
	 * Used in the GET /api/nginx/access-lists endpoint
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	getAll: (access, data) => {
		return access.can('access_lists:list', data)
			.then(() => {
				return accessListModel
					.query()
					.select('access_list.*', accessListModel.raw('COUNT(DISTINCT proxy_host_access_list.proxy_host_id) as proxy_host_count'))
					.leftJoin('proxy_host_access_list', 'access_list.id', 'proxy_host_access_list.access_list_id')
					.groupBy('access_list.id')
					.orderBy('access_list.name', 'ASC');
			})
			.then((rows) => {
				if (rows) {
					const promises = [];

					rows.map((row, i) => {
						if (row.proxy_host_count) {
							promises.push(
								internalNginx.getProxyHostsForAccessList(access, row.id)
									.then((hosts) => {
										row.proxy_hosts = hosts;
										return row;
									})
							);
						}
					});

					return Promise.all(promises)
						.then(() => {
							return rows;
						});
				}

				return [];
			})
			.then((rows) => {
				if (rows) {
					let has_default = false;

					rows.map((row) => {
						if (row.id === 0) {
							has_default = true;
							row._can_edit = false;
							row._can_delete = false;
						} else {
							row._can_edit = true;
							row._can_delete = true;
						}
					});

					if (!has_default) {
						// Add default for display purposes
						rows.push({
							id: 0,
							name: 'Default (no configuration)',
							owner_user_id: 1,
							proxy_host_count: 0,
							proxy_hosts: [],
							satisfy_any: 0,
							pass_auth: 0,
							created_on: '2019-01-01 01:00:00',
							updated_on: '2019-01-01 01:00:00',
							_can_edit: false,
							_can_delete: false
						});
					}
				}

				return rows;
			});
	},

	/**
	 * Used in the GET /api/nginx/access-lists/1 endpoint
	 *
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @return {Promise}
	 */
	get: (access, data) => {
		return access.can('access_lists:get', data)
			.then(() => {
				if (data.id === 0) {
					return {
						id: 0,
						name: 'Default (no configuration)',
						owner_user_id: 1,
						satisfy_any: 0,
						pass_auth: 0,
						clients: [],
						items: [],
						roles: []
					};
				} else {
					return accessListModel
						.query()
						.where('id', data.id)
						.first()
						.then((row) => {
							if (!row) {
								throw new error.ItemNotFoundError(data.id);
							}

							return internalAccessList.getClients(row.id)
								.then((clients) => {
									row.clients = clients || [];
									return internalAccessList.getItems(row.id);
								})
								.then((items) => {
									row.items = items || [];
									return internalAccessList.getRoles(row.id);
								})
								.then((roles) => {
									row.roles = roles || [];
									return internalNginx.getProxyHostsForAccessList(access, row.id);
								})
								.then((hosts) => {
									row.proxy_hosts = hosts || [];
									return row;
								});
						});
				}
			});
	},

	/**
	 * Used for getting access list auth items
	 *
	 * @param {integer} list_id
	 * @returns {Promise}
	 */
	getItems: (list_id) => {
		return accessListAuthModel
			.query()
			.where('access_list_id', list_id)
			.then((items) => {
				// Only check basic auth items for password hints
				const basicAuthItems = (items || []).filter(item => !item.auth_type || item.auth_type === 'basic');

				if (basicAuthItems.length) {
					// Add a password hint to each item
					basicAuthItems.map((item, idx) => {
						const repeat_for = Math.floor((item.password || '').length / 2);
						const first_char = (item.password || '').charAt(0);

						item.hint = first_char + '*'.repeat(repeat_for);
						item.password = '';
					});
				}

				return items;
			});
	},

	/**
	 * Used for getting access list client items
	 *
	 * @param {integer} list_id
	 * @returns {Promise}
	 */
	getClients: (list_id) => {
		return accessListClientModel
			.query()
			.where('access_list_id', list_id);
	},

	/**
	 * Used for getting access list role items
	 *
	 * @param {integer} list_id
	 * @returns {Promise}
	 */
	getRoles: (list_id) => {
		return accessListRoleModel
			.query()
			.where('access_list_id', list_id);
	},

	/**
	 * Used in the POST /api/nginx/access-lists endpoint
	 *
	 * @param {Access}  access
	 * @param {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		return access
			.can('access_lists:create', data)
			.then(() => {
				return accessListModel
					.query()
					.insertAndFetch({
						name: data.name,
						satisfy_any: data.satisfy_any,
						pass_auth: data.pass_auth,
						owner_user_id: access.token.getUserId(1)
					});
			})
			.then((row) => {
				let promises = [];

				// If auth items are provided
				if (typeof data.items !== 'undefined' && data.items.length) {
					data.items.map((item) => {
						if (item.auth_type === 'basic') {
							promises.push(accessListAuthModel
								.query()
								.insert({
									access_list_id: row.id,
									auth_type: 'basic',
									username: item.username,
									password: md5(item.password)
								})
							);
						} else if (item.auth_type === 'keycloak' || item.auth_type === 'authelia') {
							promises.push(accessListAuthModel
								.query()
								.insert({
									access_list_id: row.id,
									auth_type: item.auth_type,
									provider_url: item.provider_url,
									client_id: item.client_id,
									client_secret: item.client_secret,
									realm: item.realm,
									enable_mfa: item.enable_mfa ? 1 : 0,
									enable_otp: item.enable_otp ? 1 : 0
								})
							);
						}
					});
				}

				// If client access allow/deny is provided
				if (typeof data.clients !== 'undefined' && data.clients.length) {
					data.clients.map((client) => {
						promises.push(accessListClientModel
							.query()
							.insert({
								access_list_id: row.id,
								address: client.address,
								directive: client.directive
							})
						);
					});
				}

				// If RBAC roles are provided
				if (typeof data.roles !== 'undefined' && data.roles.length) {
					data.roles.map((role) => {
						promises.push(accessListRoleModel
							.query()
							.insert({
								access_list_id: row.id,
								name: role.name,
								permissions: JSON.stringify(role.permissions || {})
							})
						);
					});
				}

				return Promise.all(promises)
					.then(() => {
						return internalAccessList.get(access, { id: row.id });
					});
			});
	},

	/**
	 * Used in the PUT /api/nginx/access-lists/1 endpoint
	 *
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		return access.can('access_lists:update', data)
			.then(() => {
				if (data.id === 0) {
					throw new error.ItemNotFoundError(data.id);
				}

				return accessListModel
					.query()
					.where('id', data.id)
					.first()
					.then((row) => {
						if (!row) {
							throw new error.ItemNotFoundError(data.id);
						}

						return accessListModel
							.query()
							.where('id', data.id)
							.patch({
								name: data.name,
								satisfy_any: data.satisfy_any,
								pass_auth: data.pass_auth
							});
					})
					.then(() => {
						// Items Remove/Create
						let promises = [];
						const itemIds = _.map(data.items, 'id');

						// Iterate existing items
						return internalAccessList.getItems(data.id)
							.then((auth_items) => {
								// Remove missing
								if (auth_items && auth_items.length) {
									auth_items.map((item) => {
										if (!item.id || !itemIds.includes(item.id.toString())) {
											promises.push(accessListAuthModel
												.query()
												.where('id', item.id)
												.del()
											);
										}
									});
								}

								// Parse items from the request
								if (typeof data.items !== 'undefined' && data.items.length) {
									data.items.map((item) => {
										if (item.id) {
											// Edit
											if (item.auth_type === 'basic') {
												// When updating a basic auth item
												let updateData = {
													auth_type: 'basic',
													username: item.username
												};

												if (item.password && item.password !== '') {
													updateData.password = md5(item.password);
												}

												promises.push(accessListAuthModel
													.query()
													.where('id', item.id)
													.patch(updateData)
												);
											} else if (item.auth_type === 'keycloak' || item.auth_type === 'authelia') {
												// When updating an OAuth2 provider
												promises.push(accessListAuthModel
													.query()
													.where('id', item.id)
													.patch({
														auth_type: item.auth_type,
														provider_url: item.provider_url,
														client_id: item.client_id,
														client_secret: item.client_secret,
														realm: item.realm,
														enable_mfa: item.enable_mfa ? 1 : 0,
														enable_otp: item.enable_otp ? 1 : 0
													})
												);
											}
										} else {
											// Create
											if (item.auth_type === 'basic') {
												promises.push(accessListAuthModel
													.query()
													.insert({
														access_list_id: data.id,
														auth_type: 'basic',
														username: item.username,
														password: md5(item.password)
													})
												);
											} else if (item.auth_type === 'keycloak' || item.auth_type === 'authelia') {
												promises.push(accessListAuthModel
													.query()
													.insert({
														access_list_id: data.id,
														auth_type: item.auth_type,
														provider_url: item.provider_url,
														client_id: item.client_id,
														client_secret: item.client_secret,
														realm: item.realm,
														enable_mfa: item.enable_mfa ? 1 : 0,
														enable_otp: item.enable_otp ? 1 : 0
													})
												);
											}
										}
									});
								}
							});
					})
					.then(() => {
						// Clients Remove/Create
						let promises = [];

						// All new clients will be just created
						const clientIds = _.map(data.clients, 'id');

						// Iterate existing clients
						return internalAccessList.getClients(data.id)
							.then((clients) => {
								// Remove missing
								if (clients && clients.length) {
									clients.map((client) => {
										if (!client.id || !clientIds.includes(client.id.toString())) {
											promises.push(accessListClientModel
												.query()
												.where('id', client.id)
												.del()
											);
										}
									});
								}

								// Parse clients from the request
								if (typeof data.clients !== 'undefined' && data.clients.length) {
									data.clients.map((client) => {
										if (client.id) {
											// Edit
											promises.push(accessListClientModel
												.query()
												.where('id', client.id)
												.patch({
													address: client.address,
													directive: client.directive
												})
											);
										} else {
											// Create
											promises.push(accessListClientModel
												.query()
												.insert({
													access_list_id: data.id,
													address: client.address,
													directive: client.directive
												})
											);
										}
									});
								}

								// Now process roles
								// Remove/Create roles
								const roleIds = _.map(data.roles, 'id');

								// Iterate existing roles
								return internalAccessList.getRoles(data.id)
									.then((roles) => {
										// Remove missing
										if (roles && roles.length) {
											roles.map((role) => {
												if (!role.id || !roleIds.includes(role.id.toString())) {
													promises.push(accessListRoleModel
														.query()
														.where('id', role.id)
														.del()
													);
												}
											});
										}

										// Parse roles from the request
										if (typeof data.roles !== 'undefined' && data.roles.length) {
											data.roles.map((role) => {
												if (role.id) {
													// Edit
													promises.push(accessListRoleModel
														.query()
														.where('id', role.id)
														.patch({
															name: role.name,
															permissions: JSON.stringify(role.permissions || {})
														})
													);
												} else {
													// Create
													promises.push(accessListRoleModel
														.query()
														.insert({
															access_list_id: data.id,
															name: role.name,
															permissions: JSON.stringify(role.permissions || {})
														})
													);
												}
											});
										}
									});
							});
					})
					.then(() => {
						if (promises.length) {
							return Promise.all(promises)
								.then(() => {
									return internalNginx.reload();
								});
						}
					})
					.then(() => {
						return internalAccessList.get(access, { id: data.id });
					});
			});
	},

	/**
	 * Used in the DELETE /api/nginx/access-lists/1 endpoint
	 *
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @return {Promise}
	 */
	delete: (access, data) => {
		return access.can('access_lists:delete', data)
			.then(() => {
				if (data.id === 0) {
					throw new error.ItemNotFoundError(data.id);
				}

				return accessListModel
					.query()
					.where('id', data.id)
					.first()
					.then((row) => {
						if (!row) {
							throw new error.ItemNotFoundError(data.id);
						}

						row._can_delete = true;

						if (!row._can_delete) {
							throw new error.PermissionError('You do not have permission to delete one or more of the items assigned to this list');
						}

						return internalNginx.deleteAccessListFile(data)
							.then(() => {
								return accessListAuthModel
									.query()
									.where('access_list_id', data.id)
									.del();
							})
							.then(() => {
								return accessListClientModel
									.query()
									.where('access_list_id', data.id)
									.del();
							})
							.then(() => {
								return accessListRoleModel
									.query()
									.where('access_list_id', data.id)
									.del();
							})
							.then(() => {
								return accessListModel
									.query()
									.where('id', data.id)
									.del();
							})
							.then(() => {
								return true;
							});
					});
			});
	},

	/**
	 * @param   {Object}  list
	 * @param   {Integer} list.id
	 * @param   {String}  list.name
	 * @returns {Object}
	 */
	maskItems: (list) => {
		// If auth items are defined, mask their passwords
		if (list.items && list.items.length) {
			list.items.map((item, idx) => {
				if (item.password) {
					const repeat_for = Math.floor(item.password.length / 2);
					const first_char = item.password.charAt(0);

					list.items[idx].hint = first_char + '*'.repeat(repeat_for);
					list.items[idx].password = '';
				}
			});
		}

		return list;
	},

	/**
	 * @param   {Object}  list
	 * @param   {Integer} list.id
	 * @returns {String}
	 */
	getFilename: (list) => {
		return '/data/access/' + list.id;
	},

	/**
	 * @param   {Object}  list
	 * @param   {Integer} list.id
	 * @param   {String}  list.name
	 * @param   {Array}   list.items
	 * @returns {Promise}
	 */
	build: (list) => {
		logger.info('Building Access file #' + list.id + ' for: ' + list.name);

		// Add support for authentication providers
		const path = require('path');
		let NginxAuthHelper;

		// Try to load the auth helper if available
		try {
			NginxAuthHelper = require('../lib/auth/nginx');
		} catch (err) {
			logger.warn('Auth provider helpers not found, only basic auth will be supported');
		}

		return new Promise((resolve, reject) => {
			const htpasswd_file = internalAccessList.getFilename(list);

			// 1. remove any existing access file
			try {
				fs.unlinkSync(htpasswd_file);
			} catch (err) {
				// do nothing
			}

			// 2. create empty access file
			try {
				fs.writeFileSync(htpasswd_file, '', { encoding: 'utf8' });
				resolve(htpasswd_file);
			} catch (err) {
				reject(err);
			}
		}).then((htpasswd_file) => {
			// 3. generate password for each user
			if (list.items && list.items.length > 0) {
				// Basic auth processing
				const basicAuthItems = [];
				let keycloakItems = [];
				let autheliaItems = [];

				// Sort items by auth type
				list.items.forEach(item => {
					if (!item.auth_type || item.auth_type === 'basic') {
						basicAuthItems.push(item);
					} else if (item.auth_type === 'keycloak') {
						keycloakItems.push(item);
					} else if (item.auth_type === 'authelia') {
						autheliaItems.push(item);
					}
				});

				// Process provider configs if needed and helper is available
				if (NginxAuthHelper && (keycloakItems.length > 0 || autheliaItems.length > 0)) {
					logger.info('Processing auth providers for access list #' + list.id);

					try {
						// Generate combined auth and RBAC configuration
						const authConfig = NginxAuthHelper.generateAuthConfig(list, list.items, list.roles || []);
						if (authConfig) {
							fs.writeFileSync(htpasswd_file + '.providers', authConfig, { encoding: 'utf8' });
							logger.info('Generated auth provider and RBAC config for access list #' + list.id);
						}
					} catch (err) {
						logger.error('Error generating provider config: ' + err.message);
					}
				}

				// Save metadata for the access list
				const metadata = {
					id: list.id,
					name: list.name,
					satisfy: list.satisfy_any ? 'any' : 'all',
					pass_auth: typeof list.pass_auth === 'undefined' ? 0 : list.pass_auth,
					proxy_host_count: list.proxy_host_count || 0,
					has_keycloak: keycloakItems.length > 0,
					has_authelia: autheliaItems.length > 0,
					last_touched: Math.floor(new Date().getTime() / 1000)
				};

				fs.writeFileSync(
					htpasswd_file + '.json',
					JSON.stringify(metadata),
					{ encoding: 'utf8', mode: 0o600 }
				);

				// Process basic auth if we have any
				if (basicAuthItems.length > 0) {
					return new Promise((resolve, reject) => {
						batchflow(basicAuthItems)
							.sequential()
							.each((i, item, next) => {
								if (typeof item.password !== 'undefined' && item.password.length > 0) {
									logger.info('Adding basic auth user: ' + item.username);
									let line = item.username + ':' + item.password + '\n';
									fs.appendFile(htpasswd_file, line, (err) => {
										if (err) {
											return next(err);
										}
										next();
									});
								} else {
									next();
								}
							})
							.error((err) => {
								logger.error(err);
								reject(err);
							})
							.end(() => {
								logger.success('Built Basic Auth file #' + list.id + ' for: ' + list.name);
								resolve();
							});
					});
				} else {
					logger.info('No basic auth items for access list #' + list.id);
					return Promise.resolve();
				}
			} else {
				// No auth items at all
				return Promise.resolve();
			}
		});
	}
};

module.exports = internalAccessList;
