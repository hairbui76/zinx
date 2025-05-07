# syntax=docker/dockerfile:1.4
# Optimized Dockerfile for Zinx Gateway with faster build times
# This implements layer caching, parallel operations, and build optimizations

# -----------------------------------------------------------------------------
# FRONTEND BUILD STAGE - Split into dep install and build for better caching
# -----------------------------------------------------------------------------
FROM --platform=linux/amd64 alpine:3.21.3 AS frontend-deps
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
WORKDIR /app

# Install essential dependencies for frontend build including Python for node-gyp
RUN apk add --no-cache nodejs yarn git python3 python3-dev py3-setuptools make g++ build-base

# Copy only package files for dependency layer caching
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile

# Build frontend with already installed dependencies
FROM frontend-deps AS frontend-build
ARG NODE_ENV=production
WORKDIR /app

# Copy source after dependencies installed (better caching)
COPY frontend ./
COPY global/certbot-dns-plugins.json ./certbot-dns-plugins.json

# Build with optimized settings
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN GENERATE_SOURCEMAP=false yarn build
COPY darkmode.css ./dist/css/darkmode.css
COPY security.txt ./dist/.well-known/security.txt

# -----------------------------------------------------------------------------
# BACKEND BUILD STAGE - With optimized dependency caching
# -----------------------------------------------------------------------------
FROM --platform=linux/amd64 alpine:3.21.3 AS backend-deps
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
WORKDIR /app

# Minimal backend dependencies
RUN apk add --no-cache nodejs yarn

# Copy only package files for dependency layer caching
COPY backend/package.json backend/yarn.lock ./
RUN yarn global add clean-modules

# Backend build with architecture-specific optimizations
FROM backend-deps AS backend-build
ARG NODE_ENV=production \
    TARGETARCH
WORKDIR /app

# Install dependencies based on architecture in a single step
RUN yarn install --frozen-lockfile

# Copy backend code after dependencies installed
COPY backend ./
COPY global/certbot-dns-plugins.json ./certbot-dns-plugins.json

# Clean up unused files to reduce image size
RUN yarn cache clean && \
    clean-modules --yes

# Strip backend binaries to further reduce size
FROM alpine:3.21.3 AS strip-backend
RUN apk add --no-cache ca-certificates binutils file
COPY --from=backend-build /app /app
RUN find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \;

# Create data directory and set permissions
RUN mkdir -p /data && chmod 777 /data

# -----------------------------------------------------------------------------
# CROWDSEC STAGE - Optimized clone and build
# -----------------------------------------------------------------------------
FROM --platform=linux/amd64 alpine:3.21.3 AS crowdsec
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG CSNB_VER=v1.1.1
WORKDIR /src

# Install dependencies
RUN apk add --no-cache ca-certificates git build-base

# Clone with depth=1 to speed up, build and configure in a single layer
RUN git clone --recursive --depth 1 --branch "$CSNB_VER" https://github.com/crowdsecurity/cs-nginx-bouncer /src && \
    make && \
    tar xzf crowdsec-nginx-bouncer.tgz && \
    mv crowdsec-nginx-bouncer-* crowdsec-nginx-bouncer && \
    # Batch sed operations for better performance
    sed -i \
    -e "/lua_package_path/d" \
    -e "s|/etc/crowdsec/bouncers/crowdsec-nginx-bouncer.conf|/data/crowdsec/crowdsec.conf|g" \
    -e "s|crowdsec-nginx-bouncer|crowdsec-zinx-gateway-bouncer|g" \
    /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i \
    -e "s|API_KEY=.*|API_KEY=|g" \
    -e "s|ENABLED=.*|ENABLED=false|g" \
    -e "s|API_URL=.*|API_URL=http://127.0.0.1:8080|g" \
    -e "s|BAN_TEMPLATE_PATH=.*|BAN_TEMPLATE_PATH=/data/crowdsec/ban.html|g" \
    -e "s|CAPTCHA_TEMPLATE_PATH=.*|CAPTCHA_TEMPLATE_PATH=/data/crowdsec/captcha.html|g" \
    -e "s|APPSEC_URL=.*|APPSEC_URL=http://127.0.0.1:7422|g" \
    -e "s|APPSEC_FAILURE_ACTION=.*|APPSEC_FAILURE_ACTION=deny|g" \
    -e "s|REQUEST_TIMEOUT=.*|REQUEST_TIMEOUT=2500|g" \
    -e "s|APPSEC_CONNECT_TIMEOUT=.*|APPSEC_CONNECT_TIMEOUT=1000|g" \
    -e "s|APPSEC_SEND_TIMEOUT=.*|APPSEC_SEND_TIMEOUT=30000|g" \
    -e "s|APPSEC_PROCESS_TIMEOUT=.*|APPSEC_PROCESS_TIMEOUT=10000|g" \
    /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf

# -----------------------------------------------------------------------------
# FINAL IMAGE - Optimized layer sequence and parallel operations
# -----------------------------------------------------------------------------
FROM zoeyvid/nginx-quic:483-python
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ENV NODE_ENV=production
ARG CRS_VER=v4.14.0

# Copy files in logical groups for better caching
COPY rootfs /
COPY --from=strip-backend /app /app
WORKDIR /app

# Divided into multiple RUN commands to leverage Docker build cache better
# Install core dependencies
RUN apk add --no-cache ca-certificates tzdata tini curl util-linux-misc \
    nodejs bash nano logrotate goaccess fcgi \
    lua5.1-lzlib lua5.1-socket coreutils grep findutils jq shadow su-exec

# Get OCSP fetcher (separate layer for better caching)
RUN curl -sSL https://raw.githubusercontent.com/tomwassenberg/certbot-ocsp-fetcher/refs/heads/main/certbot-ocsp-fetcher \
    -o /usr/local/bin/certbot-ocsp-fetcher.sh && \
    sed -i "s|/live||g" /usr/local/bin/certbot-ocsp-fetcher.sh && \
    chmod +x /usr/local/bin/certbot-ocsp-fetcher.sh

# Install Lua dependencies in a separate layer
RUN apk add --no-cache luarocks5.1 lua5.1-dev lua5.1-sec build-base && \
    luarocks-5.1 install lua-cjson && \
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-resty-string && \
    luarocks-5.1 install lua-resty-openssl && \
    luarocks-5.1 install lua-resty-openidc && \
    apk del luarocks5.1 lua5.1-dev lua5.1-sec build-base

# Setup CRS in a separate layer
RUN apk add --no-cache git && \
    git clone --depth 1 --branch "$CRS_VER" https://github.com/coreruleset/coreruleset /tmp/coreruleset && \
    mkdir -p /usr/local/nginx/conf/conf.d/include/coreruleset && \
    cp -r /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/ && \
    cp -r /tmp/coreruleset/plugins /usr/local/nginx/conf/conf.d/include/coreruleset/ && \
    cp -r /tmp/coreruleset/rules /usr/local/nginx/conf/conf.d/include/coreruleset/ && \
    rm -rf /tmp/coreruleset && \
    apk del git

# Finalize setup
RUN apk add --no-cache yarn && \
    yarn global add nginxbeautifier && \
    yarn cache clean && \
    apk del yarn && \
    ln -sf /app/password-reset.js /usr/local/bin/ && \
    ln -sf /app/sqlite-vaccum.js /usr/local/bin/ && \
    ln -sf /app/index.js /usr/local/bin/

# Copy artifacts from previous stages
COPY --from=frontend-build /app/dist /html/frontend
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf /usr/local/nginx/conf/conf.d/include/crowdsec.conf
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/templates/captcha.html /usr/local/nginx/conf/conf.d/include/captcha.html
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/templates/ban.html /usr/local/nginx/conf/conf.d/include/ban.html
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/lib/crowdsec.lua /usr/local/nginx/lib/lua/crowdsec.lua
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/lib/plugins /usr/local/nginx/lib/lua/plugins

# Expose ports for the Zinx Gateway web interface and proxied services
EXPOSE 80 443 81

ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD healthcheck.sh
