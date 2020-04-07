FROM node:12

WORKDIR /usr/src/app

# Install packages
COPY package*.json ./
RUN npm install

# Copy sources
COPY . .

# Copy configuration files
COPY config/db_constants.js.dist config/db_constants.js
COPY config/email_constants.js.dist config/email_constants.js
COPY config/manifest.js.dist config/manifest.js
COPY config/path_constants.js.dist config/path_constants.js
COPY config/secret.js.dist config/secret.js

# Patch the configuration
RUN sed -i \
        -e 's,mongodb://localhost:27017/,mongodb://mongo/,' \
        config/manifest.js

# TODO: Generate a new secret?

# Expose the API port (defined in config/manifest.js)
EXPOSE 8000

# By default, run in production mode
CMD [ "npm", "run", "start" ]
