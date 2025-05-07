// Objection Docs:
// http://vincit.github.io/objection.js/

const db = require('../db');
const Model = require('objection').Model;
const now = require('./now_helper');

Model.knex(db);

class AccessListAuth extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}

		// Set default auth_type if not provided
		if (typeof this.auth_type === 'undefined') {
			this.auth_type = 'basic';
		}

		// Initialize provider-specific fields if needed
		if (this.auth_type === 'keycloak' || this.auth_type === 'authelia') {
			// For non-basic auth types, password and username might be optional
			if (typeof this.username === 'undefined') {
				this.username = '';
			}
			if (typeof this.password === 'undefined') {
				this.password = '';
			}
		}

		// Initialize MFA and OTP settings
		if (typeof this.enable_mfa === 'undefined') {
			this.enable_mfa = false;
		}
		if (typeof this.enable_otp === 'undefined') {
			this.enable_otp = false;
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get name() {
		return 'AccessListAuth';
	}

	static get tableName() {
		return 'access_list_auth';
	}

	static get jsonAttributes() {
		return ['meta'];
	}

	// Define validation rules for different auth types
	static get jsonSchema() {
		return {
			type: 'object',
			required: ['access_list_id', 'auth_type'],
			properties: {
				id: { type: 'integer' },
				access_list_id: { type: 'integer' },
				auth_type: { type: 'string', enum: ['basic', 'keycloak', 'authelia'] },
				username: { type: ['string', 'null'] },
				password: { type: ['string', 'null'] },
				provider_url: { type: ['string', 'null'] },
				client_id: { type: ['string', 'null'] },
				client_secret: { type: ['string', 'null'] },
				realm: { type: ['string', 'null'] },
				enable_mfa: { type: 'boolean' },
				enable_otp: { type: 'boolean' },
				meta: { type: 'object' }
			}
		};
	}

	static get relationMappings() {
		return {
			access_list: {
				relation: Model.HasOneRelation,
				modelClass: require('./access_list'),
				join: {
					from: 'access_list_auth.access_list_id',
					to: 'access_list.id',
				},
				modify: function (qb) {
					qb.where('access_list.is_deleted', 0);
				},
			},
		};
	}
}

module.exports = AccessListAuth;
