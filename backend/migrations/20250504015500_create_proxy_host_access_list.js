'use strict';

const migrationName = 'create_proxy_host_access_list';

/**
 * Create the proxy_host_access_list relation table.
 *
 * @param {object} knex
 * @returns {Promise}
 */
exports.up = function (knex) {
  return knex.schema.hasTable('proxy_host_access_list')
    .then((exists) => {
      if (!exists) {
        return knex.schema.createTable('proxy_host_access_list', (table) => {
          table.increments().primary();
          table.integer('proxy_host_id').unsigned();
          table.integer('access_list_id').unsigned();
          table.unique(['proxy_host_id', 'access_list_id']);
          table.timestamps();

          // Add foreign keys separately after table creation for better compatibility
          table.foreign('proxy_host_id').references('id').inTable('proxy_host').onDelete('CASCADE');
          table.foreign('access_list_id').references('id').inTable('access_list').onDelete('CASCADE');
        })
        .then(() => {
          console.log(`[${migrationName}] proxy_host_access_list Table created`);
        });
      } else {
        console.log(`[${migrationName}] proxy_host_access_list Table already exists, skipping`);
        return Promise.resolve();
      }
    });
};

/**
 * Drop the proxy_host_access_list relation table.
 *
 * @param {object} knex
 * @returns {Promise}
 */
exports.down = function (knex) {
  return knex.schema.hasTable('proxy_host_access_list')
    .then((exists) => {
      if (exists) {
        return knex.schema.dropTable('proxy_host_access_list')
          .then(() => {
            console.log(`[${migrationName}] proxy_host_access_list Table dropped`);
          });
      } else {
        console.log(`[${migrationName}] proxy_host_access_list Table doesn't exist, skipping`);
        return Promise.resolve();
      }
    });
};
