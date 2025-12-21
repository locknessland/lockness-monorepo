# Lockness JS - Copilot Instructions

You are an expert developer working on **Lockness JS**, a fullstack MVC framework for Deno. Lockness focuses on ergonomics, speed, and providing a structured development experience similar to Laravel, AdonisJS, or Symfony.

## 🎯 Project Overview
Lockness JS is powered by **HonoJS** for routing and middleware but abstracts it into a complete MVC (Model-View-Controller) architecture.

## 📂 Repository Structure
- **`lockness/`**: Core library source code. This is the package intended for publication.
- **Root & `src/`**: Framework boilerplate/template. This structure is what the CLI generates for new projects.
- **`docs/`**: Contains reference documentation and rules, including HonoJS docs, for AI assistance.


## 🚀 Core Philosophy
- **Deno First**: Use native Deno features. No `node_modules`. Use TypeScript natively.
- **MVC Architecture**: Strictly separate business logic (Controllers), data (Models), and display (Views).
- **Inspiration**: Follow patterns and naming conventions inspired by **Laravel** and **AdonisJS**.
- **Performance**: Leverage HonoJS under the hood for maximum speed.

## 🛠 Technical Stack & Rules
- **Runtime**: Deno
- **Routing**: Expressive routing based on Hono but adapted for MVC.
- **Logic**: Use Controllers for all request handling logic.
- **Middleware**: Use robust middleware support for cross-cutting concerns.
- **Views**: Use JSX as the primary view engine.
- **Dependency Injection**: Utilize DI for managing services and dependencies.
- **Database**: Use the integrated ORM / Query Builder (as defined in the project).

## 📝 Coding Standards
- Write clean, expressive, and ergonomic code.
- Ensure all components are modular and follow the MVC pattern.
- Prioritize security and modern tooling provided by Deno.
- When generating code, skip explanations unless asked, and focus on providing complete, functional MVC components.
