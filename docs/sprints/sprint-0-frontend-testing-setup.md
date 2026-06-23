# Plan: Frontend Testing Setup — Vitest & React Testing Library

## Context
To ensure stability and verify future feature implementations, we need a reliable, fast unit and integration testing suite for our Next.js / React 19 UI component repository. 

We will configure **Vitest** (a modern, lightweight Jest-compatible test runner) combined with **React Testing Library** (RTL) and **jsdom** to simulate a browser environment.

---

## Package Setup & Dependencies
Install the following packages as development dependencies in the `ui` module:
- `vitest`: Modern test runner
- `@vitejs/plugin-react`: Vite plugin to parse React and JSX/TSX
- `jsdom`: Simulated browser environment
- `@testing-library/react`: Testing Library utilities for React components
- `@testing-library/jest-dom`: Custom DOM assertions (like `toBeInTheDocument`)

---

## Configuration Files

### 1. `ui/vitest.config.ts`
Configure the test runner settings:
- Environment: `jsdom`
- Plugin: `@vitejs/plugin-react`
- Aliases: Resolve `@/*` to `src/*`
- Setup file path: `./src/__tests__/setup.ts`

### 2. `ui/src/__tests__/setup.ts`
Extend global matchers by importing `@testing-library/jest-dom/vitest`.

### 3. `ui/package.json`
Add npm script triggers:
- `"test": "vitest run"` (single run execution)
- `"test:watch": "vitest"` (hot-reload watch mode)

---

## Verification & Validation

1. **Verify with a sample test file:** Create `ui/src/__tests__/sample.test.tsx` containing a basic component and DOM assertion.
2. **Execute tests:** Ensure `npm run test` compiles and passes.
3. **Type check:** Run `npx tsc --noEmit` to confirm there are no type-checking or path-resolution errors.
4. **Code Quality:** Ensure ESLint runs cleanly on the new configurations.
