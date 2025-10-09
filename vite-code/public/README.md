# Public Assets

This directory contains static assets that are served directly by the application.

## Logo Files

To replace the text-based logo with actual logo images, place the following files in this directory:

- **flip-safe-logo-with-name.png** - Full logo with company name (used on desktop)
- **flip-safe-logo-without-name.png** - Icon-only logo (used on mobile)

### Recommended Specifications:

- **flip-safe-logo-with-name.png**:

  - Height: ~32px (or higher for retina displays)
  - Format: PNG with transparent background
  - Contains both icon and "Flip Safe" text

- **flip-safe-logo-without-name.png**:
  - Size: ~32x32px (square, or higher for retina displays)
  - Format: PNG with transparent background
  - Icon/symbol only

Once these files are added, update the Header component to use:

```tsx
<img
  src="/flip-safe-logo-with-name.png"
  alt="Flip Safe"
  className="hidden md:block h-8"
/>
<img
  src="/flip-safe-logo-without-name.png"
  alt="Flip Safe"
  className="block md:hidden h-8 w-8"
/>
```

## Other Assets

Place any other static assets (images, fonts, etc.) that need to be publicly accessible in this directory.
