# 1. Use an official Node.js runtime
FROM node:18

# 2. Set working directory
WORKDIR /app

# 3. Copy package files first (better caching)
COPY package.json package-lock.json ./

# 4. Install dependencies
RUN npm install

# 5. Copy the rest of the code
COPY . .

# 6. Build the Next.js app
RUN npm run build

# 7. Start the app
CMD ["npm", "start"]