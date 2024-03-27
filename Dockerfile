# Use the latest Node.js Alpine image as the base image
FROM node:alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Copy configuration files
COPY config/db_constants.js.dist config/db_constants.js
COPY config/email_constants.js.dist config/email_constants.js
COPY config/manifest.js.dist config/manifest.js
COPY config/path_constants.js.dist config/path_constants.js
COPY config/secret.js.dist config/secret.js

# Expose port 8000 (This needs to match what's in the ./config/manifest.js file)
# EXPOSE 8000

# Command to run the Node.js application
CMD [ "node", "server.js" ]