/**
 * Authentication Providers Integration
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../logger').global;

/**
 * Base provider class that all auth providers extend
 */
class AuthProvider {
  constructor(config) {
    this.config = config;
  }

  /**
   * Get NGINX configuration for this provider
   * Should be implemented by each provider
   */
  getNginxConfig() {
    throw new Error('Not implemented');
  }

  /**
   * Validate provider configuration
   * Should be implemented by each provider
   */
  validateConfig() {
    throw new Error('Not implemented');
  }
}

/**
 * Basic Auth Provider (default)
 */
class BasicAuthProvider extends AuthProvider {
  constructor(config) {
    super(config);
  }

  validateConfig() {
    return true; // Basic auth is always valid
  }

  getNginxConfig() {
    // Basic auth is handled directly by NGINX built-in capabilities
    return null;
  }
}

/**
 * Keycloak Auth Provider
 */
class KeycloakAuthProvider extends AuthProvider {
  constructor(config) {
    super(config);
  }

  validateConfig() {
    if (!this.config.provider_url) {
      throw new Error('Keycloak provider URL is required');
    }
    if (!this.config.client_id) {
      throw new Error('Keycloak client ID is required');
    }
    if (!this.config.client_secret) {
      throw new Error('Keycloak client secret is required');
    }
    if (!this.config.realm) {
      throw new Error('Keycloak realm is required');
    }
    return true;
  }

  getNginxConfig() {
    const enableMfa = this.config.enable_mfa ? 'true' : 'false';
    const enableOtp = this.config.enable_otp ? 'true' : 'false';

    return `
    # Keycloak Authentication Configuration
    auth_request /auth/keycloak;
    auth_request_set $user $upstream_http_x_auth_user;
    auth_request_set $role $upstream_http_x_auth_role;
    auth_request_set $email $upstream_http_x_auth_email;
    auth_request_set $name $upstream_http_x_auth_name;
    
    # Add roles to headers for the backend
    proxy_set_header X-Auth-User $user;
    proxy_set_header X-Auth-Role $role;
    proxy_set_header X-Auth-Email $email;
    proxy_set_header X-Auth-Name $name;
    
    # Keycloak auth endpoint
    location = /auth/keycloak {
      internal;
      proxy_pass ${this.config.provider_url}/realms/${this.config.realm}/protocol/openid-connect/auth;
      proxy_pass_request_body off;
      proxy_set_header Content-Length "";
      proxy_set_header X-Original-URI $request_uri;
      proxy_set_header X-Client-ID "${this.config.client_id}";
      proxy_set_header X-Client-Secret "${this.config.client_secret}";
      proxy_set_header X-Enable-MFA "${enableMfa}";
      proxy_set_header X-Enable-OTP "${enableOtp}";
    }
    
    # Error handling
    error_page 401 = @error401;
    location @error401 {
      return 302 ${this.config.provider_url}/realms/${this.config.realm}/protocol/openid-connect/auth?client_id=${this.config.client_id}&response_type=code&redirect_uri=$scheme://$host$request_uri;
    }
    `;
  }
}

/**
 * Authelia Auth Provider
 */
class AutheliaAuthProvider extends AuthProvider {
  constructor(config) {
    super(config);
  }

  validateConfig() {
    if (!this.config.provider_url) {
      throw new Error('Authelia provider URL is required');
    }
    return true;
  }

  getNginxConfig() {
    const enableMfa = this.config.enable_mfa ? 'true' : 'false';
    const enableOtp = this.config.enable_otp ? 'true' : 'false';

    return `
    # Authelia Authentication Configuration
    auth_request /auth/authelia;
    auth_request_set $user $upstream_http_remote_user;
    auth_request_set $groups $upstream_http_remote_groups;
    auth_request_set $email $upstream_http_remote_email;
    auth_request_set $name $upstream_http_remote_name;
    
    # Map user groups to roles
    map $groups $role {
      default "";
      ~\badmin\b "admin";
      ~\beditor\b "editor";
      ~\bviewer\b "viewer";
    }
    
    # Add authorization headers for the backend
    proxy_set_header X-Auth-User $user;
    proxy_set_header X-Auth-Role $role;
    proxy_set_header X-Auth-Groups $groups;
    proxy_set_header X-Auth-Email $email;
    proxy_set_header X-Auth-Name $name;
    
    # Authelia auth endpoint
    location = /auth/authelia {
      internal;
      proxy_pass ${this.config.provider_url}/api/verify;
      proxy_pass_request_body off;
      proxy_set_header Content-Length "";
      proxy_set_header X-Original-URI $scheme://$http_host$request_uri;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Enable-MFA "${enableMfa}";
      proxy_set_header X-Enable-OTP "${enableOtp}";
    }
    
    # Error handling
    error_page 401 = @error401;
    location @error401 {
      return 302 ${this.config.provider_url}/api/verify?rd=$scheme://$http_host$request_uri;
    }
    `;
  }
}

/**
 * Factory to create the right provider based on auth_type
 */
function createAuthProvider(authConfig) {
  switch (authConfig.auth_type) {
    case 'basic':
      return new BasicAuthProvider(authConfig);
    case 'keycloak':
      return new KeycloakAuthProvider(authConfig);
    case 'authelia':
      return new AutheliaAuthProvider(authConfig);
    default:
      logger.error(`Unknown auth provider type: ${authConfig.auth_type}`);
      return new BasicAuthProvider(authConfig);
  }
}

module.exports = {
  createAuthProvider,
  AuthProvider,
  BasicAuthProvider,
  KeycloakAuthProvider,
  AutheliaAuthProvider
};
