# React + NestJS TypeScript Application

A full-stack application with a React frontend and NestJS backend, both using TypeScript.

## Project Structure

```
├── client/          # React frontend (TypeScript)
├── server/          # NestJS backend (TypeScript)
├── package.json     # Root package.json with scripts
└── README.md        # This file
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

1. Install dependencies for both frontend and backend:
   ```bash
   # Install root dependencies
   npm install
   
   # Install client dependencies
   cd client && npm install
   
   # Install server dependencies
   cd ../server && npm install
   ```

### Development

Run both frontend and backend in development mode:

```bash
# From the root directory
npm run dev
```

This will start:
- React frontend on http://localhost:3000
- NestJS backend on http://localhost:3001

### Individual Commands

#### Frontend (React)
```bash
cd client
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
```

#### Backend (NestJS)
```bash
cd server
npm run start:dev  # Start development server
npm run build      # Build for production
npm run start:prod # Start production server
npm test           # Run tests
```

### Production Build

```bash
npm run build
```

## Features

- **Frontend**: React with TypeScript, Create React App template
- **Backend**: NestJS with TypeScript, Express.js under the hood
- **CORS**: Configured for frontend-backend communication
- **Development**: Concurrent development servers with hot reload
- **TypeScript**: Full TypeScript support throughout the stack