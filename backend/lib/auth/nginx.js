/**
 * NGINX Auth Configuration Helper
 * This helper generates NGINX configuration for different authentication providers
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../logger').global;
const { createAuthProvider } = require('./providers');

/**
 * Generate NGINX authentication configuration for different providers
 */
class NginxAuthHelper {
  /**
   * Generate auth configuration for a specific access list
   * 
   * @param {Object} accessList - The access list object
   * @param {Array} authItems - The auth items associated with this access list
   * @returns {String} - NGINX configuration
   */
  static generateAuthConfig(accessList, authItems, roles = []) {
    let config = '';
    
    // If we have no auth items, return empty config
    if (!authItems || authItems.length === 0) {
      return config;
    }

    // Keep track of auth providers we've used
    const usedProviders = new Set();
    let activeAuthType = null;
    
    // Figure out if we need satisfy_any
    const satisfyAny = accessList.satisfy_any === 1;
    if (satisfyAny) {
      config += 'satisfy any;\n';
    }

    // Add each auth configuration
    for (const authItem of authItems) {
      try {
        // Handle basic auth directly
        if (authItem.auth_type === 'basic') {
          // Basic auth configuration is handled separately
          // We only add basic auth users here
        }
        else {
          // For Keycloak or Authelia, we use the provider's NGINX config
          const provider = createAuthProvider(authItem);
          
          // Validate provider config
          provider.validateConfig();
          
          // Get provider-specific NGINX config
          const providerConfig = provider.getNginxConfig();
          
          // Only add provider config once
          if (providerConfig && !usedProviders.has(authItem.auth_type)) {
            config += providerConfig;
            usedProviders.add(authItem.auth_type);
            
            // Keep track of the active auth type for RBAC integration
            if (!activeAuthType && (authItem.auth_type === 'keycloak' || authItem.auth_type === 'authelia')) {
              activeAuthType = authItem.auth_type;
            }
          }
        }
      } catch (error) {
        logger.error(`Error generating auth config: ${error.message}`);
      }
    }
    
    // Add RBAC configuration if we have roles and an active auth provider that supports RBAC
    if (roles && roles.length > 0 && activeAuthType && (activeAuthType === 'keycloak' || activeAuthType === 'authelia')) {
      config += this.generateRbacConfig(roles, activeAuthType);
    }

    return config;
  }

  /**
   * Generate htpasswd file content for basic auth
   * 
   * @param {Array} authItems - The auth items with username/password
   * @returns {String} - htpasswd file content
   */
  static generateHtpasswd(authItems) {
    // Filter to basic auth only
    const basicAuthItems = authItems.filter(item => item.auth_type === 'basic');
    
    if (basicAuthItems.length === 0) {
      return '';
    }
    
    // Return htpasswd content
    return basicAuthItems
      .map(item => `${item.username}:${item.password}`)
      .join('\n');
  }

  /**
   * Generate RBAC configuration for role-based access
   * 
   * @param {Array} roles - Role configurations
   * @param {String} authType - Authentication provider type
   * @returns {String} - NGINX configuration for RBAC
   */
  static generateRbacConfig(roles, authType) {
    if (!roles || roles.length === 0) {
      return '';
    }

    let config = '';
    
    // Add role-based access control configuration based on authentication provider
    if (authType === 'keycloak' || authType === 'authelia') {
      config += `
      # Role-Based Access Control Configuration
      map $role $is_allowed {
        default 0;`;

      for (const role of roles) {
        config += `
        ${role.name} 1;`;
      }

      config += `
      }
      
      # Deny access if role doesn't match
      if ($is_allowed = 0) {
        return 403;
      }
      
      # Add permission headers based on role
      set $can_view 0;
      set $can_edit 0;
      set $can_admin 0;
`;

      // Add permission mapping for each role
      for (const role of roles) {
        if (role.permissions.view) {
          config += `      if ($role = "${role.name}") { set $can_view 1; }\n`;
        }
        if (role.permissions.edit) {
          config += `      if ($role = "${role.name}") { set $can_edit 1; }\n`;
        }
        if (role.permissions.admin) {
          config += `      if ($role = "${role.name}") { set $can_admin 1; }\n`;
        }
      }
      
      // Add permission headers
      config += `
      # Set permission headers
      proxy_set_header X-Auth-Can-View $can_view;
      proxy_set_header X-Auth-Can-Edit $can_edit;
      proxy_set_header X-Auth-Can-Admin $can_admin;
      `;
    }

    return config;
  }
}

module.exports = NginxAuthHelper;
