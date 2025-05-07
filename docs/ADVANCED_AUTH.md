# Advanced Authentication Configuration

This document describes how to configure and use the advanced authentication features in Zinx Gateway, including Multi-Factor Authentication (MFA), Role-Based Access Control (RBAC), and One-Time Password (OTP) authentication using Keycloak and Authelia providers.

## Overview

Zinx Gateway supports three authentication methods for protecting your proxy hosts:

1. **Basic Authentication** - Simple username/password authentication
2. **Keycloak** - Advanced OAuth2/OpenID Connect authentication with MFA and RBAC
3. **Authelia** - Lightweight authentication server with MFA and RBAC

## Configuration

### Basic Authentication

The default authentication method is Basic Authentication, which requires a username and password.

1. Create a new Access List or edit an existing one
2. Go to the "Authorization" tab and select "Basic Auth"
3. Add one or more username/password pairs
4. Assign the Access List to your proxy host

### Keycloak Authentication

[Keycloak](https://www.keycloak.org/) is an open-source Identity and Access Management solution that provides OAuth2 and OpenID Connect capabilities.

1. Setup a Keycloak server
2. Create a new client in Keycloak:
   - Client ID: `nginx-proxy` (or any name you prefer)
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`
   - Valid Redirect URIs: Add your proxy host domains (e.g., `https://example.com/*`)
   - Get the client secret from the "Credentials" tab

3. In Zinx Gateway, create a new Access List or edit an existing one
4. Go to the "Authorization" tab and select "Keycloak"
5. Configure the following fields:
   - Keycloak Server URL: URL of your Keycloak server (e.g., `https://keycloak.example.com/auth`)
   - Realm: Your Keycloak realm (e.g., `master`)
   - Client ID: The client ID you created in Keycloak
   - Client Secret: The client secret from Keycloak
   - Enable MFA: Check this to enable Multi-Factor Authentication
   - Enable OTP: Check this to enable One-Time Password authentication

6. Assign the Access List to your proxy host

### Authelia Authentication

[Authelia](https://www.authelia.com/) is a lightweight authentication and authorization server.

1. Setup an Authelia server
2. Configure OpenID Connect:
   - Client ID: `nginx-proxy` (or any name you prefer)
   - Client Secret: Generate a secure random string
   - Redirect URIs: Add your proxy host domains (e.g., `https://example.com/*`)

3. In Zinx Gateway, create a new Access List or edit an existing one
4. Go to the "Authorization" tab and select "Authelia"
5. Configure the following fields:
   - Authelia Server URL: URL of your Authelia server (e.g., `https://authelia.example.com`)
   - Client ID: The client ID you configured in Authelia
   - Client Secret: The client secret from Authelia
   - Enable MFA: Check this to enable Multi-Factor Authentication
   - Enable OTP: Check this to enable One-Time Password authentication

6. Assign the Access List to your proxy host

## Role-Based Access Control (RBAC)

Zinx Gateway supports Role-Based Access Control when using Keycloak or Authelia providers. This allows you to restrict access based on user roles.

1. Create a new Access List or edit an existing one
2. Configure either Keycloak or Authelia as described above
3. Go to the "Roles (RBAC)" tab
4. Add roles with specific permissions:
   - Role Name: Name of the role (e.g., `admin`, `editor`, `viewer`)
   - Permissions: Select the permissions for this role:
     - View Content: Allow viewing the content
     - Edit Content: Allow editing the content
     - Admin Access: Allow administrative functions

5. In your Keycloak or Authelia configuration, assign these roles to your users
6. The roles will be automatically mapped when users authenticate

## Headers

When using Keycloak or Authelia authentication, Zinx Gateway sets the following headers on requests to your backend services:

- `X-Auth-User`: The authenticated username
- `X-Auth-Role`: The user's role
- `X-Auth-Email`: The user's email (if available)
- `X-Auth-Name`: The user's full name (if available)
- `X-Auth-Can-View`: Whether the user has view permission (1 or 0)
- `X-Auth-Can-Edit`: Whether the user has edit permission (1 or 0)
- `X-Auth-Can-Admin`: Whether the user has admin permission (1 or 0)

Your backend application can use these headers to implement fine-grained authorization controls.

## Troubleshooting

### NGINX Configuration

The NGINX configuration for advanced authentication is stored in:
- `/data/access/<access_list_id>.providers` - Provider-specific configuration
- `/data/access/<access_list_id>` - Basic auth configuration (if used)

### Common Issues

1. **Redirects not working**: Ensure your Keycloak/Authelia server is accessible from the internet and configured with the correct redirect URIs.

2. **Authentication fails**: Check that the client ID and client secret are correct.

3. **RBAC not working**: Ensure that users have the correct roles assigned in Keycloak/Authelia, and that those roles match the role names configured in Zinx Gateway.

4. **MFA not prompting**: Make sure MFA is enabled for the user in Keycloak/Authelia.

## Security Considerations

1. Always use HTTPS for both Zinx Gateway and your authentication providers.
2. Use strong, unique client secrets.
3. Regularly review access logs.
4. Consider implementing IP restrictions alongside authentication for sensitive applications.
