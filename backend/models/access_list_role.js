// Objection Docs:
// http://vincit.github.io/objection.js/

const db = require('../db');
const Model = require('objection').Model;
const now = require('./now_helper');

Model.knex(db);

class AccessListRole extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}

		// Default for permissions
		if (typeof this.permissions === 'undefined') {
			this.permissions = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get name() {
		return 'AccessListRole';
	}

	static get tableName() {
		return 'access_list_role';
	}

	static get jsonAttributes() {
		return ['meta', 'permissions'];
	}

	static get jsonSchema() {
		return {
			type: 'object',
			required: ['access_list_id', 'role_name'],
			properties: {
				id: { type: 'integer' },
				access_list_id: { type: 'integer' },
				role_name: { type: 'string' },
				permissions: { type: 'object' },
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
					from: 'access_list_role.access_list_id',
					to: 'access_list.id',
				},
				modify: function (qb) {
					qb.where('access_list.is_deleted', 0);
				},
			},
		};
	}
}

module.exports = AccessListRole;
