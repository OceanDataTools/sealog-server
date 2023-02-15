FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

# Copy configuration files
COPY config/db_constants.js.dist config/db_constants.js
COPY config/email_constants.js.dist config/email_constants.js
COPY config/manifest.js.dist config/manifest.js
COPY config/path_constants.js.dist config/path_constants.js
COPY config/secret.js.dist config/secret.js

EXPOSE 8000

CMD [ "npm", "run", "start" ]
