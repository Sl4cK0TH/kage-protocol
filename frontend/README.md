# The Kage Protocol Frontend

## Overview

The Kage Protocol Frontend is the admin dashboard for a CTF challenge infrastructure. It provides a cyberpunk command center to manage "Jutsus" (challenge definitions), "Shadow Clones" (running containers), and "Chakra Control" (global spawn settings).

## Use Case

- Admins define Docker-based challenges and set runtime limits.
- The platform spawns isolated containers on-demand for players via the backend API.
- Admins monitor live containers, view logs, and kill instances.

## Installation Guide

1) Install dependencies:

```bash
npm install
```

2) Create a local environment file:

```bash
cp .env.example .env
```

3) Start the dev server:

```bash
npm run dev
```

4) Open the app:

```text
http://localhost:3000
```

## Dependencies

- Next.js (App Router)
- React
- Tailwind CSS
- TypeScript

## Commands

- `npm run dev` - start the development server
- `npm run build` - build for production
- `npm run start` - run the production build
- `npm run lint` - run Next.js lint checks

## Basic Configuration

Set these values in `.env`:

- `NEXT_PUBLIC_API_BASE` - base URL for the FastAPI backend (default: `http://localhost:8000`)
- `NEXT_PUBLIC_SESSION_COOKIE_NAME` - cookie name used by the admin session (default: `kage_session`)

## Project Structure

- `src/app` - app router pages and layouts
- `src/components` - shared UI components
- `src/lib` - API client and types

## Notes

- The admin dashboard relies on HTTP-only cookies set by the backend `/api/auth/login` route.
- The backend must allow CORS for the frontend origin.
