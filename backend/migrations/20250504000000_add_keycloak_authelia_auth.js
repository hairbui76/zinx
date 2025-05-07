const migrate_name = 'add-keycloak-authelia-auth';
const logger = require('../logger').migrate;

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.up = function(knex) {
  logger.info('[' + migrate_name + '] Migrating Up...');

  return knex.schema
    // Add auth_type and provider-specific fields to access_list_auth table
    .table('access_list_auth', function(table) {
      table.string('auth_type').notNull().defaultTo('basic');
      table.string('provider_url').nullable();
      table.string('client_id').nullable();
      table.string('client_secret').nullable();
      table.string('realm').nullable();
      table.boolean('enable_mfa').defaultTo(false);
      table.boolean('enable_otp').defaultTo(false);
    })
    // Create a new table for role-based access control
    .createTable('access_list_role', (table) => {
      table.increments().primary();
      table.dateTime('created_on').notNull();
      table.dateTime('modified_on').notNull();
      table.integer('access_list_id').notNull().unsigned();
      table.string('role_name').notNull();
      table.json('permissions').notNull();
      table.json('meta').notNull();
    })
    .then(() => {
      logger.info('[' + migrate_name + '] access_list_role Table created');
      
      // Add satisfy_any field to access_list table if it doesn't exist
      return knex.schema.hasColumn('access_list', 'satisfy_any')
        .then(exists => {
          if (!exists) {
            return knex.schema.table('access_list', function(table) {
              table.integer('satisfy_any').notNull().unsigned().defaultTo(0);
            });
          }
        });
    });
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.down = function(knex) {
  logger.info('[' + migrate_name + '] Migrating Down...');
  
  return knex.schema
    .table('access_list_auth', function(table) {
      table.dropColumn('auth_type');
      table.dropColumn('provider_url');
      table.dropColumn('client_id');
      table.dropColumn('client_secret');
      table.dropColumn('realm');
      table.dropColumn('enable_mfa');
      table.dropColumn('enable_otp');
    })
    .dropTableIfExists('access_list_role');
};
